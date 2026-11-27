/**
 * Refunds: a whole ticket order (with or without the booking fee) or a booking
 * deposit. Money paid through Paymob goes back through Paymob; anything else
 * (deposit marked paid by staff, cash) is recorded as given back by hand.
 * After a refund the order's QR codes stop working and its places are free
 * again (the waitlist hears about them).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { MANAGERS, parse, venueAccess } from '../lib/http.js';
import { AppError, conflict, notFound } from '../lib/errors.js';
import { refundTransaction } from '../integrations/paymob.js';
import { notifyGuest } from '../integrations/notify.js';
import { refundDone } from './guest-messages.js';
import { notifyWaitlist, waOn } from './waitlist.js';

type Payment = typeof schema.payments.$inferSelect;

async function paidPayment(purpose: 'tickets' | 'deposit', refId: string) {
  const [p] = await db.select().from(schema.payments)
    .where(and(eq(schema.payments.purpose, purpose), eq(schema.payments.refId, refId), eq(schema.payments.status, 'paid')))
    .orderBy(desc(schema.payments.paidAt)).limit(1);
  return p ?? null;
}

/** Send the money back through the provider. Throws a clear error the staff can read. */
async function giveBack(pay: Payment | null, amount: number) {
  if (!pay || amount <= 0) return { method: 'manual' as const, ref: null };
  if (!pay.providerTxnId) throw new AppError(409, 'no_transaction', 'This payment has no Paymob transaction to refund. Give the money back by hand.');
  try {
    const r = await refundTransaction(pay.providerTxnId, amount);
    return { method: 'paymob' as const, ref: r.ref };
  } catch (e) {
    throw new AppError(502, 'refund_failed', (e as Error).message);
  }
}

async function tellGuest(venueId: string, guestId: string | null, phone: string | null, email: string | null, x: Parameters<typeof refundDone>[2]) {
  const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, venueId));
  const [g] = guestId ? await db.select().from(schema.guests).where(eq(schema.guests.id, guestId)) : [];
  const msg = refundDone(v, { firstName: g?.firstName || 'there' }, x);
  await notifyGuest({ channel: waOn('xtra_refund') ? 'both' : 'email', phone, email, venueId, guestId: guestId ?? undefined, ...msg });
}

export default async function refunds(app: FastifyInstance) {
  /** Paid and refunded orders of an event, newest first, for the Orders list. */
  app.get<{ Params: { venueId: string; eventId: string } }>('/venues/:venueId/events/:eventId/orders', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const rows = await db.select({ o: schema.ticketOrders, g: schema.guests }).from(schema.ticketOrders)
      .leftJoin(schema.guests, eq(schema.guests.id, schema.ticketOrders.guestId))
      .where(and(eq(schema.ticketOrders.venueId, req.params.venueId), eq(schema.ticketOrders.eventId, req.params.eventId),
        eq(schema.ticketOrders.kind, 'sale'), inArray(schema.ticketOrders.status, ['paid', 'refunded'])))
      .orderBy(desc(schema.ticketOrders.paidAt));
    const ids = rows.map((r) => r.o.id);
    const tix = ids.length ? await db.select({ orderId: schema.tickets.orderId, n: sql<number>`count(*)::int`, inN: sql<number>`count(${schema.tickets.checkedInAt})::int` })
      .from(schema.tickets).where(inArray(schema.tickets.orderId, ids)).groupBy(schema.tickets.orderId) : [];
    return rows.map(({ o, g }) => {
      const t = tix.find((x) => x.orderId === o.id);
      return {
        id: o.id, code: o.code, status: o.status, name: g ? `${g.firstName} ${g.lastName}`.trim() : '', phone: o.buyerPhone, email: o.buyerEmail,
        tickets: t?.n ?? 0, checkedIn: t?.inN ?? 0, ticketPrice: o.subtotal - o.discount, fees: o.fee + o.feeVat, total: o.total,
        paidAt: o.paidAt, refundedAt: o.refundedAt, refundedAmount: o.refundedAmount,
      };
    });
  });

  /**
   * Refund a whole ticket order. `fees: false` keeps the booking fee (XTRA's)
   * and gives back the ticket price only.
   */
  app.post<{ Params: { venueId: string; eventId: string; orderId: string } }>('/venues/:venueId/events/:eventId/orders/:orderId/refund', async (req) => {
    const { user } = await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ fees: z.boolean().default(true), reason: z.string().trim().max(300).optional() }), req.body ?? {});
    const [o] = await db.select().from(schema.ticketOrders).where(and(eq(schema.ticketOrders.id, parse(z.string().uuid(), req.params.orderId)),
      eq(schema.ticketOrders.venueId, req.params.venueId), eq(schema.ticketOrders.eventId, req.params.eventId)));
    if (!o || o.kind !== 'sale') throw notFound('Order not found');
    if (o.status === 'refunded') throw conflict('This order is already refunded', 'already_refunded');
    if (o.status !== 'paid') throw conflict('Only paid orders can be refunded', 'not_paid');
    const used = await db.select({ id: schema.tickets.id }).from(schema.tickets).where(and(eq(schema.tickets.orderId, o.id), sql`${schema.tickets.checkedInAt} is not null`));
    if (used.length) throw conflict(`${used.length} ticket${used.length > 1 ? 's were' : ' was'} already scanned at the door`, 'already_used');
    const venuePart = o.subtotal - o.discount;
    const amount = b.fees ? o.total : Math.min(o.total, venuePart);
    const pay = await paidPayment('tickets', o.id);
    const r = await giveBack(pay, amount);
    // Lock and flip once, so two clicks cannot refund twice.
    const done = await db.transaction(async (tx) => {
      const [u] = await tx.update(schema.ticketOrders).set({ status: 'refunded', refundedAt: new Date(), refundedAmount: amount })
        .where(and(eq(schema.ticketOrders.id, o.id), eq(schema.ticketOrders.status, 'paid'))).returning();
      if (!u) return null;
      if (pay) await tx.update(schema.payments).set({ status: 'refunded' }).where(eq(schema.payments.id, pay.id));
      const [row] = await tx.insert(schema.refunds).values({ venueId: o.venueId, purpose: 'tickets', refId: o.id, paymentId: pay?.id ?? null, amount, venueAmount: venuePart,
        method: r.method, providerRef: r.ref, reason: b.reason || null, by: user.sub }).returning();
      if (o.guestId && venuePart > 0) {
        await tx.update(schema.venueGuests).set({ totalSpend: sql`greatest(${schema.venueGuests.totalSpend} - ${venuePart}, 0)` })
          .where(and(eq(schema.venueGuests.venueId, o.venueId), eq(schema.venueGuests.guestId, o.guestId)));
      }
      return row;
    });
    if (!done) throw conflict('This order is already refunded', 'already_refunded');
    if (amount > 0) await tellGuest(o.venueId, o.guestId, o.buyerPhone, o.buyerEmail, { what: 'ticket order', amount, code: o.code, method: r.method });
    await notifyWaitlist(o.eventId);
    return { refunded: amount, method: r.method };
  });

  /** Give a booking deposit back. Not after it came off a paid bill. */
  app.post<{ Params: { venueId: string; id: string } }>('/venues/:venueId/reservations/:id/refund-deposit', async (req) => {
    const { user } = await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ reason: z.string().trim().max(300).optional() }), req.body ?? {});
    const [r] = await db.select().from(schema.reservations).where(and(eq(schema.reservations.id, parse(z.string().uuid(), req.params.id)), eq(schema.reservations.venueId, req.params.venueId)));
    if (!r) throw notFound('Booking not found');
    if (!r.depositPaidAt || r.depositAmount <= 0) throw conflict('No deposit was paid on this booking', 'nothing_paid');
    if (r.depositRefundedAt) throw conflict('This deposit is already refunded', 'already_refunded');
    const [bill] = await db.select({ id: schema.tabs.id }).from(schema.tabs)
      .where(and(eq(schema.tabs.reservationId, r.id), eq(schema.tabs.status, 'paid'), sql`${schema.tabs.depositCredit} > 0`));
    if (bill) throw conflict('This deposit already came off the guest\'s bill', 'deposit_used');
    const pay = await paidPayment('deposit', r.id);
    const g = await giveBack(pay, r.depositAmount);
    const done = await db.transaction(async (tx) => {
      const [u] = await tx.update(schema.reservations).set({ depositRefundedAt: new Date() })
        .where(and(eq(schema.reservations.id, r.id), sql`${schema.reservations.depositRefundedAt} is null`)).returning();
      if (!u) return null;
      if (pay) await tx.update(schema.payments).set({ status: 'refunded' }).where(eq(schema.payments.id, pay.id));
      return tx.insert(schema.refunds).values({ venueId: r.venueId, purpose: 'deposit', refId: r.id, paymentId: pay?.id ?? null, amount: r.depositAmount, venueAmount: r.depositAmount,
        method: g.method, providerRef: g.ref, reason: b.reason || null, by: user.sub }).returning();
    });
    if (!done) throw conflict('This deposit is already refunded', 'already_refunded');
    const [guest] = await db.select().from(schema.guests).where(eq(schema.guests.id, r.guestId));
    await tellGuest(r.venueId, r.guestId, guest?.phone ?? null, guest?.email ?? null, { what: 'booking deposit', amount: r.depositAmount, code: r.code, method: g.method });
    return { refunded: r.depositAmount, method: g.method };
  });
}

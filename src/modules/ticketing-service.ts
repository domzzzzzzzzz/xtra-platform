import { z } from 'zod';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db, schema, type Conn } from '../db/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { computeTicketTotals } from '../lib/pricing.js';
import { normalizePhone, qrToken, shortCode } from '../lib/codes.js';
import { config } from '../config.js';
import { emailParts, send } from '../integrations/notify.js';
import { ticketOrderEmail, ticketWa } from './guest-messages.js';
import { getPlatformSettings } from './admin.js';
import { upsertGuest, ensureVenueGuest, recordSpend } from './guests-service.js';

type Order = typeof schema.ticketOrders.$inferSelect;
type Zone = typeof schema.eventZones.$inferSelect;

export const holdInput = z.object({
  items: z.array(z.union([
    z.object({ zoneId: z.string().uuid(), qty: z.number().int().min(1).max(50) }),
    z.object({ zoneId: z.string().uuid(), seatId: z.string().uuid() }),
  ])).min(1).max(50),
});

/** Turns held orders past their hold time into expired and frees their promo use. */
export async function expireHolds(c: Conn = db, eventId?: string) {
  const conds = [eq(schema.ticketOrders.status, 'held'), lt(schema.ticketOrders.holdExpiresAt, new Date())];
  if (eventId) conds.push(eq(schema.ticketOrders.eventId, eventId));
  const expired = await c.update(schema.ticketOrders).set({ status: 'expired' }).where(and(...conds)).returning();
  for (const o of expired) {
    if (o.promoCodeId) {
      await c.update(schema.promoCodes).set({ usedCount: sql`greatest(${schema.promoCodes.usedCount} - 1, 0)` }).where(eq(schema.promoCodes.id, o.promoCodeId));
    }
  }
  return expired.length;
}

/**
 * What is left in each zone and which seats/tables are taken. Held + paid both count.
 * A zone staff marked sold out shows 0 left and every table taken; `realLeft` keeps
 * the true count so invites can still use it.
 */
export async function availability(c: Conn, eventId: string) {
  const zones = await c.select().from(schema.eventZones).where(eq(schema.eventZones.eventId, eventId));
  const seats = await c.select().from(schema.eventSeats).where(eq(schema.eventSeats.eventId, eventId));
  const lines = await c.select({ zoneId: schema.ticketOrderLines.zoneId, seatId: schema.ticketOrderLines.seatId, qty: schema.ticketOrderLines.qty, status: schema.ticketOrders.status })
    .from(schema.ticketOrderLines).innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.ticketOrderLines.orderId))
    .where(and(eq(schema.ticketOrders.eventId, eventId), inArray(schema.ticketOrders.status, ['held', 'paid'])));
  const takenSeats = new Set(lines.filter((l) => l.seatId).map((l) => l.seatId!));
  // Seats someone is paying for right now: still taken, but they may come back.
  const paidSeats = new Set(lines.filter((l) => l.seatId && l.status === 'paid').map((l) => l.seatId!));
  const closedZones = new Set(zones.filter((z) => z.soldOut).map((z) => z.id));
  return {
    zones: zones.map((z) => {
      const zoneSeats = seats.filter((s) => s.zoneId === z.id && s.enabled);
      const used = lines.filter((l) => l.zoneId === z.id).reduce((s, l) => s + l.qty, 0);
      const left = z.kind === 'standing' ? Math.max(0, z.capacity - used)
        : isFreeSeating(z) ? Math.max(0, zoneSeats.length - used)
        : z.kind === 'decor' ? 0 : zoneSeats.filter((s) => !takenSeats.has(s.id)).length;
      const closed = z.kind !== 'decor' && z.soldOut;
      return { ...z, markedSoldOut: closed, realLeft: left, left: closed ? 0 : left, soldOut: z.kind !== 'decor' && (closed || left === 0) };
    }),
    seats: seats.map((s) => ({
      ...s, sold: takenSeats.has(s.id), held: takenSeats.has(s.id) && !paidSeats.has(s.id),
      taken: takenSeats.has(s.id) || !s.enabled || closedZones.has(s.zoneId),
    })),
  };
}

/** A seated section marked "free seating": guests sit anywhere in it, so it sells by count like standing. */
export const isFreeSeating = (z: { kind: string; meta?: unknown }) => z.kind === 'seated' && Boolean((z.meta as { freeSeating?: boolean } | null)?.freeSeating);
/** Zones sold by count (no seat picked). */
export const byCount = (z: { kind: string; meta?: unknown }) => z.kind === 'standing' || isFreeSeating(z);

/** A table zone is priced per seat and sold one whole table at a time. */
const tableSeats = (z: Zone, seat: { seats: number } | null) => (z.kind === 'table' && seat ? Math.max(1, seat.seats) : 1);

export async function feeRatesFor(eventId: string) {
  const [row] = await db.select({ e: schema.events.bookingFeeBps, v: schema.venues.bookingFeeBps }).from(schema.events)
    .innerJoin(schema.venues, eq(schema.venues.id, schema.events.venueId)).where(eq(schema.events.id, eventId));
  const s = await getPlatformSettings();
  return { feeBps: row?.e ?? row?.v ?? s.bookingFeeBps, feeVatBps: s.feeVatBps };
}

type Line = { zoneId: string; seatId: string | null; qty: number; unitPrice: number };

/** Locks the event and turns the picked items into priced order lines, checking nothing is taken. */
async function linesFor(tx: Conn, eventId: string, items: z.infer<typeof holdInput>['items']) {
  const [event] = await tx.select().from(schema.events).where(eq(schema.events.id, eventId)).for('update');
  if (!event || event.status !== 'published') throw notFound('Event not found');
  if (event.inviteOnly) throw badRequest('This event is by invitation only', 'invite_only');
  if (event.startsAt.getTime() + 6 * 3600_000 < Date.now()) throw badRequest('Sales for this event are closed', 'sales_closed');
  await expireHolds(tx, eventId);
  const av = await availability(tx, eventId);

  const lines: Line[] = [];
  const want = new Map<string, number>();
  const seen = new Set<string>();
  let ticketCount = 0;
  for (const it of items) {
    const zone = av.zones.find((z) => z.id === it.zoneId);
    if (!zone || zone.kind === 'decor') throw badRequest('Unknown ticket type');
    if (zone.markedSoldOut) throw conflict(`${zone.name} is sold out`, 'sold_out');
    if ('qty' in it) {
      if (!byCount(zone)) throw badRequest(`Pick a seat or table in ${zone.name}`);
      want.set(zone.id, (want.get(zone.id) ?? 0) + it.qty);
      if (want.get(zone.id)! > zone.left) throw conflict(zone.left ? `Only ${zone.left} left in ${zone.name}` : `${zone.name} is sold out`, 'sold_out');
      lines.push({ zoneId: zone.id, seatId: null, qty: it.qty, unitPrice: zone.price });
      ticketCount += it.qty;
    } else {
      const seat = av.seats.find((s) => s.id === it.seatId && s.zoneId === zone.id);
      if (!seat) throw badRequest('Unknown seat');
      if (seat.taken || seen.has(seat.id)) throw conflict(`${placeOf(zone.kind, '', seat.label) || seat.label} was just taken`, 'seat_taken');
      seen.add(seat.id);
      const n = tableSeats(zone, seat);
      lines.push({ zoneId: zone.id, seatId: seat.id, qty: 1, unitPrice: zone.price * n });
      ticketCount += n;
    }
  }
  if (ticketCount > event.maxPerOrder) throw badRequest(`Max ${event.maxPerOrder} tickets per order`, 'too_many');
  return { event, lines };
}

/** Hold seats for `config.holdMinutes` (10 minutes). The clock starts at the first pick. */
export async function hold(eventId: string, input: z.infer<typeof holdInput>) {
  const rates = await feeRatesFor(eventId);
  return db.transaction(async (tx) => {
    // One hold at a time per event (row lock on the event): simple and it can never oversell.
    const { event, lines } = await linesFor(tx, eventId, input.items);
    const totals = computeTicketTotals({ lines, percentOff: 0, ...rates });
    const [order] = await tx.insert(schema.ticketOrders).values({
      code: shortCode(), venueId: event.venueId, eventId, status: 'held',
      holdExpiresAt: new Date(Date.now() + config.holdMinutes * 60_000), ...totals, ...rates,
    }).returning();
    await tx.insert(schema.ticketOrderLines).values(lines.map((l) => ({ ...l, orderId: order.id })));
    return order;
  });
}

export const changeHoldInput = z.object({ items: holdInput.shape.items.element.array().max(50) });

/**
 * The guest added or dropped a seat while their seats are held. The clock keeps running
 * (it does not restart), the promo code is taken off (they apply it again at payment),
 * and an empty pick lets every seat go.
 */
export async function changeHold(code: string, input: z.infer<typeof changeHoldInput>) {
  const o = await orderByCode(code);
  await heldOnly(o);
  return db.transaction(async (tx) => {
    // Same lock order as hold(): the event first, then the order.
    await tx.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, o.eventId)).for('update');
    const [cur] = await tx.select().from(schema.ticketOrders).where(eq(schema.ticketOrders.id, o.id)).for('update');
    if (cur.status !== 'held') throw conflict(`Your ${config.holdMinutes} minutes are up. Please pick your seats again.`, 'hold_expired');
    // Free this order's own seats first so the guest can keep them.
    await tx.delete(schema.ticketOrderLines).where(eq(schema.ticketOrderLines.orderId, cur.id));
    if (cur.promoCodeId) await tx.update(schema.promoCodes).set({ usedCount: sql`greatest(${schema.promoCodes.usedCount} - 1, 0)` }).where(eq(schema.promoCodes.id, cur.promoCodeId));
    if (!input.items.length) {
      const [gone] = await tx.update(schema.ticketOrders).set({ status: 'expired', promoCodeId: null }).where(eq(schema.ticketOrders.id, cur.id)).returning();
      return gone;
    }
    const { lines } = await linesFor(tx, cur.eventId, input.items);
    const totals = computeTicketTotals({ lines, percentOff: 0, feeBps: cur.feeBps, feeVatBps: cur.feeVatBps });
    await tx.insert(schema.ticketOrderLines).values(lines.map((l) => ({ ...l, orderId: cur.id })));
    const [next] = await tx.update(schema.ticketOrders).set({ ...totals, promoCodeId: null }).where(eq(schema.ticketOrders.id, cur.id)).returning();
    return next;
  });
}

/** How a seat reads for a guest: "Table A3", "Row F, Seat 12", or the zone name for standing. */
export function placeOf(kind: string, zoneName: string, seatLabel: string | null | undefined) {
  if (!seatLabel) return kind === 'seated' && zoneName ? `${zoneName} · Free seating` : zoneName;
  if (kind === 'table') return zoneName ? `${zoneName} · Table ${seatLabel}` : `Table ${seatLabel}`;
  const [row, num] = seatLabel.split('-');
  const s = num ? `Row ${row}, Seat ${num}` : `Seat ${seatLabel}`;
  return zoneName ? `${zoneName} · ${s}` : s;
}

export async function orderByCode(code: string) {
  const [o] = await db.select().from(schema.ticketOrders).where(eq(schema.ticketOrders.code, code.toUpperCase()));
  if (!o) throw notFound('Order not found');
  return o;
}

async function heldOnly(o: Order) {
  if (o.status !== 'held' || o.holdExpiresAt < new Date()) {
    if (o.status === 'held') await expireHolds(db, o.eventId);
    throw conflict(`Your ${config.holdMinutes} minutes are up. Please pick your seats again.`, 'hold_expired');
  }
}

async function recompute(c: Conn, o: Order, percentOff: number) {
  const lines = await c.select().from(schema.ticketOrderLines).where(eq(schema.ticketOrderLines.orderId, o.id));
  return computeTicketTotals({ lines, percentOff, feeBps: o.feeBps, feeVatBps: o.feeVatBps });
}

/** Apply (or with code=null remove) a promo code on a held order. */
export async function applyPromo(code: string, promo: string | null, phone?: string) {
  const o = await orderByCode(code);
  await heldOnly(o);
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(schema.ticketOrders).where(eq(schema.ticketOrders.id, o.id)).for('update');
    if (locked.promoCodeId) {
      await tx.update(schema.promoCodes).set({ usedCount: sql`greatest(${schema.promoCodes.usedCount} - 1, 0)` }).where(eq(schema.promoCodes.id, locked.promoCodeId));
    }
    if (!promo) {
      const totals = await recompute(tx, locked, 0);
      const [u] = await tx.update(schema.ticketOrders).set({ ...totals, promoCodeId: null }).where(eq(schema.ticketOrders.id, o.id)).returning();
      return u;
    }
    const [p] = await tx.select().from(schema.promoCodes)
      .where(and(eq(schema.promoCodes.venueId, o.venueId), eq(schema.promoCodes.code, promo.trim().toUpperCase())));
    const invalid = () => badRequest('This code is not valid', 'promo_invalid');
    if (!p || !p.active) throw invalid();
    if (p.eventId && p.eventId !== o.eventId) throw invalid();
    if (p.expiresAt && p.expiresAt < new Date()) throw badRequest('This code has expired', 'promo_expired');
    if (p.lockedPhone && (!phone || normalizePhone(phone) !== p.lockedPhone)) throw badRequest('This code belongs to another guest', 'promo_locked');
    const [used] = await tx.update(schema.promoCodes).set({ usedCount: sql`${schema.promoCodes.usedCount} + 1` })
      .where(and(eq(schema.promoCodes.id, p.id), sql`(${schema.promoCodes.maxUses} is null or ${schema.promoCodes.usedCount} < ${schema.promoCodes.maxUses})`))
      .returning();
    if (!used) throw badRequest('This code has been used up', 'promo_used_up');
    const totals = await recompute(tx, locked, p.percentOff);
    const [u] = await tx.update(schema.ticketOrders).set({ ...totals, promoCodeId: p.id }).where(eq(schema.ticketOrders.id, o.id)).returning();
    return u;
  });
}

export const attendee = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email().optional(),
  phone: z.string().min(8).max(20).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

export const checkoutInput = z.object({
  buyer: attendee.extend({ email: z.string().email(), phone: z.string().min(8).max(20), whatsappOptIn: z.boolean().default(false), emailOptIn: z.boolean().default(false) }),
  /** One per ticket, in order. The first defaults to the buyer if missing. */
  attendees: z.array(attendee).max(100).default([]),
});

/** Save who the tickets are for, then either finish (free) or return what to pay. */
export async function prepareCheckout(code: string, input: z.infer<typeof checkoutInput>) {
  const o = await orderByCode(code);
  await heldOnly(o);
  const lines = await db.select({ l: schema.ticketOrderLines, z: schema.eventZones, s: schema.eventSeats }).from(schema.ticketOrderLines)
    .innerJoin(schema.eventZones, eq(schema.eventZones.id, schema.ticketOrderLines.zoneId))
    .leftJoin(schema.eventSeats, eq(schema.eventSeats.id, schema.ticketOrderLines.seatId)).where(eq(schema.ticketOrderLines.orderId, o.id))
    .orderBy(asc(schema.eventZones.sort), asc(schema.eventSeats.label));
  const slots: { zoneId: string; seatId: string | null }[] = [];
  for (const { l, z, s } of lines) for (let i = 0; i < (l.seatId ? tableSeats(z, s) : l.qty); i++) slots.push({ zoneId: z.id, seatId: l.seatId });

  if (o.promoCodeId) {
    const [p] = await db.select().from(schema.promoCodes).where(eq(schema.promoCodes.id, o.promoCodeId));
    if (p?.lockedPhone && normalizePhone(input.buyer.phone) !== p.lockedPhone) throw badRequest('This code belongs to another guest', 'promo_locked');
  }

  const people = slots.map((_, i) => input.attendees[i] ?? (i === 0 ? input.buyer : { firstName: input.buyer.firstName, lastName: input.buyer.lastName }));
  return db.transaction(async (tx) => {
    const guest = await upsertGuest(tx, { ...input.buyer, phone: input.buyer.phone });
    await ensureVenueGuest(tx, o.venueId, guest.id);
    await tx.delete(schema.tickets).where(eq(schema.tickets.orderId, o.id));
    await tx.insert(schema.tickets).values(slots.map((s, i) => ({
      orderId: o.id, eventId: o.eventId, zoneId: s.zoneId, seatId: s.seatId,
      firstName: people[i].firstName, lastName: people[i].lastName, email: people[i].email ?? null,
      phone: people[i].phone ? normalizePhone(people[i].phone!) : null, birthDate: people[i].birthDate ?? null,
      gender: people[i].gender ?? null, qrToken: qrToken(),
    })));
    // Give the guest time to finish on the payment page.
    const holdUntil = new Date(Math.max(o.holdExpiresAt.getTime(), Date.now() + 10 * 60_000));
    const [u] = await tx.update(schema.ticketOrders).set({
      guestId: guest.id, buyerEmail: input.buyer.email, buyerPhone: guest.phone, holdExpiresAt: holdUntil,
    }).where(eq(schema.ticketOrders.id, o.id)).returning();
    return { order: u, guest };
  });
}

export const ticketUrl = (token: string) => `${config.publicAppUrl}/t/${token}`;

type Channel = 'whatsapp' | 'email';

export async function onTicketsPaid(orderId: string) {
  const [o] = await db.update(schema.ticketOrders).set({ status: 'paid', paidAt: new Date() })
    .where(and(eq(schema.ticketOrders.id, orderId), inArray(schema.ticketOrders.status, ['held', 'expired']))).returning();
  if (!o) return;
  await sendTickets(o);
}

/**
 * Message every ticket of a paid order: WhatsApp and email. Invites get "you're
 * invited" wording and no receipt; `channels` limits where they go.
 */
export async function sendTickets(o: Order, opts: { channels?: Channel[] } = {}) {
  const invite = o.kind === 'invite';
  const useWa = !opts.channels || opts.channels.includes('whatsapp');
  const useEmail = !opts.channels || opts.channels.includes('email');
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, o.eventId));
  const [venue] = await db.select().from(schema.venues).where(eq(schema.venues.id, o.venueId));
  if (o.guestId && !invite) await recordSpend(db, o.venueId, o.guestId, o.subtotal - o.discount, o.id, 'tickets', false);
  const list = await db.select({ t: schema.tickets, zone: schema.eventZones.name, kind: schema.eventZones.kind, seat: schema.eventSeats.label }).from(schema.tickets)
    .innerJoin(schema.eventZones, eq(schema.eventZones.id, schema.tickets.zoneId))
    .leftJoin(schema.eventSeats, eq(schema.eventSeats.id, schema.tickets.seatId))
    .where(eq(schema.tickets.orderId, o.id));
  const when = event.startsAt.toLocaleString('en-GB', { timeZone: venue.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  const typeOf = (x: (typeof list)[number]) => placeOf(x.kind, x.zone, x.seat);
  const nameOf = (x: (typeof list)[number]) => `${x.t.firstName} ${x.t.lastName}`.trim() || 'Guest';
  const [buyer] = o.guestId ? await db.select().from(schema.guests).where(eq(schema.guests.id, o.guestId)) : [];
  const buyerName = buyer?.firstName || list[0]?.t.firstName || 'there';

  // WhatsApp: a holder with their own number gets their ticket; the buyer gets one
  // message for the rest (their ticket, or a link to the whole order).
  const buyerPhone = useWa && o.buyerPhone ? normalizePhone(o.buyerPhone) : null;
  const mine: typeof list = [];
  for (const x of list) {
    const phone = x.t.phone ? normalizePhone(x.t.phone) : null;
    if (!phone || phone === buyerPhone || !useWa) { mine.push(x); continue; }
    const body = `Hi ${x.t.firstName}, your ticket for ${event.title} at ${venue.name}, ${when} (${typeOf(x)}). Show this QR at the door: ${ticketUrl(x.t.qrToken)}`;
    await send({ channel: 'whatsapp', to: phone, kind: 'ticket', body, venueId: venue.id, guestId: o.guestId,
      whatsappTemplate: ticketWa(venue, { firstName: x.t.firstName, qrToken: x.t.qrToken, type: typeOf(x) }, event.title, when) });
  }
  if (buyerPhone && mine.length === 1) {
    const x = mine[0];
    await send({ channel: 'whatsapp', to: buyerPhone, kind: 'ticket', venueId: venue.id, guestId: o.guestId,
      body: invite
        ? `Hi ${x.t.firstName}, ${venue.name} invited you to ${event.title}, ${when} (${typeOf(x)}). Your free ticket, show this QR at the door: ${ticketUrl(x.t.qrToken)}`
        : `Hi ${x.t.firstName}, your ticket for ${event.title} at ${venue.name}, ${when} (${typeOf(x)}). Show this QR at the door: ${ticketUrl(x.t.qrToken)}`,
      whatsappTemplate: ticketWa(venue, { firstName: buyerName, qrToken: x.t.qrToken, type: typeOf(x) }, event.title, when) });
  } else if (buyerPhone && mine.length > 1) {
    await send({ channel: 'whatsapp', to: buyerPhone, kind: 'ticket_order', venueId: venue.id, guestId: o.guestId,
      body: invite
        ? `Hi ${buyerName}, ${venue.name} invited you to ${event.title}, ${when}. Your ${mine.length} free tickets are ready, share each one with its guest: ${config.publicAppUrl}/o/${o.code}`
        : `Hi ${buyerName}, your ${mine.length} tickets for ${event.title} at ${venue.name}, ${when} are ready. Open them and share each one with its guest: ${config.publicAppUrl}/o/${o.code}`,
      whatsappTemplate: { name: 'xtra_ticket_order', header: venue.name, params: [buyerName, String(mine.length), event.title, when], button: `o/${o.code}` } });
  }

  // Email: the buyer gets one email with every ticket and the receipt; a holder with
  // a different email gets an email with just their own ticket.
  const byEmail = new Map<string, typeof list>();
  if (o.buyerEmail && useEmail) byEmail.set(o.buyerEmail.toLowerCase(), list);
  for (const x of useEmail ? list : []) {
    const e = x.t.email?.toLowerCase();
    if (e && !byEmail.has(e)) byEmail.set(e, [x]);
  }
  for (const [email, items] of byEmail) {
    const isBuyer = items === list && !!o.buyerEmail;
    const m = ticketOrderEmail(venue, isBuyer ? o : { ...o, subtotal: 0, discount: 0, fee: 0, feeVat: 0, total: 0 }, event.title, when,
      items.map((x) => ({ name: nameOf(x), type: typeOf(x), qrToken: x.t.qrToken })), isBuyer ? buyerName : items[0].t.firstName || 'there', invite ? { note: o.note } : undefined);
    if (!isBuyer || invite) m.mail.doc.receipt = undefined;
    await send({ channel: 'email', to: email, kind: m.kind, subject: m.subject, venueId: venue.id, guestId: o.guestId, ...emailParts(venue, m.mail.doc) });
  }
}

/** Run every 20 seconds: free seats whose hold ran out, so other guests see them again fast. */
export function startHoldSweeper() {
  const t = setInterval(() => { expireHolds().catch(() => {}); }, 20_000);
  t.unref();
  return t;
}

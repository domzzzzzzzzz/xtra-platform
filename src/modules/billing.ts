import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { egp, parse, superAdmin, venueAccess } from '../lib/http.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { nightOf, prettyDate } from '../lib/dates.js';
import { emailParts, send } from '../integrations/notify.js';

/**
 * XTRA as a business:
 * - each venue has a monthly plan; an invoice is made on the 1st (14% VAT), paid online or marked paid,
 * - XTRA's Paymob account takes guests' online money for the venue (deposits, ticket prices, bills paid by link);
 *   the settlement shows what XTRA owes each venue, and payouts record what was sent.
 * Booking fees on tickets are XTRA's and never part of the venue's money.
 */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const night = (col: unknown) => sql`((${col} at time zone 'Africa/Cairo') - interval '6 hours')::date`;
const VAT_BPS = 1400;
const monthStart = (d = nightOf()) => `${d.slice(0, 8)}01`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const n = (v: unknown) => Number(v ?? 0);

/** Guests' online money for a venue in a range of nights, and what XTRA owes it. */
export async function settlement(venueId: string, from: string, to: string) {
  const [pay, tix, ref] = await Promise.all([
    db.execute(sql`select purpose, coalesce(sum(amount),0) as total, count(*) as n from payments
      where venue_id = ${venueId} and status in ('paid','refunded') and purpose in ('deposit','tab') and ${night(sql`paid_at`)} between ${from} and ${to} group by purpose`),
    db.execute(sql`select coalesce(sum(o.subtotal - o.discount),0) as venue, coalesce(sum(o.fee + o.fee_vat),0) as fees, count(*) as n
      from payments p join ticket_orders o on o.id = p.ref_id
      where p.venue_id = ${venueId} and p.status in ('paid','refunded') and p.purpose = 'tickets' and ${night(sql`p.paid_at`)} between ${from} and ${to}`),
    db.execute(sql`select coalesce(sum(venue_amount),0) as venue, coalesce(sum(amount - venue_amount),0) as fees, count(*) as n from refunds
      where venue_id = ${venueId} and method = 'paymob' and ${night(sql`created_at`)} between ${from} and ${to}`),
  ]);
  const by = Object.fromEntries((pay.rows as any[]).map((r) => [r.purpose, n(r.total)]));
  const t = tix.rows[0] as any, r = ref.rows[0] as any;
  const deposits = by.deposit ?? 0, bills = by.tab ?? 0, tickets = n(t.venue);
  const gross = deposits + bills + tickets, refunds = n(r.venue);
  return {
    from, to, deposits, bills, tickets, refunds, owed: gross - refunds,
    bookingFees: n(t.fees) - n(r.fees),
  };
}

/** All-time: what XTRA owes the venue minus what it has paid out. */
async function balance(venueId: string) {
  const all = await settlement(venueId, '2000-01-01', '2999-12-31');
  const [p] = await db.select({ t: sql<number>`coalesce(sum(${schema.venuePayouts.amount}),0)::int` }).from(schema.venuePayouts).where(eq(schema.venuePayouts.venueId, venueId));
  return { owedAllTime: all.owed, paidOut: p.t, balance: all.owed - p.t };
}

/** Make the month's invoice (once). Returns null when there is nothing to bill. */
export async function invoiceFor(v: typeof schema.venues.$inferSelect, period: string) {
  const price = v.plan?.price ?? 0;
  if (price <= 0) return null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('saas_invoice'))`);
    const [have] = await tx.select().from(schema.saasInvoices).where(and(eq(schema.saasInvoices.venueId, v.id), eq(schema.saasInvoices.period, period)));
    if (have) return { invoice: have, created: false };
    const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(schema.saasInvoices).where(eq(schema.saasInvoices.period, period));
    const vat = Math.round((price * VAT_BPS) / 10000);
    const [inv] = await tx.insert(schema.saasInvoices).values({
      venueId: v.id, number: `XTRA-${period.replace('-', '')}-${String(c + 1).padStart(3, '0')}`, period,
      amount: price, vat, total: price + vat, dueDate: addDays(`${period}-01`, 7),
    }).returning();
    return { invoice: inv, created: true };
  });
}

async function ownerEmails(venueId: string) {
  return (await db.select({ e: schema.users.email }).from(schema.venueStaff).innerJoin(schema.users, eq(schema.users.id, schema.venueStaff.userId))
    .where(and(eq(schema.venueStaff.venueId, venueId), eq(schema.venueStaff.role, 'owner')))).map((r) => r.e);
}

const monthName = (period: string) => new Date(`${period}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

async function emailInvoice(v: typeof schema.venues.$inferSelect, inv: typeof schema.saasInvoices.$inferSelect) {
  const xtra = { name: 'XTRA', logoUrl: null, color: '#12153f' } as any;
  const parts = emailParts(xtra, {
    preheader: `${egp(inv.total)} for ${monthName(inv.period)}, due ${prettyDate(inv.dueDate)}.`,
    title: `Your XTRA invoice for ${monthName(inv.period)}`,
    intro: `Here is ${v.name}'s XTRA invoice. Pay online from Venue setup → Billing, or by InstaPay or bank transfer and we mark it paid.`,
    rows: [['Invoice', inv.number], ['Venue', v.name], ['Due', prettyDate(inv.dueDate)]],
    receipt: [['XTRA platform, monthly', egp(inv.amount)], ['VAT 14%', egp(inv.vat)], ['Total', egp(inv.total)]],
    button: { label: 'Pay invoice', url: `${config.publicAppUrl}/` },
  });
  for (const e of await ownerEmails(v.id)) {
    await send({ channel: 'email', to: e, kind: `saas_invoice:${inv.id}`, subject: `XTRA invoice ${inv.number} · ${egp(inv.total)}`, venueId: v.id, ...parts, fromName: 'XTRA' });
  }
}

/** From the automations timer: on the 1st (and after), bill every paying venue once for the month. */
export async function runSaasInvoices(now = new Date()) {
  const period = nightOf(now).slice(0, 7);
  const venues = await db.select().from(schema.venues).where(eq(schema.venues.active, true));
  let made = 0;
  for (const v of venues) {
    const p = v.plan;
    const trialOver = p?.status === 'trial' && p.trialEnds && p.trialEnds < nightOf(now);
    if (!p || !(p.status === 'active' || trialOver)) continue;
    const r = await invoiceFor(v, period);
    if (r?.created) { made++; await emailInvoice(v, r.invoice).catch(() => {}); }
  }
  return made;
}

export async function onSaasPaid(invoiceId: string) {
  await db.update(schema.saasInvoices).set({ status: 'paid', paidAt: new Date(), method: 'paymob' })
    .where(and(eq(schema.saasInvoices.id, invoiceId), eq(schema.saasInvoices.status, 'unpaid')));
}

const planBody = z.object({
  price: z.number().int().min(0).max(100_000_000), status: z.enum(['trial', 'active', 'paused']),
  trialEnds: ymd.nullish(), note: z.string().max(200).optional(),
});
const payoutBody = z.object({ amount: z.number().int().min(1), paidOn: ymd.optional(), reference: z.string().trim().max(80).default(''), note: z.string().trim().max(300).default('') });
const range = (q: { from?: string; to?: string }) => {
  const to = parse(ymd.optional(), q.to) ?? nightOf();
  return { from: parse(ymd.optional(), q.from) ?? monthStart(to), to };
};

export default async function billing(app: FastifyInstance) {
  /* ---------- XTRA admin */
  app.get('/admin/billing', async (req) => {
    await superAdmin(req);
    const venues = await db.select().from(schema.venues).orderBy(schema.venues.name);
    const unpaid = await db.execute(sql`select venue_id, count(*) as n, coalesce(sum(total),0) as total from saas_invoices where status = 'unpaid' group by venue_id`);
    const ux = new Map((unpaid.rows as any[]).map((r) => [r.venue_id, { n: n(r.n), total: n(r.total) }]));
    const rows = await Promise.all(venues.map(async (v) => ({
      id: v.id, name: v.name, active: v.active, plan: v.plan, unpaid: ux.get(v.id) ?? { n: 0, total: 0 }, ...(await balance(v.id)),
    })));
    return {
      venues: rows,
      mrr: venues.filter((v) => v.active && v.plan?.status === 'active').reduce((s, v) => s + (v.plan?.price ?? 0), 0),
      unpaid: rows.reduce((s, r) => s + r.unpaid.total, 0),
      owedToVenues: rows.reduce((s, r) => s + Math.max(0, r.balance), 0),
    };
  });

  app.put<{ Params: { venueId: string } }>('/admin/venues/:venueId/plan', async (req) => {
    await superAdmin(req);
    const b = parse(planBody, req.body);
    const [v] = await db.update(schema.venues).set({ plan: { price: b.price, status: b.status, trialEnds: b.trialEnds ?? null, ...(b.note ? { note: b.note } : {}) } })
      .where(eq(schema.venues.id, req.params.venueId)).returning();
    if (!v) throw notFound('Venue not found');
    return v.plan;
  });

  app.get<{ Params: { venueId: string }; Querystring: { from?: string; to?: string } }>('/admin/venues/:venueId/billing', async (req) => {
    await superAdmin(req);
    return billingView(req.params.venueId, range(req.query));
  });

  /* This month's invoice now (it is also made on the 1st by itself). */
  app.post<{ Params: { venueId: string } }>('/admin/venues/:venueId/invoices', async (req, reply) => {
    await superAdmin(req);
    const b = parse(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional(), email: z.boolean().default(true) }), req.body ?? {});
    const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, req.params.venueId));
    if (!v) throw notFound('Venue not found');
    const r = await invoiceFor(v, b.period ?? nightOf().slice(0, 7));
    if (!r) throw badRequest('Set a monthly price for this venue first', 'no_price');
    if (!r.created) throw conflict('This month already has an invoice', 'exists');
    if (b.email) await emailInvoice(v, r.invoice).catch(() => {});
    reply.code(201);
    return r.invoice;
  });

  app.post<{ Params: { invoiceId: string } }>('/admin/invoices/:invoiceId/status', async (req) => {
    await superAdmin(req);
    const b = parse(z.object({ status: z.enum(['paid', 'unpaid', 'void']), method: z.enum(['instapay', 'transfer', 'cash', 'paymob']).optional() }), req.body);
    const [inv] = await db.update(schema.saasInvoices).set({
      status: b.status, paidAt: b.status === 'paid' ? new Date() : null, method: b.status === 'paid' ? (b.method ?? 'transfer') : null,
    }).where(eq(schema.saasInvoices.id, req.params.invoiceId)).returning();
    if (!inv) throw notFound('Invoice not found');
    return inv;
  });

  app.post<{ Params: { venueId: string } }>('/admin/venues/:venueId/payouts', async (req, reply) => {
    const u = await superAdmin(req);
    const b = parse(payoutBody, req.body);
    const [p] = await db.insert(schema.venuePayouts).values({ venueId: req.params.venueId, amount: b.amount, paidOn: b.paidOn ?? nightOf(), reference: b.reference, note: b.note, by: u.sub }).returning();
    reply.code(201);
    return p;
  });

  app.delete<{ Params: { venueId: string; payoutId: string } }>('/admin/venues/:venueId/payouts/:payoutId', async (req) => {
    await superAdmin(req);
    const [d] = await db.delete(schema.venuePayouts).where(and(eq(schema.venuePayouts.id, req.params.payoutId), eq(schema.venuePayouts.venueId, req.params.venueId))).returning();
    if (!d) throw notFound('Payout not found');
    return { ok: true };
  });

  /* ---------- the venue's own view (owners) */
  app.get<{ Params: { venueId: string }; Querystring: { from?: string; to?: string } }>('/venues/:venueId/billing', async (req) => {
    const { role } = await venueAccess(req, req.params.venueId);
    if (role !== 'owner') throw forbidden('Only the owner sees billing');
    return billingView(req.params.venueId, range(req.query));
  });

  app.post<{ Params: { venueId: string; invoiceId: string } }>('/venues/:venueId/billing/invoices/:invoiceId/pay', async (req) => {
    const { role, user } = await venueAccess(req, req.params.venueId);
    if (role !== 'owner') throw forbidden('Only the owner pays invoices');
    const [inv] = await db.select().from(schema.saasInvoices).where(and(eq(schema.saasInvoices.id, req.params.invoiceId), eq(schema.saasInvoices.venueId, req.params.venueId)));
    if (!inv) throw notFound('Invoice not found');
    if (inv.status !== 'unpaid') throw conflict('This invoice is not open', 'closed');
    const [me] = await db.select().from(schema.users).where(eq(schema.users.id, user.sub));
    const { startPayment } = await import('./payments.js');
    const [first, ...rest] = (me?.name ?? 'Venue').split(' ');
    return startPayment({
      venueId: inv.venueId, purpose: 'saas', refId: inv.id, amount: inv.total, description: `XTRA invoice ${inv.number}`,
      customer: { firstName: first, lastName: rest.join(' ') || first, email: me?.email ?? null, phone: '+200000000000' }, redirectUrl: `${config.publicAppUrl}/`,
    });
  });
}

async function billingView(venueId: string, r: { from: string; to: string }) {
  const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, venueId));
  if (!v) throw notFound('Venue not found');
  const [invoices, payouts, s, b] = await Promise.all([
    db.select().from(schema.saasInvoices).where(eq(schema.saasInvoices.venueId, venueId)).orderBy(desc(schema.saasInvoices.period)).limit(24),
    db.select().from(schema.venuePayouts).where(eq(schema.venuePayouts.venueId, venueId)).orderBy(desc(schema.venuePayouts.paidOn)).limit(24),
    settlement(venueId, r.from, r.to),
    balance(venueId),
  ]);
  return { plan: v.plan, invoices, payouts, settlement: s, ...b };
}

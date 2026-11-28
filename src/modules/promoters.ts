import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, venueAccess } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { normalizePhone, qrToken } from '../lib/codes.js';
import { nightOf } from '../lib/dates.js';

/**
 * Promoters and the guest list. Staff add promoters; each gets a link code
 * for bookings and tickets, and a private page to put names on the door list.
 */
type P = { venueId: string };
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const night = (col: unknown) => sql`((${col} at time zone 'Africa/Cairo') - interval '6 hours')::date`;
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

const codeOf = (name: string) => name.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 12) || 'PROMO';

/** Per promoter for a range of nights: who came, what they spent, what we owe. */
export async function promoterStats(venueId: string, from: string, to: string) {
  const rows = await db.execute(sql`
    select p.id,
      (select count(*) from reservations r where r.promoter_id = p.id and r.date between ${from} and ${to}
         and r.status in ('confirmed','arrived','completed','no_show'))::int as bookings,
      (select coalesce(sum(r.party_size),0) from reservations r where r.promoter_id = p.id and r.date between ${from} and ${to}
         and r.status in ('arrived','completed'))::int as booked_in,
      (select coalesce(sum(1 + l.plus),0) from guest_list l where l.promoter_id = p.id and l.night between ${from} and ${to})::int as listed,
      (select coalesce(sum(1 + l.plus),0) from guest_list l where l.promoter_id = p.id and l.night between ${from} and ${to} and l.checked_in_at is not null)::int as list_in,
      (select count(*) from tickets t join ticket_orders o on o.id = t.order_id where o.promoter_id = p.id and o.status = 'paid' and o.kind = 'sale'
         and ${night(sql`o.paid_at`)} between ${from} and ${to})::int as tickets,
      (select coalesce(sum(o.subtotal - o.discount),0) from ticket_orders o where o.promoter_id = p.id and o.status = 'paid' and o.kind = 'sale'
         and ${night(sql`o.paid_at`)} between ${from} and ${to})::int as ticket_sales,
      (select coalesce(sum(t.total + t.deposit_credit),0) from tabs t join reservations r on r.id = t.reservation_id
         where r.promoter_id = p.id and t.status = 'paid' and r.date between ${from} and ${to})::int as table_spend
    from promoters p where p.venue_id = ${venueId}`);
  const out = new Map<string, { bookings: number; guestsIn: number; listed: number; tickets: number; spend: number }>();
  for (const r of rows.rows as any[]) {
    out.set(r.id, {
      bookings: r.bookings, listed: r.listed, tickets: r.tickets,
      guestsIn: r.booked_in + r.list_in + r.tickets,
      spend: r.table_spend + r.ticket_sales,
    });
  }
  return out;
}

const owed = (p: { commissionKind: string; commission: number }, s: { guestsIn: number; spend: number }) =>
  p.commissionKind === 'percent' ? Math.round((s.spend * p.commission) / 10000) : s.guestsIn * p.commission;

async function addToList(venueId: string, b: { name: string; phone?: string; plus: number; note: string; night?: string }, promoterId: string | null, addedBy: string | null) {
  const n = b.night ?? nightOf();
  if (n < nightOf()) throw badRequest('That night has passed', 'date_past');
  const [row] = await db.insert(schema.guestList).values({
    venueId, promoterId, night: n, name: b.name, phone: b.phone ? normalizePhone(b.phone) : null, plus: b.plus, note: b.note, addedBy,
  }).returning();
  return row;
}

const listInput = z.object({
  name: z.string().trim().min(2).max(80), phone: z.string().min(8).max(20).optional(),
  plus: z.number().int().min(0).max(20).default(0), note: z.string().trim().max(200).default(''), night: ymd.optional(),
});

export default async function promoters(app: FastifyInstance) {
  /* ---------- staff: promoters */
  app.get<{ Params: P; Querystring: { from?: string; to?: string } }>('/venues/:venueId/promoters', async (req) => {
    await venueAccess(req, req.params.venueId);
    const to = parse(ymd.optional(), req.query.to) ?? nightOf();
    const from = parse(ymd.optional(), req.query.from) ?? shift(to, -29);
    const [list, stats] = await Promise.all([
      db.select().from(schema.promoters).where(eq(schema.promoters.venueId, req.params.venueId)).orderBy(asc(schema.promoters.name)),
      promoterStats(req.params.venueId, from, to),
    ]);
    return {
      from, to,
      promoters: list.map((p) => {
        const s = stats.get(p.id) ?? { bookings: 0, guestsIn: 0, listed: 0, tickets: 0, spend: 0 };
        return { ...p, stats: { ...s, owed: owed(p, s) } };
      }),
    };
  });

  const promoterInput = z.object({
    name: z.string().trim().min(2).max(60), phone: z.string().min(8).max(20).nullish(),
    code: z.string().trim().regex(/^[A-Za-z0-9]{2,12}$/, 'Use 2 to 12 letters or numbers').optional(),
    commissionKind: z.enum(['guest', 'percent']).default('guest'), commission: z.number().int().min(0).max(10_000_000).default(0),
    active: z.boolean().default(true),
  });

  app.post<{ Params: P }>('/venues/:venueId/promoters', async (req, reply) => {
    await venueAccess(req, req.params.venueId);
    const b = parse(promoterInput, req.body);
    if (b.commissionKind === 'percent' && b.commission > 10000) throw badRequest('Commission is over 100%');
    let code = (b.code ?? codeOf(b.name)).toUpperCase();
    const taken = await db.select({ code: schema.promoters.code }).from(schema.promoters).where(eq(schema.promoters.venueId, req.params.venueId));
    if (b.code && taken.some((t) => t.code === code)) throw conflict('Another promoter has this code', 'code_taken');
    for (let i = 2; taken.some((t) => t.code === code); i++) code = `${codeOf(b.name).slice(0, 10)}${i}`;
    const [p] = await db.insert(schema.promoters).values({
      venueId: req.params.venueId, name: b.name, phone: b.phone ? normalizePhone(b.phone) : null, code, token: qrToken(),
      commissionKind: b.commissionKind, commission: b.commission, active: b.active,
    }).returning();
    reply.code(201);
    return p;
  });

  app.patch<{ Params: P & { promoterId: string } }>('/venues/:venueId/promoters/:promoterId', async (req) => {
    await venueAccess(req, req.params.venueId);
    const b = parse(promoterInput.partial().extend({ newLink: z.boolean().optional() }), req.body);
    const set: Partial<typeof schema.promoters.$inferInsert> = {};
    if (b.name) set.name = b.name;
    if (b.phone !== undefined) set.phone = b.phone ? normalizePhone(b.phone) : null;
    if (b.commissionKind) set.commissionKind = b.commissionKind;
    if (b.commission !== undefined) set.commission = b.commission;
    if (b.active !== undefined) set.active = b.active;
    if (b.newLink) set.token = qrToken();
    if (b.code) {
      const code = b.code.toUpperCase();
      const [t] = await db.select({ id: schema.promoters.id }).from(schema.promoters)
        .where(and(eq(schema.promoters.venueId, req.params.venueId), eq(schema.promoters.code, code)));
      if (t && t.id !== req.params.promoterId) throw conflict('Another promoter has this code', 'code_taken');
      set.code = code;
    }
    const [p] = await db.update(schema.promoters).set(set)
      .where(and(eq(schema.promoters.id, req.params.promoterId), eq(schema.promoters.venueId, req.params.venueId))).returning();
    if (!p) throw notFound('Promoter not found');
    return p;
  });

  /* ---------- staff: guest list (the door reads and checks in) */
  app.get<{ Params: P; Querystring: { night?: string } }>('/venues/:venueId/guestlist', async (req) => {
    await venueAccess(req, req.params.venueId);
    const n = parse(ymd.optional(), req.query.night) ?? nightOf();
    return db.select({ l: schema.guestList, promoter: schema.promoters.name }).from(schema.guestList)
      .leftJoin(schema.promoters, eq(schema.promoters.id, schema.guestList.promoterId))
      .where(and(eq(schema.guestList.venueId, req.params.venueId), eq(schema.guestList.night, n)))
      .orderBy(asc(schema.guestList.name))
      .then((rows) => rows.map((r) => ({ ...r.l, promoter: r.promoter })));
  });

  app.post<{ Params: P }>('/venues/:venueId/guestlist', async (req, reply) => {
    const { user } = await venueAccess(req, req.params.venueId);
    const b = parse(listInput.extend({ promoterId: z.string().uuid().nullish() }), req.body);
    if (b.promoterId) {
      const [p] = await db.select({ id: schema.promoters.id }).from(schema.promoters)
        .where(and(eq(schema.promoters.id, b.promoterId), eq(schema.promoters.venueId, req.params.venueId)));
      if (!p) throw badRequest('Unknown promoter');
    }
    reply.code(201);
    return addToList(req.params.venueId, b, b.promoterId ?? null, user.sub);
  });

  app.delete<{ Params: P & { entryId: string } }>('/venues/:venueId/guestlist/:entryId', async (req) => {
    await venueAccess(req, req.params.venueId);
    const [d] = await db.delete(schema.guestList)
      .where(and(eq(schema.guestList.id, req.params.entryId), eq(schema.guestList.venueId, req.params.venueId), isNull(schema.guestList.checkedInAt))).returning();
    if (!d) throw notFound('Not on the list, or already in');
    return { ok: true };
  });

  app.post<{ Params: P & { entryId: string } }>('/venues/:venueId/guestlist/:entryId/checkin', async (req) => {
    await venueAccess(req, req.params.venueId);
    const b = parse(z.object({ undo: z.boolean().default(false) }), req.body ?? {});
    const [row] = await db.select().from(schema.guestList)
      .where(and(eq(schema.guestList.id, req.params.entryId), eq(schema.guestList.venueId, req.params.venueId)));
    if (!row) throw notFound('Not on the list');
    if (!b.undo && row.checkedInAt) return { ok: false, reason: 'already_in', name: row.name };
    if (!b.undo && row.night !== nightOf()) return { ok: false, reason: 'wrong_night', name: row.name };
    await db.update(schema.guestList).set({ checkedInAt: b.undo ? null : new Date() }).where(eq(schema.guestList.id, row.id));
    return { ok: true, type: 'list', name: row.name, plus: row.plus };
  });

  /* ---------- the promoter's own page: /pl/TOKEN */
  async function byToken(token: string) {
    const [row] = await db.select({ p: schema.promoters, v: schema.venues }).from(schema.promoters)
      .innerJoin(schema.venues, eq(schema.venues.id, schema.promoters.venueId)).where(eq(schema.promoters.token, token));
    if (!row || !row.p.active) throw notFound('This link is not valid any more');
    return row;
  }

  app.get<{ Params: { token: string }; Querystring: { night?: string } }>('/public/promoter/:token', async (req) => {
    const { p, v } = await byToken(req.params.token);
    const n = parse(ymd.optional(), req.query.night) ?? nightOf();
    const monthStart = `${nightOf().slice(0, 8)}01`;
    const [list, stats] = await Promise.all([
      db.select().from(schema.guestList).where(and(eq(schema.guestList.promoterId, p.id), eq(schema.guestList.night, n))).orderBy(asc(schema.guestList.createdAt)),
      promoterStats(v.id, monthStart, nightOf()),
    ]);
    const s = stats.get(p.id)!;
    return {
      promoter: { name: p.name, code: p.code, commissionKind: p.commissionKind, commission: p.commission },
      venue: { name: v.name, slug: v.slug, color: v.settings.color ?? null, logo: v.logoUrl ?? null },
      night: n, tonight: nightOf(),
      list: list.map((l) => ({ id: l.id, name: l.name, plus: l.plus, note: l.note, in: !!l.checkedInAt })),
      month: { ...s, owed: owed(p, s) },
    };
  });

  app.post<{ Params: { token: string } }>('/public/promoter/:token/guests', async (req, reply) => {
    const { p, v } = await byToken(req.params.token);
    const b = parse(listInput, req.body);
    reply.code(201);
    const row = await addToList(v.id, b, p.id, null);
    return { id: row.id, name: row.name, plus: row.plus, note: row.note, in: false };
  });

  app.delete<{ Params: { token: string; entryId: string } }>('/public/promoter/:token/guests/:entryId', async (req) => {
    const { p } = await byToken(req.params.token);
    const [d] = await db.delete(schema.guestList)
      .where(and(eq(schema.guestList.id, req.params.entryId), eq(schema.guestList.promoterId, p.id), isNull(schema.guestList.checkedInAt))).returning();
    if (!d) throw notFound('Not on the list, or already in');
    return { ok: true };
  });
}

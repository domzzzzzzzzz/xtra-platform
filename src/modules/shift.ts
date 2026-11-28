import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, venueAccess } from '../lib/http.js';
import { nightOf } from '../lib/dates.js';

/**
 * End of night. What every bill brought in by method (a night runs to 6 AM),
 * bills still open, items voided after they were sent, and the cash count.
 */
type P = { venueId: string };
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const night = (col: unknown) => sql`((${col} at time zone 'Africa/Cairo') - interval '6 hours')::date`;

export async function shiftSummary(venueId: string, day: string) {
  const [methods, bills, open, voids, closes] = await Promise.all([
    db.execute(sql`select p.method, count(*)::int as n, coalesce(sum(p.amount),0)::int as total from tab_payments p
      where p.venue_id = ${venueId} and ${night(sql`p.created_at`)} = ${day} group by p.method`),
    db.execute(sql`select count(*)::int as n, coalesce(sum(total),0)::int as total, coalesce(sum(service),0)::int as service, coalesce(sum(vat),0)::int as vat
      from tabs where venue_id = ${venueId} and status = 'paid' and ${night(sql`paid_at`)} = ${day}`),
    db.select({ id: schema.tabs.id, tableId: schema.tabs.tableId, guestName: schema.tabs.guestName, createdAt: schema.tabs.createdAt })
      .from(schema.tabs).where(and(eq(schema.tabs.venueId, venueId), eq(schema.tabs.status, 'open'))),
    db.execute(sql`select count(*)::int as n, coalesce(sum(i.qty * i.unit_price),0)::int as total from tab_items i join tabs t on t.id = i.tab_id
      where t.venue_id = ${venueId} and i.status = 'void' and i.sent_at is not null and ${night(sql`i.created_at`)} = ${day}`),
    db.select().from(schema.shiftCloses).where(and(eq(schema.shiftCloses.venueId, venueId), eq(schema.shiftCloses.night, day)))
      .orderBy(desc(schema.shiftCloses.createdAt)),
  ]);
  const byMethod: Record<string, number> = {};
  for (const r of methods.rows as any[]) byMethod[r.method] = Number(r.total);
  const tables = open.length
    ? await db.select({ id: schema.floorItems.id, label: schema.floorItems.label }).from(schema.floorItems).where(eq(schema.floorItems.venueId, venueId))
    : [];
  const b = (bills.rows[0] ?? {}) as any;
  const v = (voids.rows[0] ?? {}) as any;
  return {
    night: day,
    byMethod,
    taken: Object.values(byMethod).reduce((s, n) => s + n, 0),
    bills: Number(b.n ?? 0), billsTotal: Number(b.total ?? 0), service: Number(b.service ?? 0), vat: Number(b.vat ?? 0),
    voids: { items: Number(v.n ?? 0), total: Number(v.total ?? 0) },
    open: open.map((t) => ({ id: t.id, table: tables.find((x) => x.id === t.tableId)?.label ?? null, guest: t.guestName, openedAt: t.createdAt })),
    closes,
  };
}

export default async function shift(app: FastifyInstance) {
  app.get<{ Params: P; Querystring: { night?: string } }>('/venues/:venueId/shift', async (req) => {
    await venueAccess(req, req.params.venueId);
    return shiftSummary(req.params.venueId, parse(ymd.optional(), req.query.night) ?? nightOf());
  });

  /* Close the night: save what was expected and what the cash count found. Can be done again (a recount). */
  app.post<{ Params: P }>('/venues/:venueId/shift/close', async (req, reply) => {
    const { user } = await venueAccess(req, req.params.venueId);
    const b = parse(z.object({ night: ymd.optional(), countedCash: z.number().int().min(0), note: z.string().trim().max(300).default('') }), req.body);
    const s = await shiftSummary(req.params.venueId, b.night ?? nightOf());
    const [row] = await db.insert(schema.shiftCloses).values({
      venueId: req.params.venueId, night: s.night, expected: s.byMethod, bills: s.bills, countedCash: b.countedCash, note: b.note, closedBy: user.sub,
    }).returning();
    reply.code(201);
    return { ...row, cashDifference: b.countedCash - (s.byMethod.cash ?? 0), openBills: s.open.length };
  });

  app.get<{ Params: P }>('/venues/:venueId/shift/history', async (req) => {
    await venueAccess(req, req.params.venueId);
    return db.select({ c: schema.shiftCloses, by: schema.users.name }).from(schema.shiftCloses)
      .leftJoin(schema.users, eq(schema.users.id, schema.shiftCloses.closedBy))
      .where(eq(schema.shiftCloses.venueId, req.params.venueId)).orderBy(desc(schema.shiftCloses.createdAt)).limit(30)
      .then((rows) => rows.map((r) => ({ ...r.c, closedByName: r.by, cashDifference: r.c.countedCash - (r.c.expected.cash ?? 0) })));
  });
}

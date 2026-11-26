/** Guests (CRM), community tiers and points, WhatsApp/email campaigns. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, venueAccess, MANAGERS, FLOOR } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { fillTemplate, send } from '../integrations/notify.js';
import { tierFor } from './guests-service.js';

type P = { venueId: string };
type Segment = import('../db/schema.js').Segment;

const segmentBody = z.object({
  tags: z.array(z.string()).optional(),
  tierIds: z.array(z.string().uuid()).optional(),
  minVisits: z.number().int().min(0).optional(),
  lastVisitBeforeDays: z.number().int().min(1).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

/**
 * Guests a campaign can reach. Only guests who opted in on that channel
 * (Egypt data protection law 151/2020) and are not blocked.
 */
export async function audience(venueId: string, channel: 'whatsapp' | 'email', seg: Segment) {
  const conds: SQL[] = [eq(schema.venueGuests.venueId, venueId), eq(schema.venueGuests.blocked, false)];
  if (channel === 'whatsapp') conds.push(eq(schema.guests.whatsappOptIn, true));
  else conds.push(eq(schema.guests.emailOptIn, true), sql`${schema.guests.email} is not null`);
  if (seg.minVisits) conds.push(gte(schema.venueGuests.visits, seg.minVisits));
  if (seg.lastVisitBeforeDays) conds.push(lt(schema.venueGuests.lastVisitAt, new Date(Date.now() - seg.lastVisitBeforeDays * 86400_000)));
  if (seg.gender) conds.push(eq(schema.guests.gender, seg.gender));
  let rows = await db.select({ g: schema.guests, vg: schema.venueGuests }).from(schema.venueGuests)
    .innerJoin(schema.guests, eq(schema.guests.id, schema.venueGuests.guestId)).where(and(...conds));
  if (seg.tags?.length) rows = rows.filter((r) => r.vg.tags.some((t) => seg.tags!.includes(t)));
  if (seg.tierIds?.length) {
    const tiers = await db.select().from(schema.communityTiers).where(eq(schema.communityTiers.venueId, venueId)).orderBy(desc(schema.communityTiers.minSpend));
    rows = rows.filter((r) => {
      const t = tiers.find((x) => x.minSpend <= r.vg.totalSpend);
      return t && seg.tierIds!.includes(t.id);
    });
  }
  return rows;
}

export async function sendCampaign(campaignId: string) {
  const [c] = await db.update(schema.campaigns).set({ status: 'sending' })
    .where(and(eq(schema.campaigns.id, campaignId), or(eq(schema.campaigns.status, 'draft'), eq(schema.campaigns.status, 'scheduled')))).returning();
  if (!c) return null;
  const [venue] = await db.select().from(schema.venues).where(eq(schema.venues.id, c.venueId));
  const people = await audience(c.venueId, c.channel, c.segment);
  let sent = 0;
  let failed = 0;
  for (const { g } of people) {
    const vars = { first_name: g.firstName, last_name: g.lastName, venue: venue.name, referral_code: g.referralCode };
    const body = fillTemplate(c.body, vars);
    const ok = await send({
      channel: c.channel, to: c.channel === 'whatsapp' ? g.phone : g.email!, kind: 'campaign', subject: c.subject ? fillTemplate(c.subject, vars) : undefined,
      body, venueId: c.venueId, guestId: g.id, campaignId: c.id,
      whatsappTemplate: c.whatsappTemplate ? { name: c.whatsappTemplate, params: [g.firstName, venue.name] } : null,
    });
    if (ok) sent++;
    else failed++;
  }
  const [done] = await db.update(schema.campaigns).set({ status: 'sent', sentAt: new Date(), sentCount: sent, failedCount: failed })
    .where(eq(schema.campaigns.id, c.id)).returning();
  return done;
}

/** Sends scheduled campaigns whose time has come. Runs every minute. */
export function startCampaignScheduler() {
  const t = setInterval(async () => {
    try {
      const due = await db.select({ id: schema.campaigns.id }).from(schema.campaigns)
        .where(and(eq(schema.campaigns.status, 'scheduled'), lt(schema.campaigns.scheduledAt, new Date())));
      for (const c of due) await sendCampaign(c.id);
    } catch { /* next tick */ }
  }, 60_000);
  t.unref();
  return t;
}

export default async function crm(app: FastifyInstance) {
  /* ---------- guests */
  app.get<{ Params: P; Querystring: { q?: string; tag?: string; limit?: string; offset?: string } }>('/venues/:venueId/guests', async (req) => {
    await venueAccess(req, req.params.venueId, FLOOR);
    const conds: SQL[] = [eq(schema.venueGuests.venueId, req.params.venueId)];
    if (req.query.q) {
      const q = `%${req.query.q.replace(/[%_]/g, '')}%`;
      conds.push(or(ilike(schema.guests.firstName, q), ilike(schema.guests.lastName, q), ilike(schema.guests.phone, q), ilike(schema.guests.email, q), ilike(schema.guests.instagram, q))!);
    }
    if (req.query.tag) conds.push(sql`${schema.venueGuests.tags} ? ${req.query.tag}`);
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const offset = Number(req.query.offset ?? 0) || 0;
    const rows = await db.select({ g: schema.guests, vg: schema.venueGuests }).from(schema.venueGuests)
      .innerJoin(schema.guests, eq(schema.guests.id, schema.venueGuests.guestId)).where(and(...conds))
      .orderBy(desc(schema.venueGuests.totalSpend), asc(schema.guests.firstName)).limit(limit).offset(offset);
    const tiers = await db.select().from(schema.communityTiers).where(eq(schema.communityTiers.venueId, req.params.venueId)).orderBy(desc(schema.communityTiers.minSpend));
    return rows.map(({ g, vg }) => ({
      id: g.id, firstName: g.firstName, lastName: g.lastName, phone: g.phone, email: g.email, instagram: g.instagram, gender: g.gender,
      whatsappOptIn: g.whatsappOptIn, emailOptIn: g.emailOptIn,
      tags: vg.tags, notes: vg.notes, visits: vg.visits, totalSpend: vg.totalSpend, points: vg.points, blocked: vg.blocked, lastVisitAt: vg.lastVisitAt,
      tier: tiers.find((t) => t.minSpend <= vg.totalSpend)?.name ?? null,
    }));
  });

  app.get<{ Params: P & { guestId: string } }>('/venues/:venueId/guests/:guestId', async (req) => {
    await venueAccess(req, req.params.venueId, FLOOR);
    const [row] = await db.select({ g: schema.guests, vg: schema.venueGuests }).from(schema.venueGuests)
      .innerJoin(schema.guests, eq(schema.guests.id, schema.venueGuests.guestId))
      .where(and(eq(schema.venueGuests.venueId, req.params.venueId), eq(schema.venueGuests.guestId, req.params.guestId)));
    if (!row) throw notFound('Guest not found');
    const history = await db.select({ code: schema.reservations.code, date: schema.reservations.date, status: schema.reservations.status, partySize: schema.reservations.partySize })
      .from(schema.reservations).where(and(eq(schema.reservations.venueId, req.params.venueId), eq(schema.reservations.guestId, row.g.id)))
      .orderBy(desc(schema.reservations.date)).limit(50);
    const pointsHistory = await db.select().from(schema.pointsLedger)
      .where(and(eq(schema.pointsLedger.venueId, req.params.venueId), eq(schema.pointsLedger.guestId, row.g.id))).orderBy(desc(schema.pointsLedger.createdAt)).limit(50);
    return { ...row.g, ...row.vg, tier: await tierFor(db, req.params.venueId, row.vg.totalSpend), history, pointsHistory };
  });

  app.patch<{ Params: P & { guestId: string } }>('/venues/:venueId/guests/:guestId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ tags: z.array(z.string().max(30)).max(30), notes: z.string().max(2000), blocked: z.boolean() }).partial(), req.body);
    const [u] = await db.update(schema.venueGuests).set(b)
      .where(and(eq(schema.venueGuests.venueId, req.params.venueId), eq(schema.venueGuests.guestId, req.params.guestId))).returning();
    if (!u) throw notFound('Guest not found');
    return u;
  });

  /* Manually add or take away points (e.g. a redeemed perk). */
  app.post<{ Params: P & { guestId: string } }>('/venues/:venueId/guests/:guestId/points', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ delta: z.number().int().refine((n) => n !== 0), reason: z.string().min(2).max(100) }), req.body);
    return db.transaction(async (tx) => {
      const [u] = await tx.update(schema.venueGuests).set({ points: sql`${schema.venueGuests.points} + ${b.delta}` })
        .where(and(eq(schema.venueGuests.venueId, req.params.venueId), eq(schema.venueGuests.guestId, req.params.guestId), gte(sql`${schema.venueGuests.points} + ${b.delta}`, 0)))
        .returning();
      if (!u) throw badRequest('Not enough points', 'not_enough_points');
      await tx.insert(schema.pointsLedger).values({ venueId: req.params.venueId, guestId: req.params.guestId, delta: b.delta, reason: b.reason });
      return u;
    });
  });

  /* ---------- community tiers */
  app.get<{ Params: P }>('/venues/:venueId/tiers', async (req) => {
    await venueAccess(req, req.params.venueId, FLOOR);
    return db.select().from(schema.communityTiers).where(eq(schema.communityTiers.venueId, req.params.venueId)).orderBy(asc(schema.communityTiers.minSpend));
  });

  app.put<{ Params: P }>('/venues/:venueId/tiers', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const { tiers } = parse(z.object({
      tiers: z.array(z.object({ name: z.string().min(1).max(30), minSpend: z.number().int().min(0), perks: z.array(z.string().max(100)).max(20), color: z.string().nullish() })).min(1).max(10),
    }), req.body);
    if (!tiers.some((t) => t.minSpend === 0)) throw badRequest('The first tier must start at 0 so every guest has one');
    return db.transaction(async (tx) => {
      await tx.delete(schema.communityTiers).where(eq(schema.communityTiers.venueId, req.params.venueId));
      return tx.insert(schema.communityTiers).values(tiers.map((t, i) => ({ ...t, color: t.color ?? null, sort: i, venueId: req.params.venueId }))).returning();
    });
  });

  /* ---------- campaigns */
  const campaignBody = z.object({
    name: z.string().min(2).max(80),
    channel: z.enum(['whatsapp', 'email']),
    subject: z.string().max(150).nullable().optional(),
    body: z.string().min(2).max(4000),
    whatsappTemplate: z.string().max(100).nullable().optional(),
    segment: segmentBody.default({}),
    scheduledAt: z.coerce.date().nullable().optional(),
  });

  app.get<{ Params: P }>('/venues/:venueId/campaigns', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    return db.select().from(schema.campaigns).where(eq(schema.campaigns.venueId, req.params.venueId)).orderBy(desc(schema.campaigns.createdAt));
  });

  app.post<{ Params: P }>('/venues/:venueId/campaigns', async (req, reply) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(campaignBody, req.body);
    if (b.channel === 'email' && !b.subject) throw badRequest('Add a subject for the email');
    const [c] = await db.insert(schema.campaigns).values({
      ...b, venueId: req.params.venueId, status: b.scheduledAt ? 'scheduled' : 'draft',
    }).returning();
    reply.code(201);
    return c;
  });

  app.patch<{ Params: P & { id: string } }>('/venues/:venueId/campaigns/:id', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(campaignBody.partial(), req.body);
    const [c] = await db.update(schema.campaigns).set({ ...b, ...(b.scheduledAt !== undefined ? { status: b.scheduledAt ? 'scheduled' : 'draft' } : {}) })
      .where(and(eq(schema.campaigns.id, req.params.id), eq(schema.campaigns.venueId, req.params.venueId), or(eq(schema.campaigns.status, 'draft'), eq(schema.campaigns.status, 'scheduled')))).returning();
    if (!c) throw conflict('Only drafts and scheduled campaigns can be edited');
    return c;
  });

  /* How many people a segment reaches, before sending. */
  app.post<{ Params: P }>('/venues/:venueId/campaigns/audience', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ channel: z.enum(['whatsapp', 'email']), segment: segmentBody.default({}) }), req.body);
    return { count: (await audience(req.params.venueId, b.channel, b.segment)).length };
  });

  app.post<{ Params: P & { id: string } }>('/venues/:venueId/campaigns/:id/send', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const [c] = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, req.params.id), eq(schema.campaigns.venueId, req.params.venueId)));
    if (!c) throw notFound('Campaign not found');
    const done = await sendCampaign(c.id);
    if (!done) throw conflict('This campaign was already sent');
    return done;
  });
}

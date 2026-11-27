/**
 * Waitlist: when an event or a ticket type is sold out, guests leave their
 * name and number. When places open up again (a refund, a cancelled invite,
 * staff reopening a type or adding places), the first guests in line get one
 * message each, in the order they joined. Staff can also tell someone by hand.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { MANAGERS, parse, venueAccess } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { normalizePhone } from '../lib/codes.js';
import { notifyGuest } from '../integrations/notify.js';
import { waitlistOpen } from './guest-messages.js';
import { availability } from './ticketing-service.js';

/** Templates added after the first batch go by WhatsApp only once listed in WHATSAPP_NEW_TEMPLATES (approved by Meta). */
export const waOn = (name: string) => config.whatsapp.newTemplates.includes(name);

type Entry = typeof schema.waitlist.$inferSelect;

async function tell(e: Entry) {
  const [row] = await db.select({ ev: schema.events, v: schema.venues }).from(schema.events)
    .innerJoin(schema.venues, eq(schema.venues.id, schema.events.venueId)).where(eq(schema.events.id, e.eventId));
  if (!row) return;
  const [z] = e.zoneId ? await db.select({ name: schema.eventZones.name }).from(schema.eventZones).where(eq(schema.eventZones.id, e.zoneId)) : [];
  const when = row.ev.startsAt.toLocaleString('en-GB', { timeZone: row.v.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  const msg = waitlistOpen(row.v, { firstName: e.name.split(' ')[0] || 'there' }, { event: row.ev.title, when, eventId: row.ev.id, type: z?.name });
  await notifyGuest({ channel: waOn('xtra_waitlist_open') ? 'both' : 'email', phone: e.phone, email: e.email, venueId: e.venueId, guestId: e.guestId ?? undefined, ...msg });
  await db.update(schema.waitlist).set({ status: 'notified', notifiedAt: new Date() }).where(eq(schema.waitlist.id, e.id));
}

/** Tell the next guests in line about places that are free now. Returns how many were told. */
export async function notifyWaitlist(eventId: string) {
  const waiting = await db.select().from(schema.waitlist)
    .where(and(eq(schema.waitlist.eventId, eventId), eq(schema.waitlist.status, 'waiting'))).orderBy(asc(schema.waitlist.createdAt));
  if (!waiting.length) return 0;
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, eventId));
  if (!ev || ev.status !== 'published' || ev.inviteOnly || ev.startsAt.getTime() + 6 * 3600_000 < Date.now()) return 0;
  const av = await availability(db, eventId);
  const left = new Map(av.zones.filter((z) => z.kind !== 'decor').map((z) => [z.id, z.left]));
  let told = 0;
  for (const e of waiting) {
    // A guest who wants any type takes the type with the most room. Only tell them when their whole group fits.
    const zid = e.zoneId && left.has(e.zoneId) ? e.zoneId : [...left.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!zid || (left.get(zid) ?? 0) < e.qty) continue;
    left.set(zid, (left.get(zid) ?? 0) - e.qty);
    await tell(e);
    told++;
  }
  return told;
}

/** Someone on the list bought tickets: take them off. */
export async function markWaitlistBought(eventId: string, phone: string | null) {
  if (!phone) return;
  await db.update(schema.waitlist).set({ status: 'bought' })
    .where(and(eq(schema.waitlist.eventId, eventId), eq(schema.waitlist.phone, normalizePhone(phone)), inArray(schema.waitlist.status, ['waiting', 'notified'])));
}

export default async function waitlist(app: FastifyInstance) {
  /* Guest joins the waitlist of a sold-out event or ticket type. */
  app.post<{ Params: { eventId: string } }>('/public/events/:eventId/waitlist', async (req, reply) => {
    const eventId = parse(z.string().uuid(), req.params.eventId);
    const b = parse(z.object({
      zoneId: z.string().uuid().nullable().optional(),
      name: z.string().trim().min(2).max(80),
      phone: z.string().min(8).max(20),
      email: z.string().email().optional(),
      qty: z.number().int().min(1).max(10).default(1),
    }), req.body);
    const [row] = await db.select({ ev: schema.events, v: schema.venues }).from(schema.events)
      .innerJoin(schema.venues, eq(schema.venues.id, schema.events.venueId)).where(eq(schema.events.id, eventId));
    if (!row || row.ev.status !== 'published' || !row.v.features.includes('ticketing')) throw notFound('Event not found');
    const av = await availability(db, eventId);
    const types = av.zones.filter((z) => z.kind !== 'decor');
    if (b.zoneId) {
      const z = types.find((x) => x.id === b.zoneId);
      if (!z) throw badRequest('Unknown ticket type');
      if (!z.soldOut) throw conflict(`${z.name} still has places. You can book now.`, 'not_sold_out');
    } else if (types.some((z) => !z.soldOut)) throw conflict('There are still tickets. You can book now.', 'not_sold_out');
    const phone = normalizePhone(b.phone);
    const [guest] = await db.select({ id: schema.guests.id }).from(schema.guests).where(eq(schema.guests.phone, phone));
    const [mine] = await db.select().from(schema.waitlist).where(and(eq(schema.waitlist.eventId, eventId), eq(schema.waitlist.phone, phone), eq(schema.waitlist.status, 'waiting')));
    const values = { zoneId: b.zoneId ?? null, name: b.name, email: b.email ?? null, qty: b.qty, guestId: guest?.id ?? null };
    const [e] = mine
      ? await db.update(schema.waitlist).set(values).where(eq(schema.waitlist.id, mine.id)).returning()
      : await db.insert(schema.waitlist).values({ ...values, venueId: row.v.id, eventId, phone }).returning();
    const ahead = (await db.select({ id: schema.waitlist.id, at: schema.waitlist.createdAt }).from(schema.waitlist)
      .where(and(eq(schema.waitlist.eventId, eventId), eq(schema.waitlist.status, 'waiting')))).filter((x) => x.at < e.createdAt).length;
    reply.code(mine ? 200 : 201);
    return { joined: true, position: ahead + 1 };
  });

  app.get<{ Params: { venueId: string; eventId: string } }>('/venues/:venueId/events/:eventId/waitlist', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const rows = await db.select({ w: schema.waitlist, zone: schema.eventZones.name }).from(schema.waitlist)
      .leftJoin(schema.eventZones, eq(schema.eventZones.id, schema.waitlist.zoneId))
      .where(and(eq(schema.waitlist.venueId, req.params.venueId), eq(schema.waitlist.eventId, req.params.eventId), inArray(schema.waitlist.status, ['waiting', 'notified', 'bought'])))
      .orderBy(asc(schema.waitlist.createdAt));
    return rows.map(({ w, zone }) => ({ id: w.id, name: w.name, phone: w.phone, email: w.email, qty: w.qty, type: zone, status: w.status, notifiedAt: w.notifiedAt, createdAt: w.createdAt }));
  });

  /* Tell one guest now, whatever the count says (staff know best). */
  app.post<{ Params: { venueId: string; eventId: string; id: string } }>('/venues/:venueId/events/:eventId/waitlist/:id/notify', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const [e] = await db.select().from(schema.waitlist).where(and(eq(schema.waitlist.id, parse(z.string().uuid(), req.params.id)), eq(schema.waitlist.venueId, req.params.venueId)));
    if (!e) throw notFound('Not on the waitlist');
    await tell(e);
    return { notified: true };
  });

  app.delete<{ Params: { venueId: string; eventId: string; id: string } }>('/venues/:venueId/events/:eventId/waitlist/:id', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const [e] = await db.update(schema.waitlist).set({ status: 'removed' })
      .where(and(eq(schema.waitlist.id, parse(z.string().uuid(), req.params.id)), eq(schema.waitlist.venueId, req.params.venueId))).returning();
    if (!e) throw notFound('Not on the waitlist');
    return { removed: true };
  });
}

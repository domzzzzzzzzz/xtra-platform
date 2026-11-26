import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, venueAccess, MANAGERS } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { normalizePhone, promoCode, slugify } from '../lib/codes.js';
import { config } from '../config.js';
import { startPayment } from './payments.js';
import { imageRef } from './media.js';
import {
  availability, applyPromo, checkoutInput, feeRatesFor, hold, holdInput, onTicketsPaid, orderByCode, prepareCheckout,
} from './ticketing-service.js';

type P = { venueId: string };
type PE = P & { eventId: string };

const eventBody = z.object({
  title: z.string().min(2).max(120),
  slug: z.string().optional(),
  posterUrl: imageRef.nullable().optional(),
  description: z.string().max(5000).default(''),
  lineup: z.string().max(200).default(''),
  color: z.string().max(20).nullable().optional(),
  seatMap: z.boolean().default(true),
  rules: z.array(z.string().max(200)).max(30).default([]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  bookingFeeBps: z.number().int().min(0).max(5000).nullable().optional(),
  maxPerOrder: z.number().int().min(1).max(100).default(10),
});

const zoneBody = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(60),
  kind: z.enum(schema.zoneKind.enumValues),
  price: z.number().int().min(0).default(0),
  capacity: z.number().int().min(0).default(0),
  seatsPerTable: z.number().int().min(1).max(50).default(1),
  shape: z.string().max(20).nullish(),
  x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(),
  color: z.string().nullish(),
  sort: z.number().int().default(0),
  seats: z.array(z.object({
    id: z.string().uuid().optional(), label: z.string().min(1).max(20), x: z.number().default(0), y: z.number().default(0),
    seats: z.number().int().min(1).max(50).default(1), shape: z.string().max(20).nullish(), rotation: z.number().default(0), enabled: z.boolean().default(true),
  })).max(2000).default([]),
});

async function loadEvent(venueId: string, eventId: string) {
  const [e] = await db.select().from(schema.events).where(and(eq(schema.events.id, eventId), eq(schema.events.venueId, venueId)));
  if (!e) throw notFound('Event not found');
  return e;
}

async function eventMap(eventId: string) {
  const av = await availability(db, eventId);
  return { zones: av.zones.sort((a, b) => a.sort - b.sort), seats: av.seats };
}

export default async function ticketing(app: FastifyInstance) {
  /* ================= staff ================= */

  /* Every event with its map, what is sold and what it made. */
  app.get<{ Params: P }>('/venues/:venueId/events', async (req) => {
    await venueAccess(req, req.params.venueId, ['owner', 'manager', 'door']);
    const list = await db.select().from(schema.events).where(eq(schema.events.venueId, req.params.venueId)).orderBy(asc(schema.events.startsAt));
    return Promise.all(list.map(async (e) => {
      const map = await eventMap(e.id);
      const sold = await db.select({ zoneId: schema.tickets.zoneId, seatId: schema.tickets.seatId, n: sql<number>`count(*)::int`, inN: sql<number>`count(${schema.tickets.checkedInAt})::int` })
        .from(schema.tickets).innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.tickets.orderId))
        .where(and(eq(schema.tickets.eventId, e.id), eq(schema.ticketOrders.status, 'paid'))).groupBy(schema.tickets.zoneId, schema.tickets.seatId);
      const paid = await db.select({ net: sql<number>`coalesce(sum(${schema.ticketOrders.subtotal} - ${schema.ticketOrders.discount}),0)::int`, n: sql<number>`count(*)::int` })
        .from(schema.ticketOrders).where(and(eq(schema.ticketOrders.eventId, e.id), eq(schema.ticketOrders.status, 'paid')));
      return {
        ...e, ...map,
        soldByZone: Object.fromEntries(map.zones.map((z) => [z.id, sold.filter((s) => s.zoneId === z.id).reduce((a, s) => a + s.n, 0)])),
        soldSeats: [...new Set(sold.filter((s) => s.seatId).map((s) => s.seatId))],
        checkedIn: sold.reduce((a, s) => a + s.inN, 0),
        revenue: paid[0].net, orders: paid[0].n,
      };
    }));
  });

  app.post<{ Params: P }>('/venues/:venueId/events', async (req, reply) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(eventBody, req.body);
    const slug = slugify(b.slug ?? `${b.title}-${b.startsAt.toISOString().slice(0, 10)}`);
    const [taken] = await db.select({ id: schema.events.id }).from(schema.events).where(and(eq(schema.events.venueId, req.params.venueId), eq(schema.events.slug, slug)));
    if (taken) throw conflict('An event with this link already exists', 'slug_taken');
    const [e] = await db.insert(schema.events).values({ ...b, slug, venueId: req.params.venueId }).returning();
    reply.code(201);
    return e;
  });

  app.get<{ Params: PE }>('/venues/:venueId/events/:eventId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const e = await loadEvent(req.params.venueId, req.params.eventId);
    return { ...e, ...(await eventMap(e.id)) };
  });

  app.patch<{ Params: PE }>('/venues/:venueId/events/:eventId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    await loadEvent(req.params.venueId, req.params.eventId);
    const b = parse(eventBody.partial().omit({ slug: true }).extend({ status: z.enum(schema.eventStatus.enumValues).optional() }), req.body);
    if (b.status === 'published') {
      const zones = await db.select().from(schema.eventZones).where(eq(schema.eventZones.eventId, req.params.eventId));
      if (!zones.some((z) => z.kind !== 'decor')) throw badRequest('Add at least one ticket type before publishing', 'no_tickets');
    }
    const [e] = await db.update(schema.events).set(b).where(eq(schema.events.id, req.params.eventId)).returning();
    return e;
  });

  /** Save the event's own seat map and ticket types (whole map at once). */
  app.put<{ Params: PE }>('/venues/:venueId/events/:eventId/map', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const e = await loadEvent(req.params.venueId, req.params.eventId);
    const { zones } = parse(z.object({ zones: z.array(zoneBody).max(200) }), req.body);
    await db.transaction(async (tx) => {
      const sold = await tx.select({ zoneId: schema.ticketOrderLines.zoneId, seatId: schema.ticketOrderLines.seatId }).from(schema.ticketOrderLines)
        .innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.ticketOrderLines.orderId))
        .where(and(eq(schema.ticketOrders.eventId, e.id), inArray(schema.ticketOrders.status, ['held', 'paid'])));
      const soldZones = new Set(sold.map((s) => s.zoneId));
      const soldSeats = new Set(sold.filter((s) => s.seatId).map((s) => s.seatId!));
      const existing = await tx.select().from(schema.eventZones).where(eq(schema.eventZones.eventId, e.id));
      const keep = new Set(zones.filter((z) => z.id).map((z) => z.id!));
      for (const ex of existing) {
        if (keep.has(ex.id)) continue;
        if (soldZones.has(ex.id)) throw conflict(`${ex.name} has sales and cannot be removed`, 'zone_has_sales');
        await tx.delete(schema.eventZones).where(eq(schema.eventZones.id, ex.id));
      }
      for (const zb of zones) {
        const { seats, id: zid, ...values } = zb;
        let zoneId = zid;
        if (zoneId) {
          if (!existing.some((x) => x.id === zoneId)) throw badRequest('Unknown zone');
          await tx.update(schema.eventZones).set(values).where(eq(schema.eventZones.id, zoneId));
        } else {
          [{ id: zoneId }] = await tx.insert(schema.eventZones).values({ ...values, eventId: e.id }).returning({ id: schema.eventZones.id });
        }
        const exSeats = await tx.select().from(schema.eventSeats).where(eq(schema.eventSeats.zoneId, zoneId!));
        const keepSeats = new Set(seats.filter((s) => s.id).map((s) => s.id!));
        for (const s of exSeats) {
          if (keepSeats.has(s.id)) continue;
          if (soldSeats.has(s.id)) throw conflict(`Seat ${s.label} is sold and cannot be removed`, 'seat_has_sales');
          await tx.delete(schema.eventSeats).where(eq(schema.eventSeats.id, s.id));
        }
        for (const s of seats) {
          const sv = { label: s.label, x: s.x, y: s.y, enabled: s.enabled, seats: s.seats, shape: s.shape ?? null, rotation: s.rotation };
          if (s.id) await tx.update(schema.eventSeats).set(sv).where(and(eq(schema.eventSeats.id, s.id), eq(schema.eventSeats.zoneId, zoneId!)));
          else await tx.insert(schema.eventSeats).values({ eventId: e.id, zoneId: zoneId!, ...sv });
        }
      }
    });
    return eventMap(e.id);
  });

  app.get<{ Params: PE }>('/venues/:venueId/events/:eventId/sales', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const e = await loadEvent(req.params.venueId, req.params.eventId);
    const orders = await db.select().from(schema.ticketOrders).where(and(eq(schema.ticketOrders.eventId, e.id), eq(schema.ticketOrders.status, 'paid')));
    const byZone = await db.select({
      zoneId: schema.tickets.zoneId, name: schema.eventZones.name,
      sold: sql<number>`count(*)::int`, checkedIn: sql<number>`count(${schema.tickets.checkedInAt})::int`,
    }).from(schema.tickets).innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.tickets.orderId))
      .innerJoin(schema.eventZones, eq(schema.eventZones.id, schema.tickets.zoneId))
      .where(and(eq(schema.tickets.eventId, e.id), eq(schema.ticketOrders.status, 'paid')))
      .groupBy(schema.tickets.zoneId, schema.eventZones.name);
    const sum = (k: 'subtotal' | 'discount' | 'fee' | 'feeVat' | 'total') => orders.reduce((s, o) => s + o[k], 0);
    return {
      orders: orders.length,
      tickets: byZone.reduce((s, z) => s + z.sold, 0),
      checkedIn: byZone.reduce((s, z) => s + z.checkedIn, 0),
      gross: sum('subtotal'), discounts: sum('discount'), fees: sum('fee'), feeVat: sum('feeVat'), collected: sum('total'),
      /** What the venue receives: ticket price after discounts. Fees + VAT on fees go to XTRA. */
      venuePayout: sum('subtotal') - sum('discount'),
      byZone,
    };
  });

  app.get<{ Params: PE }>('/venues/:venueId/events/:eventId/tickets', async (req) => {
    await venueAccess(req, req.params.venueId, ['owner', 'manager', 'door']);
    const e = await loadEvent(req.params.venueId, req.params.eventId);
    return db.select({
      id: schema.tickets.id, firstName: schema.tickets.firstName, lastName: schema.tickets.lastName, phone: schema.tickets.phone,
      zone: schema.eventZones.name, checkedInAt: schema.tickets.checkedInAt, orderCode: schema.ticketOrders.code,
    }).from(schema.tickets).innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.tickets.orderId))
      .innerJoin(schema.eventZones, eq(schema.eventZones.id, schema.tickets.zoneId))
      .where(and(eq(schema.tickets.eventId, e.id), eq(schema.ticketOrders.status, 'paid'))).orderBy(asc(schema.tickets.firstName));
  });

  /* ---------- promo codes */
  const promoBody = z.object({
    eventId: z.string().uuid().nullable().default(null),
    percentOff: z.number().int().min(1).max(100),
    maxUses: z.number().int().min(1).nullable().default(null),
    lockedPhone: z.string().min(8).nullable().default(null),
    label: z.string().max(80).nullable().default(null),
    expiresAt: z.coerce.date().nullable().default(null),
  });

  app.get<{ Params: P; Querystring: { eventId?: string } }>('/venues/:venueId/promos', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const conds = [eq(schema.promoCodes.venueId, req.params.venueId)];
    if (req.query.eventId) conds.push(eq(schema.promoCodes.eventId, req.query.eventId));
    return db.select().from(schema.promoCodes).where(and(...conds)).orderBy(desc(schema.promoCodes.createdAt));
  });

  app.post<{ Params: P }>('/venues/:venueId/promos', async (req, reply) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(promoBody.extend({ code: z.string().regex(/^[A-Za-z0-9_-]{3,30}$/) }), req.body);
    if (b.eventId) await loadEvent(req.params.venueId, b.eventId);
    const code = b.code.toUpperCase();
    const [dup] = await db.select({ id: schema.promoCodes.id }).from(schema.promoCodes).where(and(eq(schema.promoCodes.venueId, req.params.venueId), eq(schema.promoCodes.code, code)));
    if (dup) throw conflict('This code already exists', 'code_taken');
    const [p] = await db.insert(schema.promoCodes).values({
      ...b, code, venueId: req.params.venueId, lockedPhone: b.lockedPhone ? normalizePhone(b.lockedPhone) : null,
    }).returning();
    reply.code(201);
    return p;
  });

  /**
   * Generate many unique single-use codes at once. Pass phones to lock each
   * code to one guest (one code per phone).
   */
  app.post<{ Params: P }>('/venues/:venueId/promos/batch', async (req, reply) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(promoBody.omit({ maxUses: true }).extend({
      count: z.number().int().min(1).max(5000).optional(),
      phones: z.array(z.string().min(8)).max(5000).optional(),
      prefix: z.string().regex(/^[A-Za-z0-9-]{0,10}$/).default(''),
      /** How many times each code works. */
      usesPerCode: z.number().int().min(1).max(100).default(1),
    }), req.body);
    if (b.eventId) await loadEvent(req.params.venueId, b.eventId);
    const phones = b.phones?.map(normalizePhone);
    const lockAll = b.lockedPhone ? normalizePhone(b.lockedPhone) : null;
    const count = phones?.length ?? b.count;
    if (!count) throw badRequest('Give a number of codes or a list of phone numbers');
    const batchId = crypto.randomUUID();
    const prefix = b.prefix.toUpperCase();
    const rows = Array.from({ length: count }, (_, i) => ({
      venueId: req.params.venueId, eventId: b.eventId, code: `${prefix}${promoCode()}`, percentOff: b.percentOff, maxUses: b.usesPerCode,
      lockedPhone: phones?.[i] ?? lockAll, batchId, label: b.label, expiresAt: b.expiresAt,
    }));
    const created = await db.insert(schema.promoCodes).values(rows).onConflictDoNothing().returning();
    reply.code(201);
    return { batchId, created: created.length, codes: created.map((c) => ({ code: c.code, lockedPhone: c.lockedPhone })) };
  });

  /* Pause / restart a whole batch of unique codes. */
  app.patch<{ Params: P & { batchId: string } }>('/venues/:venueId/promos/batch/:batchId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ active: z.boolean() }), req.body);
    const rows = await db.update(schema.promoCodes).set({ active: b.active })
      .where(and(eq(schema.promoCodes.venueId, req.params.venueId), eq(schema.promoCodes.batchId, req.params.batchId))).returning();
    return { updated: rows.length };
  });

  /* Delete codes nobody used; used codes are paused instead so sales keep their history. */
  app.delete<{ Params: P & { batchId: string } }>('/venues/:venueId/promos/batch/:batchId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const where = and(eq(schema.promoCodes.venueId, req.params.venueId), eq(schema.promoCodes.batchId, req.params.batchId));
    const paused = await db.update(schema.promoCodes).set({ active: false, batchId: null, label: null }).where(and(where, sql`${schema.promoCodes.usedCount} > 0`)).returning();
    const gone = await db.delete(schema.promoCodes).where(where).returning();
    return { deleted: gone.length, paused: paused.length };
  });

  app.delete<{ Params: P & { promoId: string } }>('/venues/:venueId/promos/:promoId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const where = and(eq(schema.promoCodes.id, req.params.promoId), eq(schema.promoCodes.venueId, req.params.venueId));
    const [p] = await db.select().from(schema.promoCodes).where(where);
    if (!p) throw notFound('Code not found');
    if (p.usedCount > 0) {
      await db.update(schema.promoCodes).set({ active: false }).where(where);
      return { deleted: false, paused: true };
    }
    await db.delete(schema.promoCodes).where(where);
    return { deleted: true };
  });

  app.patch<{ Params: P & { promoId: string } }>('/venues/:venueId/promos/:promoId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ active: z.boolean(), percentOff: z.number().int().min(1).max(100), maxUses: z.number().int().min(1).nullable(), expiresAt: z.coerce.date().nullable(), label: z.string().nullable() }).partial(), req.body);
    const [p] = await db.update(schema.promoCodes).set(b).where(and(eq(schema.promoCodes.id, req.params.promoId), eq(schema.promoCodes.venueId, req.params.venueId))).returning();
    if (!p) throw notFound('Code not found');
    return p;
  });

  /* ================= public (guest) ================= */

  app.get<{ Params: { slug: string } }>('/public/venues/:slug/events', async (req) => {
    const [v] = await db.select().from(schema.venues).where(and(eq(schema.venues.slug, req.params.slug), eq(schema.venues.active, true)));
    if (!v || !v.features.includes('ticketing')) throw notFound('Venue not found');
    return db.select({ id: schema.events.id, slug: schema.events.slug, title: schema.events.title, posterUrl: schema.events.posterUrl, startsAt: schema.events.startsAt })
      .from(schema.events).where(and(eq(schema.events.venueId, v.id), eq(schema.events.status, 'published'), sql`${schema.events.startsAt} > now() - interval '6 hours'`))
      .orderBy(asc(schema.events.startsAt));
  });

  app.get<{ Params: { eventId: string } }>('/public/events/:eventId', async (req) => {
    const id = parse(z.string().uuid(), req.params.eventId);
    const [row] = await db.select({ e: schema.events, v: schema.venues }).from(schema.events)
      .innerJoin(schema.venues, eq(schema.venues.id, schema.events.venueId)).where(and(eq(schema.events.id, id), eq(schema.events.status, 'published')));
    if (!row || !row.v.features.includes('ticketing')) throw notFound('Event not found');
    const { e, v } = row;
    const map = await eventMap(e.id);
    const rates = await feeRatesFor(e.id);
    const priced = map.zones.filter((z) => z.kind !== 'decor');
    return {
      event: { id: e.id, title: e.title, posterUrl: e.posterUrl, description: e.description, lineup: e.lineup, color: e.color, seatMap: e.seatMap, rules: e.rules, startsAt: e.startsAt, endsAt: e.endsAt, maxPerOrder: e.maxPerOrder },
      venue: { name: v.name, slug: v.slug, logoUrl: v.logoUrl, address: v.address, mapUrl: v.mapUrl, lat: v.mapLat, lng: v.mapLng, photoUrl: v.photoUrl, instagram: v.instagram, tiktok: v.tiktok, where: v.settings.where ?? v.address ?? '', color: v.settings.color ?? null, timezone: v.timezone },
      priceFrom: priced.length ? Math.min(...priced.map((z) => z.price)) : 0,
      fees: rates,
      holdMinutes: config.holdMinutes,
      zones: map.zones.map(({ capacity: _c, ...z }) => z),
      seats: map.seats.map((s) => ({ id: s.id, zoneId: s.zoneId, label: s.label, x: s.x, y: s.y, seats: s.seats, shape: s.shape, rotation: s.rotation, taken: s.taken })),
    };
  });

  app.post<{ Params: { eventId: string } }>('/public/events/:eventId/hold', async (req, reply) => {
    const id = parse(z.string().uuid(), req.params.eventId);
    const [ev] = await db.select({ f: schema.venues.features }).from(schema.events).innerJoin(schema.venues, eq(schema.venues.id, schema.events.venueId)).where(eq(schema.events.id, id));
    if (!ev || !ev.f.includes('ticketing')) throw notFound('Event not found');
    const order = await hold(id, parse(holdInput, req.body));
    reply.code(201);
    return publicOrder(order);
  });

  app.get<{ Params: { code: string } }>('/public/orders/:code', async (req) => publicOrder(await orderByCode(req.params.code)));

  /* Let go of held seats (the guest went back to change their picks). */
  app.post<{ Params: { code: string } }>('/public/orders/:code/release', async (req) => {
    const o = await orderByCode(req.params.code);
    const [done] = await db.update(schema.ticketOrders).set({ status: 'expired' })
      .where(and(eq(schema.ticketOrders.id, o.id), eq(schema.ticketOrders.status, 'held'))).returning();
    if (done?.promoCodeId) await db.update(schema.promoCodes).set({ usedCount: sql`greatest(${schema.promoCodes.usedCount} - 1, 0)` }).where(eq(schema.promoCodes.id, done.promoCodeId));
    return { released: Boolean(done) };
  });

  app.post<{ Params: { code: string } }>('/public/orders/:code/promo', async (req) => {
    const b = parse(z.object({ code: z.string().max(40).nullable(), phone: z.string().optional() }), req.body);
    return publicOrder(await applyPromo(req.params.code, b.code, b.phone));
  });

  app.post<{ Params: { code: string } }>('/public/orders/:code/checkout', async (req) => {
    const input = parse(checkoutInput, req.body);
    const { order, guest } = await prepareCheckout(req.params.code, input);
    if (order.total === 0) {
      await onTicketsPaid(order.id);
      return { status: 'paid', order: await publicOrder(await orderByCode(order.code)) };
    }
    const [event] = await db.select({ title: schema.events.title }).from(schema.events).where(eq(schema.events.id, order.eventId));
    const pay = await startPayment({
      venueId: order.venueId, purpose: 'tickets', refId: order.id, amount: order.total, description: `Tickets: ${event.title}`,
      customer: { firstName: guest.firstName, lastName: guest.lastName, email: order.buyerEmail, phone: guest.phone },
      redirectUrl: `${config.publicAppUrl}/o/${order.code}`,
    });
    return { status: 'pending', checkoutUrl: pay.checkoutUrl, order: await publicOrder(order) };
  });
}

async function publicOrder(o: typeof schema.ticketOrders.$inferSelect) {
  const rows = await db.select({ zone: schema.eventZones.name, kind: schema.eventZones.kind, seat: schema.eventSeats.label, seats: schema.eventSeats.seats, qty: schema.ticketOrderLines.qty, unitPrice: schema.ticketOrderLines.unitPrice })
    .from(schema.ticketOrderLines).innerJoin(schema.eventZones, eq(schema.eventZones.id, schema.ticketOrderLines.zoneId))
    .leftJoin(schema.eventSeats, eq(schema.eventSeats.id, schema.ticketOrderLines.seatId)).where(eq(schema.ticketOrderLines.orderId, o.id))
    .orderBy(asc(schema.eventZones.sort), asc(schema.eventSeats.label));
  /** `tickets` is how many people the line admits: a table admits one per seat. */
  const lines = rows.map(({ seats, ...l }) => ({ ...l, tickets: l.kind === 'table' && l.seat ? Math.max(1, seats ?? 1) : l.qty }));
  let promo: string | null = null;
  if (o.promoCodeId) [{ code: promo }] = await db.select({ code: schema.promoCodes.code }).from(schema.promoCodes).where(eq(schema.promoCodes.id, o.promoCodeId));
  const tickets = o.status === 'paid'
    ? (await db.select({ firstName: schema.tickets.firstName, lastName: schema.tickets.lastName, qrToken: schema.tickets.qrToken, zone: schema.eventZones.name, seat: schema.eventSeats.label })
      .from(schema.tickets).innerJoin(schema.eventZones, eq(schema.eventZones.id, schema.tickets.zoneId)).leftJoin(schema.eventSeats, eq(schema.eventSeats.id, schema.tickets.seatId))
      .where(eq(schema.tickets.orderId, o.id)).orderBy(asc(schema.eventZones.sort), asc(schema.eventSeats.label), asc(schema.tickets.lastName)))
      .map((t) => ({ name: `${t.firstName} ${t.lastName}`.trim(), label: t.seat ? `Table ${t.seat}` : t.zone, url: `${config.publicAppUrl}/t/${t.qrToken}` }))
    : [];
  return {
    code: o.code, status: o.status, eventId: o.eventId, holdExpiresAt: o.holdExpiresAt,
    secondsLeft: o.status === 'held' ? Math.max(0, Math.floor((o.holdExpiresAt.getTime() - Date.now()) / 1000)) : 0,
    lines, promo,
    totals: { tickets: o.subtotal, discount: o.discount, fee: o.fee, feeVat: o.feeVat, total: o.total, feePercent: o.feeBps / 100, vatPercent: o.feeVatBps / 100 },
    tickets,
  };
}

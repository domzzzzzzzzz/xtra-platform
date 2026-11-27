/** Guest-facing endpoints: venue booking page, booking status, passes, guest account. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { guestUser, parse } from '../lib/http.js';
import { conflict, notFound } from '../lib/errors.js';
import { byNight, nightOf, weekdayOf } from '../lib/dates.js';
import { qrPng } from '../integrations/qr.js';
import { applePass, applePkpass, appleWalletReady, googleWalletLink, googleWalletReady } from '../integrations/wallet.js';
import { appleImages, livePass } from './passes.js';
import { config } from '../config.js';
import { acceptReservation, bookingInput, createBooking, statusUrl } from './reservations.js';
import { startPayment } from './payments.js';
import { tierFor } from './guests-service.js';

async function venueBySlug(slug: string, feature?: string) {
  const [v] = await db.select().from(schema.venues).where(and(eq(schema.venues.slug, slug), eq(schema.venues.active, true)));
  if (!v) throw notFound('Venue not found');
  if (feature && !v.features.includes(feature)) throw notFound('This venue does not take bookings online');
  return v;
}

export default async function publicRoutes(app: FastifyInstance) {
  /* The venue's white-label booking page. */
  app.get<{ Params: { slug: string } }>('/public/venues/:slug', async (req) => {
    const v = await venueBySlug(req.params.slug, 'reservations');
    const items = await db.select().from(schema.floorItems).where(and(eq(schema.floorItems.venueId, v.id), eq(schema.floorItems.enabled, true)))
      .orderBy(asc(schema.floorItems.sort));
    const s = v.settings;
    return {
      venue: { name: v.name, slug: v.slug, logoUrl: v.logoUrl, address: v.address, mapUrl: v.mapUrl, lat: v.mapLat, lng: v.mapLng, photoUrl: v.photoUrl, instagram: v.instagram, tiktok: v.tiktok, phone: v.phone, where: s.where ?? v.address ?? '', color: s.color ?? null },
      depositPerPerson: v.depositPerPerson,
      notifyChannel: 'both',
      askNames: s.askNames ?? true,
      mapPick: s.mapPick ?? false,
      socials: s.socials ?? {},
      areas: items.filter((i) => i.kind === 'zone').map((z) => ({ id: z.id, name: z.label, minSpend: z.minSpend, deposit: z.deposit, color: z.color })),
      /** The floor map, for venues that let guests pick their table. */
      layout: s.mapPick ? items.filter((i) => i.kind !== 'chair').map((i) => ({ id: i.id, kind: i.kind, shape: i.shape, label: i.label, x: i.x, y: i.y, w: i.w, h: i.h, rotation: i.rotation, seats: i.seats, zoneId: i.zoneId })) : [],
    };
  });

  /* Time slots for one night and whether each still has room. */
  app.get<{ Params: { slug: string }; Querystring: { date?: string } }>('/public/venues/:slug/slots', async (req) => {
    const v = await venueBySlug(req.params.slug, 'reservations');
    const date = parse(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), req.query.date ?? nightOf(new Date(), v.timezone));
    const slots = await db.select().from(schema.timeSlots).where(and(
      eq(schema.timeSlots.venueId, v.id), eq(schema.timeSlots.active, true),
      or(isNull(schema.timeSlots.weekday), eq(schema.timeSlots.weekday, weekdayOf(date))),
    )).orderBy(asc(schema.timeSlots.startsAt));
    slots.sort(byNight);
    const taken = slots.length ? await db.select({ slotId: schema.reservations.slotId, n: sql<number>`sum(${schema.reservations.partySize})::int` })
      .from(schema.reservations).where(and(
        eq(schema.reservations.date, date), inArray(schema.reservations.slotId, slots.map((s) => s.id)),
        inArray(schema.reservations.status, ['in_review', 'accepted', 'confirmed', 'arrived']),
      )).groupBy(schema.reservations.slotId) : [];
    const takenTables = (await db.select({ t: schema.reservations.tableId }).from(schema.reservations).where(and(
      eq(schema.reservations.venueId, v.id), eq(schema.reservations.date, date), sql`${schema.reservations.tableId} is not null`,
      inArray(schema.reservations.status, ['in_review', 'accepted', 'confirmed', 'arrived']),
    ))).map((r) => r.t);
    const counts = slots.length ? await db.select({ slotId: schema.reservations.slotId, n: sql<number>`count(*)::int` })
      .from(schema.reservations).where(and(
        eq(schema.reservations.date, date), inArray(schema.reservations.slotId, slots.map((s) => s.id)),
        inArray(schema.reservations.status, ['in_review', 'accepted', 'confirmed', 'arrived']),
      )).groupBy(schema.reservations.slotId) : [];
    return {
      date,
      takenTables,
      slots: slots.map((s) => {
        const bookings = counts.find((t) => t.slotId === s.id)?.n ?? 0;
        if (s.maxBookings > 0 && bookings >= s.maxBookings) return { id: s.id, from: s.startsAt, to: s.endsAt, full: true, placesLeft: 0 };
        const used = taken.find((t) => t.slotId === s.id)?.n ?? 0;
        return { id: s.id, from: s.startsAt, to: s.endsAt, full: s.capacity > 0 && used >= s.capacity, placesLeft: s.capacity > 0 ? Math.max(0, s.capacity - used) : null };
      }),
    };
  });

  /* Guest sends a booking request. It goes to the venue "In review". */
  app.post<{ Params: { slug: string } }>('/public/venues/:slug/bookings', async (req, reply) => {
    const v = await venueBySlug(req.params.slug, 'reservations');
    let r = await createBooking(v, parse(bookingInput, req.body));
    if (v.settings.approval === 'auto') r = await acceptReservation(v, r, {});
    reply.code(201);
    return { code: r.code, status: r.status, statusUrl: statusUrl(r.code) };
  });

  /* Booking status page: xtra.eg/b/CODE */
  app.get<{ Params: { code: string } }>('/public/bookings/:code', async (req) => {
    const [row] = await db.select({ r: schema.reservations, v: schema.venues }).from(schema.reservations)
      .innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId)).where(eq(schema.reservations.code, req.params.code.toUpperCase()));
    if (!row) throw notFound('Booking not found');
    const { r, v } = row;
    const party = await db.select({ name: schema.reservationGuests.name, isBooker: schema.reservationGuests.isBooker, qrToken: schema.reservationGuests.qrToken, checkedInAt: schema.reservationGuests.checkedInAt })
      .from(schema.reservationGuests).where(eq(schema.reservationGuests.reservationId, r.id)).orderBy(desc(schema.reservationGuests.isBooker));
    const label = async (id: string | null) => id ? (await db.select({ l: schema.floorItems.label }).from(schema.floorItems).where(eq(schema.floorItems.id, id)))[0]?.l ?? null : null;
    const area = await label(r.zoneId);
    const table = await label(r.tableId);
    const showPasses = ['confirmed', 'arrived'].includes(r.status);
    return {
      code: r.code, status: r.status, date: r.date, time: r.slotLabel, partySize: r.partySize, area, table, minSpend: r.minSpend, qrToken: showPasses ? party.find((p) => p.isBooker)?.qrToken ?? null : null,
      deposit: { amount: r.depositAmount, paid: Boolean(r.depositPaidAt), due: r.status === 'accepted' && r.depositAmount > 0 },
      declineReason: r.status === 'declined' ? r.declineReason : null,
      venue: { name: v.name, slug: v.slug, logoUrl: v.logoUrl, address: v.address, mapUrl: v.mapUrl, lat: v.mapLat, lng: v.mapLng, photoUrl: v.photoUrl, phone: v.phone, instagram: v.instagram, where: v.settings.where ?? v.address ?? '', color: v.settings.color ?? null },
      notifyChannel: 'both',
      party: party.map((p) => ({ name: p.name, isBooker: p.isBooker, arrived: Boolean(p.checkedInAt), passUrl: showPasses ? `${config.publicAppUrl}/p/${p.qrToken}` : null })),
    };
  });

  /* Pay the deposit for an accepted booking. */
  app.post<{ Params: { code: string } }>('/public/bookings/:code/pay', async (req) => {
    const [r] = await db.select().from(schema.reservations).where(eq(schema.reservations.code, req.params.code.toUpperCase()));
    if (!r) throw notFound('Booking not found');
    if (r.status !== 'accepted' || r.depositAmount === 0) throw conflict('Nothing to pay for this booking', 'nothing_due');
    const [g] = await db.select().from(schema.guests).where(eq(schema.guests.id, r.guestId));
    return startPayment({
      venueId: r.venueId, purpose: 'deposit', refId: r.id, amount: r.depositAmount, description: 'Booking deposit',
      customer: { firstName: g.firstName, lastName: g.lastName, email: g.email, phone: g.phone }, redirectUrl: statusUrl(r.code),
    });
  });

  app.get<{ Params: { token: string } }>('/public/pass/:token', async (req) => {
    const { info, view } = await livePass(req.params.token);
    return { ...view, qrImage: `${config.publicAppUrl}/public/qr/${req.params.token}.png`, googleWalletUrl: googleWalletReady() ? googleWalletLink(info.qrToken) : null, appleWallet: applePass(info) };
  });

  /** The signed Apple Wallet pass. */
  app.get<{ Params: { token: string } }>('/public/pass/:token/apple.pkpass', async (req, reply) => {
    if (!appleWalletReady()) throw notFound('Apple Wallet is not set up yet');
    const p = await livePass(req.params.token);
    const buf = await applePkpass(p.info, await appleImages(p));
    return reply.type('application/vnd.apple.pkpass').header('Content-Disposition', `attachment; filename="${p.info.kind}.pkpass"`).header('Cache-Control', 'no-store').send(buf);
  });

  app.get<{ Params: { token: string } }>('/public/qr/:token.png', async (req, reply) => {
    const token = parse(z.string().regex(/^[A-Za-z0-9_-]{10,100}$/), req.params.token);
    reply.type('image/png').header('Cache-Control', 'public, max-age=86400').send(await qrPng(token));
  });

  /* ---------- guest account */
  app.get('/guest/me', async (req) => {
    const { sub } = await guestUser(req);
    const [g] = await db.select().from(schema.guests).where(eq(schema.guests.id, sub));
    if (!g) throw notFound();
    const memberships = await db.select({ vg: schema.venueGuests, v: schema.venues }).from(schema.venueGuests)
      .innerJoin(schema.venues, eq(schema.venues.id, schema.venueGuests.venueId)).where(eq(schema.venueGuests.guestId, g.id));
    const bookings = await db.select({ code: schema.reservations.code, status: schema.reservations.status, date: schema.reservations.date, time: schema.reservations.slotLabel, venue: schema.venues.name })
      .from(schema.reservations).innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId))
      .where(eq(schema.reservations.guestId, g.id)).orderBy(desc(schema.reservations.date)).limit(50);
    const orders = await db.select({ code: schema.ticketOrders.code, event: schema.events.title, startsAt: schema.events.startsAt, total: schema.ticketOrders.total })
      .from(schema.ticketOrders).innerJoin(schema.events, eq(schema.events.id, schema.ticketOrders.eventId))
      .where(and(eq(schema.ticketOrders.guestId, g.id), eq(schema.ticketOrders.status, 'paid'))).orderBy(desc(schema.events.startsAt)).limit(50);
    return {
      guest: { id: g.id, firstName: g.firstName, lastName: g.lastName, phone: g.phone, email: g.email, instagram: g.instagram, gender: g.gender, birthDate: g.birthDate, whatsappOptIn: g.whatsappOptIn, emailOptIn: g.emailOptIn, referralCode: g.referralCode },
      memberships: await Promise.all(memberships.map(async ({ vg, v }) => {
        const tier = await tierFor(db, v.id, vg.totalSpend);
        return { venue: v.name, slug: v.slug, points: vg.points, visits: vg.visits, tier: tier ? { name: tier.name, perks: tier.perks, color: tier.color } : null };
      })),
      bookings, orders,
    };
  });

  app.patch('/guest/me', async (req) => {
    const { sub } = await guestUser(req);
    const b = parse(z.object({
      firstName: z.string().min(1), lastName: z.string(), email: z.string().email().nullable(), instagram: z.string().nullable(),
      gender: z.enum(['male', 'female', 'other']).nullable(), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      whatsappOptIn: z.boolean(), emailOptIn: z.boolean(),
    }).partial(), req.body);
    const [g] = await db.update(schema.guests).set(b).where(eq(schema.guests.id, sub)).returning();
    return g;
  });
}

/** Guest-facing endpoints: venue booking page, booking status, passes, guest account. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { guestUser, parse } from '../lib/http.js';
import { conflict, notFound } from '../lib/errors.js';
import { nightOf, weekdayOf } from '../lib/dates.js';
import { qrPng } from '../integrations/qr.js';
import { googleWalletUrl, applePass } from '../integrations/wallet.js';
import { config } from '../config.js';
import { bookingInput, createBooking, statusUrl } from './reservations.js';
import { startPayment } from './payments.js';
import { tierFor } from './guests-service.js';

async function venueBySlug(slug: string) {
  const [v] = await db.select().from(schema.venues).where(and(eq(schema.venues.slug, slug), eq(schema.venues.active, true)));
  if (!v) throw notFound('Venue not found');
  return v;
}

export default async function publicRoutes(app: FastifyInstance) {
  /* The venue's white-label booking page. */
  app.get<{ Params: { slug: string } }>('/public/venues/:slug', async (req) => {
    const v = await venueBySlug(req.params.slug);
    const zones = await db.select({ id: schema.floorItems.id, name: schema.floorItems.label, minSpend: schema.floorItems.minSpend, color: schema.floorItems.color })
      .from(schema.floorItems).where(and(eq(schema.floorItems.venueId, v.id), eq(schema.floorItems.kind, 'zone'), eq(schema.floorItems.enabled, true)))
      .orderBy(asc(schema.floorItems.sort));
    return {
      venue: { name: v.name, slug: v.slug, logoUrl: v.logoUrl, address: v.address, mapUrl: v.mapUrl, instagram: v.instagram, tiktok: v.tiktok, phone: v.phone },
      depositPerPerson: v.depositPerPerson,
      areas: zones,
    };
  });

  /* Time slots for one night and whether each still has room. */
  app.get<{ Params: { slug: string }; Querystring: { date?: string } }>('/public/venues/:slug/slots', async (req) => {
    const v = await venueBySlug(req.params.slug);
    const date = parse(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), req.query.date ?? nightOf(new Date(), v.timezone));
    const slots = await db.select().from(schema.timeSlots).where(and(
      eq(schema.timeSlots.venueId, v.id), eq(schema.timeSlots.active, true),
      or(isNull(schema.timeSlots.weekday), eq(schema.timeSlots.weekday, weekdayOf(date))),
    )).orderBy(asc(schema.timeSlots.startsAt));
    const taken = slots.length ? await db.select({ slotId: schema.reservations.slotId, n: sql<number>`sum(${schema.reservations.partySize})::int` })
      .from(schema.reservations).where(and(
        eq(schema.reservations.date, date), inArray(schema.reservations.slotId, slots.map((s) => s.id)),
        inArray(schema.reservations.status, ['in_review', 'accepted', 'confirmed', 'arrived']),
      )).groupBy(schema.reservations.slotId) : [];
    return {
      date,
      slots: slots.map((s) => {
        const used = taken.find((t) => t.slotId === s.id)?.n ?? 0;
        return { id: s.id, from: s.startsAt, to: s.endsAt, full: s.capacity > 0 && used >= s.capacity, placesLeft: s.capacity > 0 ? Math.max(0, s.capacity - used) : null };
      }),
    };
  });

  /* Guest sends a booking request. It goes to the venue "In review". */
  app.post<{ Params: { slug: string } }>('/public/venues/:slug/bookings', async (req, reply) => {
    const v = await venueBySlug(req.params.slug);
    const r = await createBooking(v, parse(bookingInput, req.body));
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
    let area: string | null = null;
    if (r.zoneId) [{ area }] = await db.select({ area: schema.floorItems.label }).from(schema.floorItems).where(eq(schema.floorItems.id, r.zoneId));
    const showPasses = ['confirmed', 'arrived'].includes(r.status);
    return {
      code: r.code, status: r.status, date: r.date, time: r.slotLabel, partySize: r.partySize, area, minSpend: r.minSpend,
      deposit: { amount: r.depositAmount, paid: Boolean(r.depositPaidAt), due: r.status === 'accepted' && r.depositAmount > 0 },
      declineReason: r.status === 'declined' ? r.declineReason : null,
      venue: { name: v.name, logoUrl: v.logoUrl, address: v.address, mapUrl: v.mapUrl, phone: v.phone, instagram: v.instagram },
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

  /* A single pass (booking guest) or ticket, by its QR token. */
  app.get<{ Params: { token: string } }>('/public/pass/:token', async (req) => {
    const token = req.params.token;
    const [rg] = await db.select({ p: schema.reservationGuests, r: schema.reservations, v: schema.venues }).from(schema.reservationGuests)
      .innerJoin(schema.reservations, eq(schema.reservations.id, schema.reservationGuests.reservationId))
      .innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId)).where(eq(schema.reservationGuests.qrToken, token));
    if (rg && ['confirmed', 'arrived', 'completed'].includes(rg.r.status)) {
      const info = { id: rg.p.id, qrToken: token, title: rg.v.name, subtitle: `${rg.r.partySize} people`, holder: rg.p.name, startsAt: new Date(`${rg.r.date}T20:00:00+02:00`), venueName: rg.v.name };
      return {
        type: 'booking', name: rg.p.name, venue: rg.v.name, date: rg.r.date, time: rg.r.slotLabel, used: Boolean(rg.p.checkedInAt),
        qrImage: `${config.publicAppUrl}/public/qr/${token}.png`, googleWalletUrl: googleWalletUrl(info), appleWallet: applePass(info),
      };
    }
    const [t] = await db.select({ t: schema.tickets, o: schema.ticketOrders, e: schema.events, z: schema.eventZones, s: schema.eventSeats, v: schema.venues }).from(schema.tickets)
      .innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.tickets.orderId))
      .innerJoin(schema.events, eq(schema.events.id, schema.tickets.eventId))
      .innerJoin(schema.venues, eq(schema.venues.id, schema.events.venueId))
      .innerJoin(schema.eventZones, eq(schema.eventZones.id, schema.tickets.zoneId))
      .leftJoin(schema.eventSeats, eq(schema.eventSeats.id, schema.tickets.seatId))
      .where(eq(schema.tickets.qrToken, token));
    if (t && t.o.status === 'paid') {
      const holder = `${t.t.firstName} ${t.t.lastName}`.trim();
      const info = { id: t.t.id, qrToken: token, title: t.e.title, subtitle: t.s ? `${t.z.name} · ${t.s.label}` : t.z.name, holder, startsAt: t.e.startsAt, venueName: t.v.name };
      return {
        type: 'ticket', name: holder, event: t.e.title, posterUrl: t.e.posterUrl, venue: t.v.name, startsAt: t.e.startsAt,
        ticketType: t.z.name, seat: t.s?.label ?? null, used: Boolean(t.t.checkedInAt),
        qrImage: `${config.publicAppUrl}/public/qr/${token}.png`, googleWalletUrl: googleWalletUrl(info), appleWallet: applePass(info),
      };
    }
    throw notFound('Pass not found');
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

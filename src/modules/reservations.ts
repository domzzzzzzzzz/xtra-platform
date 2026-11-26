import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, venueAccess, MANAGERS, DOOR, FLOOR, egp } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { qrToken, shortCode } from '../lib/codes.js';
import { nightOf, prettyDate, weekdayOf } from '../lib/dates.js';
import { notifyGuest } from '../integrations/notify.js';
import * as M from './guest-messages.js';
import { config } from '../config.js';
import { upsertGuest, ensureVenueGuest, recordSpend } from './guests-service.js';

type Venue = typeof schema.venues.$inferSelect;
type Reservation = typeof schema.reservations.$inferSelect;

/** Statuses that hold a place in a slot. */
const LIVE = ['in_review', 'accepted', 'confirmed', 'arrived'] as const;

export const person = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().min(8).max(20).optional(),
  email: z.string().email().optional(),
  instagram: z.string().max(60).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});

export const bookingInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotId: z.string().uuid(),
  zoneId: z.string().uuid().optional(),
  /** Only when the venue lets guests pick a table on the map. */
  tableId: z.string().uuid().optional(),
  /** Party size when the venue does not ask for every guest's name. */
  partySize: z.number().int().min(1).max(50).optional(),
  booker: person.extend({ phone: z.string().min(8).max(20), whatsappOptIn: z.boolean().default(false), emailOptIn: z.boolean().default(false) }),
  /** Everyone else coming. Party size = 1 + guests. */
  guests: z.array(person).max(30).default([]),
  note: z.string().max(500).default(''),
});

/** Sends one catalogue message on the venue's channel(s). */
const tell = (venue: Venue, to: { phone?: string | null; email?: string | null; guestId?: string | null }, m: M.GuestMessage) =>
  notifyGuest({ channel: venue.notifyChannel, phone: to.phone, email: to.email, venueId: venue.id, guestId: to.guestId ?? undefined, ...m });

export const statusUrl = (code: string) => `${config.publicAppUrl}/b/${code}`;

const splitName = (n: string) => {
  const [first, ...rest] = n.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
};

export async function createBooking(venue: Venue, input: z.infer<typeof bookingInput>, source = 'online') {
  const [slot] = await db.select().from(schema.timeSlots).where(and(eq(schema.timeSlots.id, input.slotId), eq(schema.timeSlots.venueId, venue.id)));
  if (!slot || !slot.active) throw badRequest('That time is not available', 'slot_unavailable');
  if (slot.weekday !== null && slot.weekday !== weekdayOf(input.date)) throw badRequest('That time is not available on this day', 'slot_unavailable');
  if (input.date < nightOf(new Date(), venue.timezone)) throw badRequest('That night has passed', 'date_past');
  if (input.tableId && !input.zoneId) {
    const [t] = await db.select().from(schema.floorItems).where(and(eq(schema.floorItems.id, input.tableId), eq(schema.floorItems.venueId, venue.id)));
    if (t?.zoneId) input = { ...input, zoneId: t.zoneId };
  }

  let minSpend = 0;
  if (input.zoneId) {
    const [zone] = await db.select().from(schema.floorItems)
      .where(and(eq(schema.floorItems.id, input.zoneId), eq(schema.floorItems.venueId, venue.id), eq(schema.floorItems.kind, 'zone')));
    if (!zone || !zone.enabled) throw badRequest('That area is not available', 'zone_unavailable');
    minSpend = zone.minSpend;
  }
  const partySize = Math.max(1 + input.guests.length, input.partySize ?? 1);

  return db.transaction(async (tx) => {
    // Lock the slot row so two bookings cannot both take the last places.
    await tx.select({ id: schema.timeSlots.id }).from(schema.timeSlots).where(eq(schema.timeSlots.id, slot.id)).for('update');
    if (slot.maxBookings > 0) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.reservations)
        .where(and(eq(schema.reservations.slotId, slot.id), eq(schema.reservations.date, input.date), inArray(schema.reservations.status, [...LIVE])));
      if (n >= slot.maxBookings) throw conflict('This time is full. Please pick another.', 'slot_full');
    }
    if (input.tableId) {
      const [taken] = await tx.select({ id: schema.reservations.id }).from(schema.reservations).where(and(
        eq(schema.reservations.tableId, input.tableId), eq(schema.reservations.date, input.date), inArray(schema.reservations.status, [...LIVE])));
      if (taken) throw conflict('That table was just taken. Please pick another.', 'table_taken');
    }
    if (slot.capacity > 0) {
      const [{ n }] = await tx.select({ n: sql<number>`coalesce(sum(${schema.reservations.partySize}),0)::int` }).from(schema.reservations)
        .where(and(eq(schema.reservations.slotId, slot.id), eq(schema.reservations.date, input.date), inArray(schema.reservations.status, [...LIVE])));
      if (n + partySize > slot.capacity) throw conflict('This time is full. Please pick another.', 'slot_full');
    }
    const b = input.booker;
    const guest = await upsertGuest(tx, {
      phone: b.phone, ...splitName(b.name), email: b.email, instagram: b.instagram, gender: b.gender,
      whatsappOptIn: b.whatsappOptIn, emailOptIn: b.emailOptIn,
    });
    await ensureVenueGuest(tx, venue.id, guest.id);
    const [blocked] = await tx.select({ b: schema.venueGuests.blocked }).from(schema.venueGuests)
      .where(and(eq(schema.venueGuests.venueId, venue.id), eq(schema.venueGuests.guestId, guest.id)));
    if (blocked?.b) throw badRequest('We could not take this booking. Please contact the venue.', 'guest_blocked');

    const [res] = await tx.insert(schema.reservations).values({
      code: shortCode(), venueId: venue.id, guestId: guest.id, date: input.date, slotId: slot.id,
      slotLabel: `${slot.startsAt} to ${slot.endsAt}`, zoneId: input.zoneId ?? null, tableId: input.tableId ?? null, partySize, minSpend,
      guestNote: input.note, qrToken: qrToken(), source,
    }).returning();

    const people = [{ ...b, guestId: guest.id, isBooker: true, phone: guest.phone }, ...input.guests.map((g) => ({ ...g, guestId: null as string | null, isBooker: false }))];
    for (const p of people) {
      let guestId = p.guestId;
      // A +1 with a phone number becomes a guest profile of their own.
      if (!guestId && p.phone) {
        const g2 = await upsertGuest(tx, { phone: p.phone, ...splitName(p.name), email: p.email, instagram: p.instagram, gender: p.gender });
        await ensureVenueGuest(tx, venue.id, g2.id);
        guestId = g2.id;
      }
      await tx.insert(schema.reservationGuests).values({
        reservationId: res.id, guestId, isBooker: p.isBooker, name: p.name, phone: p.phone ?? null,
        email: p.email ?? null, instagram: p.instagram ?? null, gender: p.gender ?? null, qrToken: qrToken(),
      });
    }
    return { reservation: res, guest };
  }).then(async (r) => {
    await tell(venue, { phone: r.guest.phone, email: r.guest.email, guestId: r.guest.id }, M.bookingReceived(venue, r.guest, r.reservation));
    return r.reservation;
  });
}

export async function loadRes(venueId: string, id: string) {
  const [r] = await db.select().from(schema.reservations).where(and(eq(schema.reservations.id, id), eq(schema.reservations.venueId, venueId)));
  if (!r) throw notFound('Booking not found');
  return r;
}

async function bookerOf(r: Reservation) {
  const [g] = await db.select().from(schema.guests).where(eq(schema.guests.id, r.guestId));
  return g;
}

export async function venueOf(id: string) {
  const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, id));
  return v;
}

/** Sends every person in the party their own QR pass link. */
export async function sendPasses(r: Reservation, venue: Venue) {
  const party = await db.select().from(schema.reservationGuests).where(eq(schema.reservationGuests.reservationId, r.id));
  for (const p of party) {
    if (!p.phone && !p.email) continue;
    await tell(venue, p, M.bookingPass(venue, p, r));
  }
}

/** Deposit due for a booking: the area's deposit, or the venue's per-person deposit. */
export async function depositFor(venue: Venue, r: Reservation) {
  if (r.zoneId) {
    const [zone] = await db.select({ deposit: schema.floorItems.deposit }).from(schema.floorItems).where(eq(schema.floorItems.id, r.zoneId));
    if (zone) return zone.deposit;
  }
  return venue.depositPerPerson * r.partySize;
}

export async function acceptReservation(venue: Venue, r: Reservation, o: { tableId?: string | null; depositAmount?: number; decidedBy?: string | null }) {
  if (r.status !== 'in_review') throw conflict('This booking was already handled', 'already_decided');
  if (o.tableId) await checkTable(venue.id, o.tableId, r);
  const deposit = o.depositAmount ?? (await depositFor(venue, r));
  const [u] = await db.update(schema.reservations).set({
    status: deposit > 0 ? 'accepted' : 'confirmed', depositAmount: deposit, tableId: o.tableId ?? r.tableId,
    decidedBy: o.decidedBy ?? null, decidedAt: new Date(),
  }).where(and(eq(schema.reservations.id, r.id), eq(schema.reservations.status, 'in_review'))).returning();
  if (!u) throw conflict('This booking was already handled', 'already_decided');
  await sendAccepted(venue, u);
  if (deposit === 0) await sendPasses(u, venue);
  return u;
}

export async function sendAccepted(venue: Venue, u: Reservation) {
  const g = await bookerOf(u);
  await tell(venue, { ...g, guestId: g.id }, M.bookingAccepted(venue, g, u));
}

export async function onDepositPaid(reservationId: string) {
  const [r] = await db.update(schema.reservations).set({ status: 'confirmed', depositPaidAt: new Date() })
    .where(and(eq(schema.reservations.id, reservationId), eq(schema.reservations.status, 'accepted'))).returning();
  if (!r) return;
  const venue = await venueOf(r.venueId), g = await bookerOf(r);
  await tell(venue, { ...g, guestId: g.id }, M.depositPaid(venue, g, r));
  await sendPasses(r, venue);
}

export default async function reservations(app: FastifyInstance) {
  type P = { venueId: string };
  type PR = P & { id: string };

  app.get<{ Params: P; Querystring: { date?: string; to?: string; status?: string } }>('/venues/:venueId/reservations', async (req) => {
    await venueAccess(req, req.params.venueId, FLOOR);
    const venue = await venueOf(req.params.venueId);
    const date = req.query.date ?? nightOf(new Date(), venue.timezone);
    const conds = [eq(schema.reservations.venueId, venue.id),
      req.query.to ? and(gte(schema.reservations.date, date), lte(schema.reservations.date, req.query.to))! : eq(schema.reservations.date, date)];
    if (req.query.status) conds.push(eq(schema.reservations.status, req.query.status as Reservation['status']));
    const rows = await db.select({ r: schema.reservations, g: schema.guests }).from(schema.reservations)
      .innerJoin(schema.guests, eq(schema.guests.id, schema.reservations.guestId))
      .where(and(...conds)).orderBy(asc(schema.reservations.slotLabel), asc(schema.reservations.createdAt));
    const ids = rows.map((x) => x.r.id);
    const party = ids.length ? await db.select().from(schema.reservationGuests).where(inArray(schema.reservationGuests.reservationId, ids)) : [];
    return rows.map(({ r, g }) => ({
      ...r,
      guest: { id: g.id, firstName: g.firstName, lastName: g.lastName, phone: g.phone, email: g.email, instagram: g.instagram, gender: g.gender },
      party: party.filter((p) => p.reservationId === r.id).map(({ qrToken: _q, ...p }) => p),
    }));
  });

  /*
   * Phone / WhatsApp / Instagram booking added by staff. It is accepted at
   * once: deposit "link" sends a payment link, "paid" means paid already,
   * "none" confirms without a deposit.
   */
  app.post<{ Params: P }>('/venues/:venueId/reservations', async (req, reply) => {
    const { user } = await venueAccess(req, req.params.venueId, MANAGERS);
    const venue = await venueOf(req.params.venueId);
    const input = parse(bookingInput.extend({
      depositMode: z.enum(['link', 'paid', 'none']).default('link'),
      source: z.string().max(40).default('Phone call'),
    }), req.body);
    const r = await createBooking(venue, input, input.source);
    const deposit = input.depositMode === 'none' ? 0 : await depositFor(venue, r);
    const paid = input.depositMode === 'paid' && deposit > 0;
    const [u] = await db.update(schema.reservations).set({
      status: deposit > 0 && !paid ? 'accepted' : 'confirmed', depositAmount: deposit, depositPaidAt: paid ? new Date() : null,
      decidedBy: user.sub, decidedAt: new Date(),
    }).where(eq(schema.reservations.id, r.id)).returning();
    await sendAccepted(venue, u);
    if (u.status === 'confirmed') await sendPasses(u, venue);
    reply.code(201);
    return u;
  });

  /* Deposit paid in cash / InstaPay at the venue. */
  app.post<{ Params: PR }>('/venues/:venueId/reservations/:id/deposit-paid', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const r = await loadRes(req.params.venueId, req.params.id);
    if (r.status !== 'accepted') throw conflict('No deposit is due on this booking', 'nothing_due');
    await onDepositPaid(r.id);
    return loadRes(req.params.venueId, r.id);
  });

  app.post<{ Params: PR }>('/venues/:venueId/reservations/:id/resend', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const venue = await venueOf(req.params.venueId);
    const r = await loadRes(venue.id, req.params.id);
    if (r.status === 'accepted') await sendAccepted(venue, r);
    else if (['confirmed', 'arrived'].includes(r.status)) await sendPasses(r, venue);
    else throw conflict('Nothing to resend for this booking');
    return { ok: true };
  });

  /* Seat a booking: marks it arrived (if not scanned yet) and opens its bill. */
  app.post<{ Params: PR }>('/venues/:venueId/reservations/:id/seat', async (req) => {
    const { user } = await venueAccess(req, req.params.venueId, FLOOR);
    const b = parse(z.object({ tableId: z.string().uuid().optional() }), req.body ?? {});
    let r = await loadRes(req.params.venueId, req.params.id);
    if (!['confirmed', 'arrived', 'accepted'].includes(r.status)) throw conflict('This booking cannot be seated', 'not_confirmed');
    const tableId = b.tableId ?? r.tableId;
    if (!tableId) throw badRequest('Pick a table first', 'no_table');
    if (tableId !== r.tableId) await checkTable(req.params.venueId, tableId, r);
    if (r.status !== 'arrived') {
      [r] = await db.update(schema.reservations).set({ status: 'arrived', arrivedAt: new Date(), tableId }).where(eq(schema.reservations.id, r.id)).returning();
      await db.update(schema.reservationGuests).set({ checkedInAt: new Date() })
        .where(and(eq(schema.reservationGuests.reservationId, r.id), sql`${schema.reservationGuests.checkedInAt} is null`));
      await recordSpend(db, req.params.venueId, r.guestId, 0, r.id, 'visit', true);
    } else if (tableId !== r.tableId) {
      [r] = await db.update(schema.reservations).set({ tableId }).where(eq(schema.reservations.id, r.id)).returning();
    }
    const [open] = await db.select().from(schema.tabs).where(and(eq(schema.tabs.reservationId, r.id), eq(schema.tabs.status, 'open')));
    const tab = open ?? (await db.insert(schema.tabs).values({
      venueId: r.venueId, reservationId: r.id, tableId, guestId: r.guestId, partySize: r.partySize, openedBy: user.sub,
    }).returning())[0];
    return { reservation: r, tab };
  });

  /* Check in from the door list without scanning: the whole party, or one ticket. */
  app.post<{ Params: P }>('/venues/:venueId/checkin/manual', async (req) => {
    await venueAccess(req, req.params.venueId, DOOR);
    const b = parse(z.object({ reservationId: z.string().uuid().optional(), ticketId: z.string().uuid().optional() }), req.body);
    if (b.ticketId) {
      const [t] = await db.select({ qr: schema.tickets.qrToken }).from(schema.tickets).where(eq(schema.tickets.id, b.ticketId));
      if (!t) throw notFound('Ticket not found');
      return checkIn(req.params.venueId, t.qr);
    }
    if (!b.reservationId) throw badRequest('Pick a booking or a ticket');
    const r = await loadRes(req.params.venueId, b.reservationId);
    const party = await db.select().from(schema.reservationGuests).where(eq(schema.reservationGuests.reservationId, r.id));
    let last: CheckInResult = { ok: false, reason: 'unknown' };
    for (const p of party) if (!p.checkedInAt) last = await checkIn(req.params.venueId, p.qrToken);
    const booker = party.find((p) => p.isBooker);
    return last.ok && booker ? { ...last, name: booker.name } : last;
  });

  app.post<{ Params: PR }>('/venues/:venueId/reservations/:id/accept', async (req) => {
    const { user } = await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ tableId: z.string().uuid().optional(), depositAmount: z.number().int().min(0).optional() }), req.body ?? {});
    const venue = await venueOf(req.params.venueId);
    const r = await loadRes(venue.id, req.params.id);
    return acceptReservation(venue, r, { tableId: b.tableId, depositAmount: b.depositAmount, decidedBy: user.sub });
  });

  app.post<{ Params: PR }>('/venues/:venueId/reservations/:id/decline', async (req) => {
    const { user } = await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
    const venue = await venueOf(req.params.venueId);
    const [u] = await db.update(schema.reservations).set({ status: 'declined', declineReason: b.reason ?? null, decidedBy: user.sub, decidedAt: new Date() })
      .where(and(eq(schema.reservations.id, req.params.id), eq(schema.reservations.venueId, venue.id), eq(schema.reservations.status, 'in_review'))).returning();
    if (!u) throw conflict('This booking was already handled', 'already_decided');
    const g = await bookerOf(u);
    await tell(venue, { ...g, guestId: g.id }, M.bookingDeclined(venue, g, u, b.reason));
    return u;
  });

  app.post<{ Params: PR }>('/venues/:venueId/reservations/:id/table', async (req) => {
    await venueAccess(req, req.params.venueId, FLOOR);
    const b = parse(z.object({ tableId: z.string().uuid().nullable() }), req.body);
    const r = await loadRes(req.params.venueId, req.params.id);
    if (b.tableId) await checkTable(req.params.venueId, b.tableId, r);
    const [u] = await db.update(schema.reservations).set({ tableId: b.tableId }).where(eq(schema.reservations.id, r.id)).returning();
    return u;
  });

  for (const [path, status] of [['cancel', 'cancelled'], ['no-show', 'no_show'], ['complete', 'completed']] as const) {
    app.post<{ Params: PR }>(`/venues/:venueId/reservations/:id/${path}`, async (req) => {
      await venueAccess(req, req.params.venueId, path === 'cancel' ? MANAGERS : DOOR);
      const r = await loadRes(req.params.venueId, req.params.id);
      if (['declined', 'cancelled', 'completed', 'no_show'].includes(r.status)) throw conflict('This booking is already closed');
      const [u] = await db.update(schema.reservations).set({ status }).where(eq(schema.reservations.id, r.id)).returning();
      if (status === 'cancelled') {
        const venue = await venueOf(r.venueId), g = await bookerOf(u);
        await tell(venue, { ...g, guestId: g.id }, M.bookingCancelled(venue, g, u));
      }
      return u;
    });
  }

  /* Tonight's floor: every table with its booking and open tab, for the live map. */
  app.get<{ Params: P; Querystring: { date?: string } }>('/venues/:venueId/tonight', async (req) => {
    await venueAccess(req, req.params.venueId, FLOOR);
    const venue = await venueOf(req.params.venueId);
    const date = req.query.date ?? nightOf(new Date(), venue.timezone);
    const items = await db.select().from(schema.floorItems).where(eq(schema.floorItems.venueId, venue.id));
    const res = await db.select().from(schema.reservations)
      .where(and(eq(schema.reservations.venueId, venue.id), eq(schema.reservations.date, date), inArray(schema.reservations.status, [...LIVE])));
    const open = await db.select().from(schema.tabs).where(and(eq(schema.tabs.venueId, venue.id), eq(schema.tabs.status, 'open')));
    const tables = items.filter((i) => i.kind === 'table' || i.kind === 'sofa').map((t) => {
      const booking = res.find((r) => r.tableId === t.id) ?? null;
      const tab = open.find((x) => x.tableId === t.id) ?? null;
      // free | booked | waiting (accepted, not paid) | arrived | seated (tab open)
      const state = tab ? 'seated' : !booking ? 'free' : booking.status === 'arrived' ? 'arrived'
        : booking.status === 'confirmed' ? 'booked' : 'waiting';
      return { table: t, state, booking, tabId: tab?.id ?? null };
    });
    const counts = {
      inReview: res.filter((r) => r.status === 'in_review').length,
      expected: res.filter((r) => r.status === 'confirmed').reduce((s, r) => s + r.partySize, 0),
      arrived: res.filter((r) => r.status === 'arrived').reduce((s, r) => s + r.partySize, 0),
    };
    return { date, tables, counts };
  });

  /* ---------- door check-in: one scan works for booking passes and tickets */
  app.post<{ Params: P }>('/venues/:venueId/checkin', async (req) => {
    await venueAccess(req, req.params.venueId, DOOR);
    const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
    return checkIn(req.params.venueId, token);
  });
}

async function checkTable(venueId: string, tableId: string, r: Reservation) {
  const [t] = await db.select().from(schema.floorItems)
    .where(and(eq(schema.floorItems.id, tableId), eq(schema.floorItems.venueId, venueId), inArray(schema.floorItems.kind, ['table', 'sofa'])));
  if (!t || !t.enabled) throw badRequest('That table is not available', 'table_unavailable');
  const [clash] = await db.select({ id: schema.reservations.id }).from(schema.reservations).where(and(
    eq(schema.reservations.tableId, tableId), eq(schema.reservations.date, r.date), ne(schema.reservations.id, r.id),
    eq(schema.reservations.slotLabel, r.slotLabel), inArray(schema.reservations.status, [...LIVE]),
  ));
  if (clash) throw conflict('That table is already booked for this time', 'table_taken');
}

export type CheckInResult =
  | { ok: true; type: 'booking'; name: string; party: number; arrivedCount: number; table: string | null; minSpend: number; note: string }
  | { ok: true; type: 'ticket'; name: string; ticketType: string; event: string }
  | { ok: false; reason: 'unknown' | 'already_in' | 'not_confirmed' | 'wrong_night' | 'wrong_venue'; name?: string; at?: Date | null };

export async function checkIn(venueId: string, token: string): Promise<CheckInResult> {
  const venue = await venueOf(venueId);
  const tonight = nightOf(new Date(), venue.timezone);

  const [rg] = await db.select({ p: schema.reservationGuests, r: schema.reservations }).from(schema.reservationGuests)
    .innerJoin(schema.reservations, eq(schema.reservations.id, schema.reservationGuests.reservationId))
    .where(eq(schema.reservationGuests.qrToken, token));
  if (rg) {
    const { p, r } = rg;
    if (r.venueId !== venueId) return { ok: false, reason: 'wrong_venue', name: p.name };
    if (r.date !== tonight) return { ok: false, reason: 'wrong_night', name: p.name };
    if (!['confirmed', 'arrived'].includes(r.status)) return { ok: false, reason: 'not_confirmed', name: p.name };
    const [mark] = await db.update(schema.reservationGuests).set({ checkedInAt: new Date() })
      .where(and(eq(schema.reservationGuests.id, p.id), sql`${schema.reservationGuests.checkedInAt} is null`)).returning();
    if (!mark) return { ok: false, reason: 'already_in', name: p.name, at: p.checkedInAt };
    if (r.status === 'confirmed') {
      await db.update(schema.reservations).set({ status: 'arrived', arrivedAt: new Date() }).where(eq(schema.reservations.id, r.id));
      await recordSpend(db, venueId, r.guestId, 0, r.id, 'visit', true);
    }
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.reservationGuests)
      .where(and(eq(schema.reservationGuests.reservationId, r.id), sql`${schema.reservationGuests.checkedInAt} is not null`));
    let table: string | null = null;
    if (r.tableId) table = (await db.select({ label: schema.floorItems.label }).from(schema.floorItems).where(eq(schema.floorItems.id, r.tableId)))[0]?.label ?? null;
    return { ok: true, type: 'booking', name: p.name, party: r.partySize, arrivedCount: n, table, minSpend: r.minSpend, note: r.guestNote };
  }

  const [t] = await db.select({ t: schema.tickets, o: schema.ticketOrders, e: schema.events, z: schema.eventZones }).from(schema.tickets)
    .innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.tickets.orderId))
    .innerJoin(schema.events, eq(schema.events.id, schema.tickets.eventId))
    .innerJoin(schema.eventZones, eq(schema.eventZones.id, schema.tickets.zoneId))
    .where(eq(schema.tickets.qrToken, token));
  if (t) {
    const name = `${t.t.firstName} ${t.t.lastName}`.trim();
    if (t.e.venueId !== venueId) return { ok: false, reason: 'wrong_venue', name };
    if (t.o.status !== 'paid') return { ok: false, reason: 'not_confirmed', name };
    if (nightOf(t.e.startsAt, venue.timezone) !== tonight) return { ok: false, reason: 'wrong_night', name };
    const [mark] = await db.update(schema.tickets).set({ checkedInAt: new Date() })
      .where(and(eq(schema.tickets.id, t.t.id), sql`${schema.tickets.checkedInAt} is null`)).returning();
    if (!mark) return { ok: false, reason: 'already_in', name, at: t.t.checkedInAt };
    return { ok: true, type: 'ticket', name, ticketType: t.z.name, event: t.e.title };
  }
  return { ok: false, reason: 'unknown' };
}

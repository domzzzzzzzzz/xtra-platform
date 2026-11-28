import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { nightOf } from '../lib/dates.js';
import { notifyGuest } from '../integrations/notify.js';
import * as M from './guest-messages.js';
import { passTokens, walletChanged } from './passes.js';

/**
 * Fewer no-shows. All of it is off until a venue switches it on in Venue setup:
 * - a reminder on the day, some hours before the booking,
 * - the morning after, confirmed bookings nobody checked in for become no-shows,
 * - a guest with too many no-shows is blocked from booking online.
 * Guests can also cancel a booking themselves from their booking page.
 */

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** The moment a booking starts. Times before 6 AM belong to the morning after the night's date. */
export function bookingStart(date: string, slotLabel: string, tz = 'Africa/Cairo') {
  const m = /^(\d{1,2}):(\d{2})/.exec(slotLabel);
  const [h, mi] = m ? [+m[1] % 24, +m[2]] : [21, 0];
  const day = h < 6 ? addDays(date, 1) : date;
  const [y, mo, d] = day.split('-').map(Number);
  // Wall time in the venue's zone → UTC, correct across daylight saving.
  let t = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    const seen = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    t += Date.UTC(y, mo - 1, d, h, mi) - seen;
  }
  return new Date(t);
}

/** Every few minutes: send reminders that are due. Each booking gets one. */
export async function runReminders(now = new Date()) {
  const venues = (await db.select().from(schema.venues).where(eq(schema.venues.active, true))).filter((v) => v.settings.reminder?.on);
  let sent = 0;
  for (const v of venues) {
    const hours = v.settings.reminder!.hours ?? 3;
    const tonight = nightOf(now, v.timezone);
    const rows = await db.select().from(schema.reservations)
      .where(and(eq(schema.reservations.venueId, v.id), eq(schema.reservations.status, 'confirmed'), eq(schema.reservations.date, tonight)));
    for (const r of rows) {
      const start = bookingStart(r.date, r.slotLabel, v.timezone);
      if (now < new Date(+start - hours * 3600_000) || now > start) continue;
      const kind = `booking_reminder:${r.code}`;
      const [done] = await db.select({ id: schema.messages.id }).from(schema.messages).where(eq(schema.messages.kind, kind)).limit(1);
      if (done) continue;
      const [g] = await db.select().from(schema.guests).where(eq(schema.guests.id, r.guestId));
      const [booker] = await db.select().from(schema.reservationGuests)
        .where(and(eq(schema.reservationGuests.reservationId, r.id), eq(schema.reservationGuests.isBooker, true)));
      if (!g || !booker) continue;
      await notifyGuest({ channel: 'both', phone: g.phone, email: g.email, venueId: v.id, guestId: g.id, ...M.bookingReminder(v, g, r, booker.qrToken) });
      sent++;
    }
  }
  return sent;
}

/** After 6 AM: last night's confirmed bookings with nobody checked in become no-shows; block repeat no-shows. */
export async function runNoShows(now = new Date()) {
  const venues = (await db.select().from(schema.venues).where(eq(schema.venues.active, true))).filter((v) => v.settings.noShows?.auto);
  let marked = 0;
  for (const v of venues) {
    const last = addDays(nightOf(now, v.timezone), -1);
    const rows = await db.select({ id: schema.reservations.id, guestId: schema.reservations.guestId }).from(schema.reservations)
      .where(and(eq(schema.reservations.venueId, v.id), eq(schema.reservations.status, 'confirmed'), eq(schema.reservations.date, last),
        sql`not exists (select 1 from reservation_guests rg where rg.reservation_id = ${schema.reservations.id} and rg.checked_in_at is not null)`));
    if (!rows.length) continue;
    await db.update(schema.reservations).set({ status: 'no_show' }).where(inArray(schema.reservations.id, rows.map((r) => r.id)));
    for (const r of rows) walletChanged(passTokens.reservation(r.id));
    marked += rows.length;
    const limit = v.settings.noShows!.blockAfter ?? 0;
    if (limit > 0) await blockRepeatNoShows(v.id, [...new Set(rows.map((r) => r.guestId))], limit);
  }
  return marked;
}

export async function blockRepeatNoShows(venueId: string, guestIds: string[], limit: number) {
  if (!guestIds.length) return [];
  const counts = await db.select({ g: schema.reservations.guestId, n: sql<number>`count(*)::int` }).from(schema.reservations)
    .where(and(eq(schema.reservations.venueId, venueId), eq(schema.reservations.status, 'no_show'), inArray(schema.reservations.guestId, guestIds)))
    .groupBy(schema.reservations.guestId);
  const block = counts.filter((c) => c.n >= limit).map((c) => c.g);
  if (block.length) {
    await db.update(schema.venueGuests).set({ blocked: true })
      .where(and(eq(schema.venueGuests.venueId, venueId), inArray(schema.venueGuests.guestId, block)));
  }
  return block;
}

export default async function reminders(app: FastifyInstance) {
  /* The guest cancels from their booking page. With a paid deposit they ask the venue, so the venue decides the refund. */
  app.post<{ Params: { code: string } }>('/public/bookings/:code/cancel', async (req) => {
    const [r] = await db.select().from(schema.reservations).where(eq(schema.reservations.code, req.params.code.toUpperCase()));
    if (!r) throw notFound('Booking not found');
    if (!['in_review', 'accepted', 'confirmed'].includes(r.status)) throw conflict('This booking can no longer be cancelled', 'closed');
    const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, r.venueId));
    if (r.date < nightOf(new Date(), v.timezone)) throw conflict('This booking has passed', 'closed');
    if (r.depositPaidAt && !r.depositRefundedAt && r.depositAmount > 0) {
      throw conflict(`You paid a deposit, so please contact ${v.name} to cancel${v.phone ? ` on ${v.phone}` : ''}.`, 'deposit_paid');
    }
    const [inside] = await db.select({ id: schema.reservationGuests.id }).from(schema.reservationGuests)
      .where(and(eq(schema.reservationGuests.reservationId, r.id), sql`${schema.reservationGuests.checkedInAt} is not null`)).limit(1);
    if (inside) throw conflict('You are already checked in', 'closed');
    const [u] = await db.update(schema.reservations).set({ status: 'cancelled', declineReason: 'Cancelled by the guest' })
      .where(and(eq(schema.reservations.id, r.id), inArray(schema.reservations.status, ['in_review', 'accepted', 'confirmed']))).returning();
    if (!u) throw conflict('This booking can no longer be cancelled', 'closed');
    walletChanged(passTokens.reservation(r.id));
    const [g] = await db.select().from(schema.guests).where(eq(schema.guests.id, r.guestId));
    if (g) await notifyGuest({ channel: 'both', phone: g.phone, email: g.email, venueId: v.id, guestId: g.id, ...M.bookingCancelled(v, g, u) });
    return { code: u.code, status: u.status };
  });
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, like } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/index.js';
import { nightOf } from '../src/lib/dates.js';
import { bookingStart, runNoShows, runReminders } from '../src/modules/reminders.js';
import { freshApp, client, tomorrow } from './helpers.js';

let app: FastifyInstance;
let api: ReturnType<typeof client>;
let venueId = '', slotId = '';
const v = () => `/api/venues/${venueId}`;
const book = async (phone: string, date = tomorrow()) => {
  const r = await api.post('/api/public/venues/no-show-bar/bookings', { date, slotId, partySize: 2, booker: { name: 'Sami Adel', phone, email: 'sami@example.com' } });
  return r.body.code as string;
};
const res = async (code: string) => (await db.select().from(schema.reservations).where(eq(schema.reservations.code, code)))[0];

beforeAll(async () => {
  app = await freshApp();
  api = client(app);
  await api.login('admin@xtra.eg', 'admin1234');
  venueId = (await api.post('/api/admin/venues', { name: 'No Show Bar', owner: { name: 'Owner', email: 'o@n.eg', password: 'password1' } })).body.venue.id;
  await api.login('o@n.eg', 'password1');
  slotId = (await api.put(`${v()}/slots`, { slots: [{ startsAt: '22:00', endsAt: '01:00' }] })).body[0].id;
  await api.patch(v(), { settings: { approval: 'auto' } });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('reminders, no-shows and blocking', () => {
  it('works out the booking time in Cairo, after midnight too', () => {
    expect(bookingStart('2026-12-05', '22:00 to 01:00').toISOString()).toBe('2026-12-05T20:00:00.000Z');
    expect(bookingStart('2026-12-05', '01:30 to 03:00').toISOString()).toBe('2026-12-05T23:30:00.000Z');
    expect(bookingStart('2026-07-05', '22:00 to 01:00').toISOString()).toBe('2026-07-05T19:00:00.000Z'); // summer time
  });

  it('sends one reminder on the day, only when switched on', async () => {
    const code = await book('01011112222');
    const r = await res(code);
    expect(r.status).toBe('confirmed');
    const at = new Date(+(await import('../src/modules/reminders.js')).bookingStart(r.date, r.slotLabel) - 2 * 3600_000);
    const nightAt = (d: Date) => nightOf(d);
    expect(nightAt(at)).toBe(r.date);
    expect(await runReminders(at)).toBe(0);
    await api.patch(v(), { settings: { reminder: { on: true, hours: 3 } } });
    expect(await runReminders(new Date(+at - 2 * 3600_000))).toBe(0); // too early
    expect(await runReminders(at)).toBe(1);
    expect(await runReminders(at)).toBe(0);
    const sent = await db.select().from(schema.messages).where(like(schema.messages.kind, `booking_reminder:${code}`));
    expect(sent.map((m) => m.channel).sort()).toEqual(['email', 'whatsapp']);
  });

  it('the guest can cancel from their booking page', async () => {
    const code = await book('01033334444');
    const c = await api.post(`/api/public/bookings/${code}/cancel`);
    expect(c.body.status).toBe('cancelled');
    expect((await api.post(`/api/public/bookings/${code}/cancel`)).status).toBe(409);
  });

  it('marks last night\'s no-shows in the morning and blocks repeat no-shows', async () => {
    await api.patch(v(), { settings: { noShows: { auto: true, blockAfter: 2 } } });
    const phone = '01055556666';
    const a = await book(phone), b = await book(phone);
    const night = (await res(a)).date;
    const morning = new Date(Date.parse(`${night}T12:00:00Z`) + 864e5 - 3 * 3600_000 + 7 * 3600_000); // 7 AM-ish Cairo the day after
    expect(await runNoShows(morning)).toBeGreaterThanOrEqual(2);
    expect((await res(a)).status).toBe('no_show');
    expect((await res(b)).status).toBe('no_show');
    const [g] = await db.select().from(schema.guests).where(eq(schema.guests.phone, '+201055556666'));
    const [vg] = await db.select().from(schema.venueGuests).where(and(eq(schema.venueGuests.guestId, g.id), eq(schema.venueGuests.venueId, venueId)));
    expect(vg.blocked).toBe(true);
    const again = await api.post('/api/public/venues/no-show-bar/bookings', { date: tomorrow(), slotId, booker: { name: 'Sami', phone } });
    expect(again.body.error).toBe('guest_blocked');
  });
});

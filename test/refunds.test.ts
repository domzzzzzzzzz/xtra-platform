import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, pool, schema } from '../src/db/index.js';
import { runDailyReports } from '../src/modules/daily-report.js';
import { freshApp, client, tomorrow } from './helpers.js';

let app: FastifyInstance;
let api: ReturnType<typeof client>;
let venueId: string;
let eventId: string;
let floorZone: string;
const v = () => `/api/venues/${venueId}`;

async function buy(qty: number, phone: string, email: string) {
  const h = await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: floorZone, qty }] });
  expect(h.status).toBe(201);
  const out = await api.post(`/api/public/orders/${h.body.code}/checkout`, { buyer: { firstName: 'Nour', lastName: 'Fahmy', email, phone } });
  const payId = out.body.checkoutUrl.split('/').pop();
  await app.inject({ method: 'POST', url: `/dev/pay/${payId}`, payload: { result: 'paid' } });
  return h.body.code as string;
}

beforeAll(async () => {
  app = await freshApp();
  api = client(app);
  await api.login('admin@xtra.eg', 'admin1234');
  const r = await api.post('/api/admin/venues', { name: 'Lumen Rooftop', owner: { name: 'Owner', email: 'owner@lumen.eg', password: 'password1' } });
  venueId = r.body.venue.id;
  await api.login('owner@lumen.eg', 'password1');
  const e = await api.post(`${v()}/events`, { title: 'Refund Night', startsAt: new Date(Date.now() + 3 * 86400_000).toISOString() });
  eventId = e.body.id;
  const map = await api.put(`${v()}/events/${eventId}/map`, { zones: [{ name: 'Floor', kind: 'standing', price: 50000, capacity: 3, x: 0, y: 0, w: 10, h: 4 }] });
  floorZone = map.body.zones[0].id;
  await api.patch(`${v()}/events/${eventId}`, { status: 'published' });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('Waitlist and ticket refunds', () => {
  it('guests join the waitlist only when sold out; a refund frees places and tells them', async () => {
    expect((await api.post(`/api/public/events/${eventId}/waitlist`, { name: 'Early Guest', phone: '01011112222' })).status).toBe(409);
    const code = await buy(3, '01066666666', 'nour@example.com');
    const pub = await api.get(`/api/public/events/${eventId}`);
    expect(pub.body.zones[0].soldOut).toBe(true);

    const j1 = await api.post(`/api/public/events/${eventId}/waitlist`, { name: 'Sara Ali', phone: '+971 50 111 2222', email: 'sara@example.com', qty: 2, zoneId: floorZone });
    expect(j1.status).toBe(201);
    expect(j1.body.position).toBe(1);
    const j2 = await api.post(`/api/public/events/${eventId}/waitlist`, { name: 'Omar Hany', phone: '01077778888', email: 'omar@example.com' });
    expect(j2.body.position).toBe(2);
    // Joining again just updates the same entry.
    expect((await api.post(`/api/public/events/${eventId}/waitlist`, { name: 'Omar Hany', phone: '01077778888', email: 'omar@example.com', qty: 3 })).status).toBe(200);
    expect((await api.get(`${v()}/events/${eventId}/waitlist`)).body.map((w: any) => [w.name, w.qty, w.status])).toEqual([['Sara Ali', 2, 'waiting'], ['Omar Hany', 3, 'waiting']]);

    // The order shows in the event's orders, then is refunded without the booking fee.
    const orders = await api.get(`${v()}/events/${eventId}/orders`);
    const o = orders.body.find((x: any) => x.code === code);
    expect(o).toMatchObject({ status: 'paid', tickets: 3, ticketPrice: 150000 });
    const ref = await api.post(`${v()}/events/${eventId}/orders/${o.id}/refund`, { fees: false, reason: 'Guest cannot come' });
    expect(ref.body).toMatchObject({ refunded: 150000, method: 'paymob' });
    expect((await api.post(`${v()}/events/${eventId}/orders/${o.id}/refund`, {})).status).toBe(409);
    const [order] = await db.select().from(schema.ticketOrders).where(eq(schema.ticketOrders.id, o.id));
    expect(order).toMatchObject({ status: 'refunded', refundedAmount: 150000 });
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.refId, o.id));
    expect(pay.status).toBe('refunded');
    const mail = await db.select().from(schema.messages).where(eq(schema.messages.kind, 'refund'));
    expect(mail.length).toBe(1);
    expect(mail[0].channel).toBe('email');
    expect(mail[0].subject).toContain('Refund of EGP 1,500');

    // 3 places free: Sara (2) is told; Omar wants 3 and only 1 is left in the count, so he waits.
    const list = (await api.get(`${v()}/events/${eventId}/waitlist`)).body;
    expect(list.map((w: any) => w.status)).toEqual(['notified', 'waiting']);
    const told = await db.select().from(schema.messages).where(eq(schema.messages.kind, 'waitlist_open'));
    expect(told.map((m) => m.to)).toEqual(['sara@example.com']);
    // Staff can tell Omar by hand, then Sara buys and drops off the list.
    const omar = list.find((w: any) => w.name === 'Omar Hany');
    expect((await api.post(`${v()}/events/${eventId}/waitlist/${omar.id}/notify`)).body.notified).toBe(true);
    await buy(2, '+971501112222', 'sara@example.com');
    expect((await api.get(`${v()}/events/${eventId}/waitlist`)).body.find((w: any) => w.name === 'Sara Ali').status).toBe('bought');
    expect((await api.del(`${v()}/events/${eventId}/waitlist/${omar.id}`)).body.removed).toBe(true);
  });

  it('a scanned ticket cannot be refunded; the full refund includes the fee', async () => {
    const code = await buy(1, '01099990000', 'x@example.com');
    const o = (await api.get(`${v()}/events/${eventId}/orders`)).body.find((x: any) => x.code === code);
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.orderId, o.id));
    await db.update(schema.tickets).set({ checkedInAt: new Date() }).where(eq(schema.tickets.id, t.id));
    expect((await api.post(`${v()}/events/${eventId}/orders/${o.id}/refund`, {})).body.error).toBe('already_used');
    await db.update(schema.tickets).set({ checkedInAt: null }).where(eq(schema.tickets.id, t.id));
    const r = await api.post(`${v()}/events/${eventId}/orders/${o.id}/refund`, {});
    expect(r.body.refunded).toBe(o.total);
    expect(o.total).toBeGreaterThan(o.ticketPrice);
  });
});

describe('Deposit refunds', () => {
  it('refunds a paid deposit once, and not after it came off a bill', async () => {
    const f = await api.put(`${v()}/floor`, { items: [{ ref: 'z', kind: 'zone', label: 'Terrace', x: 0, y: 0, w: 500, h: 400, deposit: 100000 }, { kind: 'table', shape: 'round', label: 'T1', x: 50, y: 50, w: 80, h: 80, seats: 4 }] });
    const zoneId = f.body.find((i: any) => i.kind === 'zone').id;
    const s = await api.put(`${v()}/slots`, { slots: [{ startsAt: '21:00', endsAt: '23:00', capacity: 20 }] });
    const book = async (phone: string) => {
      const b = await api.post('/api/public/venues/lumen-rooftop/bookings', { date: tomorrow(), slotId: s.body[0].id, zoneId, booker: { name: 'Mona Adel', phone, email: `${phone}@example.com` } });
      const res = (await api.get(`${v()}/reservations?date=${tomorrow()}`)).body.find((x: any) => x.code === b.body.code);
      await api.post(`${v()}/reservations/${res.id}/accept`, {});
      const pay = await api.post(`/api/public/bookings/${b.body.code}/pay`);
      await app.inject({ method: 'POST', url: `/dev/pay/${pay.body.paymentId}`, payload: { result: 'paid' } });
      return res.id as string;
    };
    const a = await book('01012340001');
    expect((await api.post(`${v()}/reservations/${a}/refund-deposit`, { reason: 'Rain' })).body).toMatchObject({ method: 'paymob' });
    expect((await api.post(`${v()}/reservations/${a}/refund-deposit`, {})).status).toBe(409);
    const [ra] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, a));
    expect(ra.depositRefundedAt).not.toBeNull();
    // A deposit already used on a paid bill stays.
    const b = await book('01012340002');
    const [rb] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, b));
    await db.insert(schema.tabs).values({ venueId, reservationId: b, guestId: rb.guestId, status: 'paid', depositCredit: rb.depositAmount, total: 0, paidAt: new Date() });
    expect((await api.post(`${v()}/reservations/${b}/refund-deposit`, {})).body.error).toBe('deposit_used');
    // Reports take refunds off the money in.
    const rep = await api.get(`${v()}/reports`);
    expect(rep.body.money.refunds).toBeGreaterThanOrEqual(100000 + 150000);
    expect(rep.body.money.total).toBe(rep.body.money.tables + rep.body.money.tickets + rep.body.money.deposits - rep.body.money.refunds);
  });
});

describe('Daily report', () => {
  it('sends last night to the owner once, only when switched on, and a test on demand', async () => {
    const t = await api.post(`${v()}/daily-report/test`, {});
    expect(t.body.emails).toEqual(['owner@lumen.eg']);
    const [m] = await db.select().from(schema.messages).where(like(schema.messages.kind, 'daily_report_test:%'));
    expect(m.subject).toContain('Lumen Rooftop · last night');
    expect(m.body).toContain('Money in');

    // Something happened last night: a paid bill.
    const at = new Date(Date.now() - 86400_000);
    at.setUTCHours(20, 0, 0, 0);
    await db.insert(schema.tabs).values({ venueId, status: 'paid', total: 250000, partySize: 2, payMethod: 'cash', paidAt: at });
    const ten = new Date(); ten.setUTCHours(9, 0, 0, 0); // 11 AM Cairo
    expect(await runDailyReports(ten)).toBe(0); // off by default
    await api.patch(v(), { settings: { dailyReport: { on: true, emails: ['boss@lumen.eg'], phones: ['01000000001'] } } });
    expect(await runDailyReports(ten)).toBe(1);
    expect(await runDailyReports(ten)).toBe(0);
    const sent = await db.select().from(schema.messages).where(and(like(schema.messages.kind, 'daily_report:%'), eq(schema.messages.channel, 'email')));
    expect(sent.map((s) => s.to)).toEqual(['boss@lumen.eg']);
    expect(sent[0].body).toContain('EGP 2,500');
    const early = new Date(); early.setUTCHours(5, 0, 0, 0); // 7 AM Cairo
    expect(await runDailyReports(early)).toBe(0);
  });

  it('goes only by the channel the venue picked', async () => {
    await api.patch(v(), { settings: { dailyReport: { on: true, channel: 'email', emails: ['boss@lumen.eg'], phones: ['01000000001'] } } });
    let t = await api.post(`${v()}/daily-report/test`, {});
    expect(t.body.emails).toEqual(['boss@lumen.eg']);
    expect(t.body.phones).toEqual([]);
    await api.patch(v(), { settings: { dailyReport: { on: true, channel: 'whatsapp', emails: ['boss@lumen.eg'], phones: ['01000000001'] } } });
    t = await api.post(`${v()}/daily-report/test`, {});
    expect(t.body.emails).toEqual([]);
    expect(await api.patch(v(), { settings: { dailyReport: { on: true, channel: 'sms', emails: [], phones: [] } } }).then((r) => r.status)).toBe(400);
  });
});

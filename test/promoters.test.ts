import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/index.js';
import { nightOf } from '../src/lib/dates.js';
import { freshApp, client, tomorrow } from './helpers.js';

let app: FastifyInstance;
let api: ReturnType<typeof client>;
let venueId = '', owner = '', slotId = '';
const v = () => `/api/venues/${venueId}`;

beforeAll(async () => {
  app = await freshApp();
  api = client(app);
  await api.login('admin@xtra.eg', 'admin1234');
  venueId = (await api.post('/api/admin/venues', { name: 'Promo Club', owner: { name: 'Owner', email: 'o@p.eg', password: 'password1' } })).body.venue.id;
  owner = (await api.login('o@p.eg', 'password1')).body.token;
  slotId = (await api.put(`${v()}/slots`, { slots: [{ startsAt: '22:00', endsAt: '02:00' }] })).body[0].id;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('promoters and the guest list', () => {
  let karim: any;

  it('adds a promoter with a link code and a private page', async () => {
    const r = await api.post(`${v()}/promoters`, { name: 'Karim Saad', phone: '01055555555', commissionKind: 'guest', commission: 10000 });
    expect(r.status).toBe(201);
    karim = r.body;
    expect(karim.code).toBe('KARIMSAAD');
    expect(karim.token.length).toBeGreaterThan(20);
    const dup = await api.post(`${v()}/promoters`, { name: 'Karim Saad' });
    expect(dup.body.code).toBe('KARIMSAAD2');
    expect((await api.post(`${v()}/promoters`, { name: 'X Y', code: 'karimsaad' })).status).toBe(409);
  });

  it('a booking through the link counts for the promoter', async () => {
    const b = await api.post('/api/public/venues/promo-club/bookings', {
      date: tomorrow(), slotId, partySize: 4, ref: 'karimsaad',
      booker: { name: 'Hana Fathy', phone: '01066666666' },
    });
    expect(b.status).toBe(201);
    const [r] = await db.select().from(schema.reservations).where(eq(schema.reservations.code, b.body.code));
    expect(r.promoterId).toBe(karim.id);
    // An unknown code is simply ignored.
    const b2 = await api.post('/api/public/venues/promo-club/bookings', { date: tomorrow(), slotId, ref: 'NOPE', booker: { name: 'Ali', phone: '01077777777' } });
    expect(b2.status).toBe(201);
  });

  it('the promoter puts names on tonight\'s list from their page', async () => {
    const page = await api.get(`/api/public/promoter/${karim.token}`);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ promoter: { name: 'Karim Saad', code: 'KARIMSAAD' }, venue: { name: 'Promo Club' }, list: [] });
    const g = await api.post(`/api/public/promoter/${karim.token}/guests`, { name: 'Youssef Nabil', plus: 2 });
    expect(g.status).toBe(201);
    await api.post(`/api/public/promoter/${karim.token}/guests`, { name: 'Laila Omar' });
    expect((await api.post(`/api/public/promoter/${karim.token}/guests`, { name: 'Old', night: '2020-01-01' })).status).toBe(400);
    expect((await api.get('/api/public/promoter/not-a-token')).status).toBe(404);
    const list = await api.get(`${v()}/guestlist`);
    expect(list.body.map((l: any) => [l.name, l.promoter])).toEqual([['Laila Omar', 'Karim Saad'], ['Youssef Nabil', 'Karim Saad']]);
  });

  it('door checks them in, the promoter sees it, commission adds up', async () => {
    await api.post(`${v()}/staff`, { name: 'Door', email: 'd@p.eg', password: 'password1', role: 'door' });
    await api.login('d@p.eg', 'password1');
    const list = (await api.get(`${v()}/guestlist`)).body;
    const y = list.find((l: any) => l.name === 'Youssef Nabil');
    expect((await api.post(`${v()}/guestlist/${y.id}/checkin`)).body).toMatchObject({ ok: true, plus: 2 });
    expect((await api.post(`${v()}/guestlist/${y.id}/checkin`)).body.reason).toBe('already_in');
    expect((await api.post(`${v()}/promoters`, { name: 'Door Promo' })).status).toBe(403);
    api.setToken(owner);
    const page = await api.get(`/api/public/promoter/${karim.token}`);
    expect(page.body.list.find((l: any) => l.name === 'Youssef Nabil').in).toBe(true);
    // Checked-in names can't be taken off any more.
    expect((await api.del(`/api/public/promoter/${karim.token}/guests/${y.id}`)).status).toBe(404);
    const stats = (await api.get(`${v()}/promoters?from=${nightOf()}&to=${tomorrow()}`)).body.promoters.find((p: any) => p.id === karim.id).stats;
    expect(stats).toMatchObject({ bookings: 0, listed: 4, guestsIn: 3, owed: 30000 });
  });

  it('switching a promoter off kills their page and link', async () => {
    await api.patch(`${v()}/promoters/${karim.id}`, { active: false });
    expect((await api.get(`/api/public/promoter/${karim.token}`)).status).toBe(404);
  });
});

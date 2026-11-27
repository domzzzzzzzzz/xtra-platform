import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, pool, schema } from '../src/db/index.js';
import { nightOf } from '../src/lib/dates.js';
import { paymobHmac } from '../src/integrations/paymob.js';
import crypto from 'node:crypto';
import { config } from '../src/config.js';
import { appleAuthToken } from '../src/integrations/wallet.js';
import { freshApp, client, tomorrow, fakeAppleCerts } from './helpers.js';

let app: FastifyInstance;
let api: ReturnType<typeof client>;
let venueId: string;
let ownerToken: string;
let ticketToken = '';
const v = () => `/api/venues/${venueId}`;

beforeAll(async () => {
  app = await freshApp();
  api = client(app);
  await api.login('admin@xtra.eg', 'admin1234');
  const r = await api.post('/api/admin/venues', { name: 'Lumen Rooftop', owner: { name: 'Owner', email: 'owner@lumen.eg', password: 'password1' } });
  expect(r.status).toBe(201);
  venueId = r.body.venue.id;
  await api.login('owner@lumen.eg', 'password1');
  ownerToken = (await api.login('owner@lumen.eg', 'password1')).body.token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('platform', () => {
  it('only XTRA admins can change the booking fee', async () => {
    expect((await api.put('/api/admin/settings', { bookingFeeBps: 600, feeVatBps: 1400 })).status).toBe(403);
    await api.login('admin@xtra.eg', 'admin1234');
    const r = await api.put('/api/admin/settings', { bookingFeeBps: 500, feeVatBps: 1400 });
    expect(r.body.bookingFeeBps).toBe(500);
    api.setToken(ownerToken);
  });

  it('keeps venues apart', async () => {
    await api.login('admin@xtra.eg', 'admin1234');
    const other = await api.post('/api/admin/venues', { name: 'Saba Lounge', owner: { name: 'Saba', email: 'saba@x.eg', password: 'password1' } });
    await api.login('saba@x.eg', 'password1');
    expect((await api.get(`${v()}/reservations`)).status).toBe(403);
    expect(other.body.venue.slug).toBe('saba-lounge');
    api.setToken(ownerToken);
  });

  it('door staff cannot change the floor map', async () => {
    await api.post(`${v()}/staff`, { name: 'Door', email: 'door@lumen.eg', password: 'password1', role: 'door' });
    await api.login('door@lumen.eg', 'password1');
    expect((await api.put(`${v()}/floor`, { items: [] })).status).toBe(403);
    api.setToken(ownerToken);
  });
});

describe('floor map, booking, deposit, door, bill', () => {
  let tableId: string;
  let zoneId: string;
  let slotId: string;
  let code: string;

  it('saves a floor map with zones, tables and chairs, and finds each table its zone', async () => {
    const r = await api.put(`${v()}/floor`, { items: [
      { ref: 'z1', kind: 'zone', label: 'Terrace', x: 0, y: 0, w: 500, h: 400, minSpend: 600000, deposit: 150000 },
      { ref: 't1', kind: 'table', shape: 'round', label: 'T1', x: 50, y: 50, w: 80, h: 80, seats: 4 },
      { kind: 'chair', parentRef: 't1', x: 40, y: 40, w: 20, h: 20 },
      { kind: 'chair', parentRef: 't1', x: 120, y: 40, w: 20, h: 20, enabled: false },
      { kind: 'bar', label: 'Bar', x: 600, y: 0, w: 200, h: 60 },
    ] });
    expect(r.status).toBe(200);
    const table = r.body.find((i: any) => i.label === 'T1');
    const zone = r.body.find((i: any) => i.kind === 'zone');
    expect(table.zoneId).toBe(zone.id);
    expect(r.body.filter((i: any) => i.kind === 'chair' && i.parentId === table.id)).toHaveLength(2);
    tableId = table.id;
    zoneId = zone.id;
    // Switch a chair back on.
    const chair = r.body.find((i: any) => i.kind === 'chair' && !i.enabled);
    expect((await api.patch(`${v()}/floor/${chair.id}`, { enabled: true })).body.enabled).toBe(true);
  });

  it('sets time slots and a deposit', async () => {
    const s = await api.put(`${v()}/slots`, { slots: [{ startsAt: '21:00', endsAt: '23:00', capacity: 6 }] });
    slotId = s.body[0].id;
    await api.patch(v(), { depositPerPerson: 50000, notifyChannel: 'both', instagram: 'lumen' });
    const pub = await api.get('/api/public/venues/lumen-rooftop/slots?date=' + tomorrow());
    expect(pub.body.slots[0]).toMatchObject({ from: '21:00', to: '23:00', placesLeft: 6 });
  });

  it('guest books with +1s, it waits in review', async () => {
    const r = await api.post('/api/public/venues/lumen-rooftop/bookings', {
      date: tomorrow(), slotId, zoneId,
      booker: { name: 'Mona Adel', phone: '01011111111', email: 'mona@example.com', instagram: 'mona', gender: 'female', whatsappOptIn: true },
      guests: [{ name: 'Sara Ali', phone: '01022222222', gender: 'female' }, { name: 'Omar Hany' }],
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('in_review');
    code = r.body.code;
    const st = await api.get(`/api/public/bookings/${code}`);
    expect(st.body).toMatchObject({ status: 'in_review', partySize: 3, area: 'Terrace', minSpend: 600000 });
    expect(st.body.party.every((p: any) => p.passUrl === null)).toBe(true);
    const msgs = await db.select().from(schema.messages).where(eq(schema.messages.kind, 'booking_received'));
    expect(msgs.map((m) => m.channel).sort()).toEqual(['email', 'whatsapp']);
  });

  it('refuses a booking that would go over the slot capacity', async () => {
    const r = await api.post('/api/public/venues/lumen-rooftop/bookings', {
      date: tomorrow(), slotId, booker: { name: 'Big Group', phone: '01033333333' },
      guests: Array.from({ length: 4 }, (_, i) => ({ name: `Friend ${i}` })),
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('slot_full');
  });

  it('venue accepts, guest pays the deposit, everyone gets a pass', async () => {
    const list = await api.get(`${v()}/reservations?date=${tomorrow()}`);
    const res = list.body.find((x: any) => x.code === code);
    const acc = await api.post(`${v()}/reservations/${res.id}/accept`, { tableId });
    expect(acc.body.status).toBe('accepted');
    expect(acc.body.depositAmount).toBe(150000);
    expect((await api.post(`${v()}/reservations/${res.id}/accept`, {})).status).toBe(409);

    const pay = await api.post(`/api/public/bookings/${code}/pay`);
    expect(pay.body.checkoutUrl).toContain('/dev/pay/');
    // Simulate Paymob calling back with a valid signature.
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, pay.body.paymentId));
    const txn = { amount_cents: p.amount, created_at: 'x', currency: 'EGP', error_occured: false, has_parent_transaction: false, id: 777, integration_id: 1, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 1, merchant_order_id: p.id }, owner: 1, pending: false, source_data: { pan: '1234', sub_type: 'Visa', type: 'card' }, success: true };
    const bad = await app.inject({ method: 'POST', url: '/webhooks/paymob?hmac=nope', payload: { type: 'TRANSACTION', obj: txn } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: `/webhooks/paymob?hmac=${paymobHmac(txn, 'test-hmac')}`, payload: { type: 'TRANSACTION', obj: txn } });
    expect(ok.statusCode).toBe(200);

    const st = await api.get(`/api/public/bookings/${code}`);
    expect(st.body.status).toBe('confirmed');
    expect(st.body.deposit.paid).toBe(true);
    expect(st.body.party.every((p: any) => p.passUrl)).toBe(true);
    const passes = await db.select().from(schema.messages).where(eq(schema.messages.kind, 'booking_pass'));
    expect(passes.length).toBe(3); // Mona WA+email, Sara WA. Omar has no contact.
  });

  it('door scan works once per person, and only on the right night', async () => {
    const [res] = await db.select().from(schema.reservations).where(eq(schema.reservations.code, code));
    const party = await db.select().from(schema.reservationGuests).where(eq(schema.reservationGuests.reservationId, res.id));
    let scan = await api.post(`${v()}/checkin`, { token: party[0].qrToken });
    expect(scan.body).toMatchObject({ ok: false, reason: 'wrong_night' });
    await db.update(schema.reservations).set({ date: nightOf() }).where(eq(schema.reservations.id, res.id));
    await api.login('door@lumen.eg', 'password1');
    scan = await api.post(`${v()}/checkin`, { token: party[0].qrToken });
    expect(scan.body).toMatchObject({ ok: true, type: 'booking', party: 3, arrivedCount: 1, table: 'T1' });
    scan = await api.post(`${v()}/checkin`, { token: party[0].qrToken });
    expect(scan.body).toMatchObject({ ok: false, reason: 'already_in' });
    expect((await api.post(`${v()}/checkin`, { token: 'not-a-real-token-123' })).body.reason).toBe('unknown');
    api.setToken(ownerToken);
    const tonight = await api.get(`${v()}/tonight`);
    expect(tonight.body.tables.find((t: any) => t.table.id === tableId).state).toBe('arrived');
  });

  it('waiter orders, bill applies min spend, service, VAT and deposit, guest earns points', async () => {
    const m1 = await api.post(`${v()}/menu`, { category: 'Drinks', name: 'Mojito', price: 32000 });
    const m2 = await api.post(`${v()}/menu`, { category: 'Food', name: 'Fries', price: 21000 });
    const [res] = await db.select().from(schema.reservations).where(eq(schema.reservations.code, code));
    const tab = await api.post(`${v()}/tabs`, { reservationId: res.id });
    expect(tab.status).toBe(201);
    expect((await api.post(`${v()}/tabs`, { tableId })).status).toBe(409);
    await api.post(`${v()}/tabs/${tab.body.id}/items`, { items: [{ menuItemId: m1.body.id, qty: 4 }, { menuItemId: m2.body.id, qty: 2 }] });
    const sent = await api.post(`${v()}/tabs/${tab.body.id}/send`);
    expect(sent.body.sent).toBe(2);
    const t = await api.get(`${v()}/tabs/${tab.body.id}`);
    // 4x320 + 2x210 = 1,700; min 6,000 → top-up 4,300; service 720; VAT 924.80; deposit -1,500
    expect(t.body.bill).toMatchObject({ subtotal: 170000, minSpendTopUp: 430000, service: 72000, vat: 94080, depositCredit: 150000, total: 616080 });
    const paid = await api.post(`${v()}/tabs/${tab.body.id}/pay`, { method: 'cash' });
    expect(paid.body.status).toBe('paid');
    const [guest] = await db.select().from(schema.guests).where(eq(schema.guests.phone, '+201011111111'));
    const crm = await api.get(`${v()}/guests/${guest.id}`);
    expect(crm.body.points).toBe(Math.floor(766080 / 10000));
    expect(crm.body.visits).toBe(1);
    expect(crm.body.tier.name).toBe('Member');
  });
});

describe('ticketing', () => {
  let eventId: string;
  let standing: any;
  let lounge: any;

  it('creates an event with its own seat map and publishes it', async () => {
    const e = await api.post(`${v()}/events`, { title: 'Amr Diab Night', startsAt: new Date(Date.now() + 3 * 86400_000).toISOString(), rules: ['21+'], maxPerOrder: 10 });
    eventId = e.body.id;
    expect((await api.patch(`${v()}/events/${eventId}`, { status: 'published' })).status).toBe(400);
    const map = await api.put(`${v()}/events/${eventId}/map`, { zones: [
      { name: 'Stage', kind: 'decor', x: 0, y: 0, w: 10, h: 2 },
      { name: 'Fan pit', kind: 'standing', price: 100000, capacity: 3, x: 0, y: 3, w: 10, h: 4 },
      { name: 'VIP lounge', kind: 'table', price: 250000, x: 0, y: 8, w: 10, h: 3, seats: [{ label: 'A1', seats: 8 }, { label: 'A2', seats: 8 }] },
    ] });
    standing = map.body.zones.find((z: any) => z.name === 'Fan pit');
    lounge = map.body.zones.find((z: any) => z.name === 'VIP lounge');
    expect(lounge.left).toBe(2);
    expect((await api.patch(`${v()}/events/${eventId}`, { status: 'published' })).body.status).toBe('published');
  });

  it('holds seats for 10 minutes and never oversells', async () => {
    const pub = await api.get(`/api/public/events/${eventId}`);
    expect(pub.body.priceFrom).toBe(100000);
    const h1 = await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: standing.id, qty: 2 }] });
    expect(h1.status).toBe(201);
    expect(h1.body.secondsLeft).toBeGreaterThan(9 * 60);
    expect(h1.body.secondsLeft).toBeLessThanOrEqual(10 * 60);
    expect(h1.body.totals).toMatchObject({ tickets: 200000, fee: 10000, feeVat: 1400, total: 211400 });
    const h2 = await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: standing.id, qty: 2 }] });
    expect(h2.status).toBe(409);
    // Expire the first hold: its places come back.
    await db.update(schema.ticketOrders).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.ticketOrders.code, h1.body.code));
    const h3 = await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: standing.id, qty: 3 }] });
    expect(h3.status).toBe(201);
    expect((await api.get(`/api/public/orders/${h1.body.code}`)).body.status).toBe('expired');
  });

  it('single-use guest-locked codes and batches work', async () => {
    const batch = await api.post(`${v()}/promos/batch`, { eventId, percentOff: 100, phones: ['01055555555'] });
    expect(batch.body.created).toBe(1);
    const free = batch.body.codes[0].code;
    const h = await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: lounge.id, seatId: (await api.get(`/api/public/events/${eventId}`)).body.seats[0].id }] });
    expect(h.body.totals.total).toBe(2000000 + 100000 + 14000);
    expect((await api.post(`/api/public/orders/${h.body.code}/promo`, { code: free, phone: '01099999999' })).body.error).toBe('promo_locked');
    const applied = await api.post(`/api/public/orders/${h.body.code}/promo`, { code: free, phone: '01055555555' });
    expect(applied.body.totals.total).toBe(0);
    const out = await api.post(`/api/public/orders/${h.body.code}/checkout`, {
      buyer: { firstName: 'Karim', lastName: 'Said', email: 'karim@example.com', phone: '01055555555' },
    });
    expect(out.body.status).toBe('paid');
    expect(out.body.order.tickets).toHaveLength(8); // a table of 8
    // Code is used up now.
    const h2 = await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: lounge.id, seatId: (await api.get(`/api/public/events/${eventId}`)).body.seats[1].id }] });
    expect((await api.post(`/api/public/orders/${h2.body.code}/promo`, { code: free, phone: '01055555555' })).body.error).toBe('promo_used_up');
  });

  it('paid order sends QR tickets, the pass page offers wallets, door scans them', async () => {
    await api.post(`${v()}/promos`, { code: 'HALF', percentOff: 50, maxUses: 10 });
    const seats = (await api.get(`/api/public/events/${eventId}`)).body.seats;
    expect(seats.every((s: any) => s.taken)).toBe(true);
    const orders = await db.select().from(schema.ticketOrders).where(eq(schema.ticketOrders.status, 'held'));
    const held = orders.find((o) => o.subtotal === 2000000)!;
    const p = await api.post(`/api/public/orders/${held.code}/promo`, { code: 'half' });
    expect(p.body.totals).toMatchObject({ tickets: 2000000, discount: 1000000, fee: 50000, feeVat: 7000, total: 1057000 });
    const out = await api.post(`/api/public/orders/${held.code}/checkout`, {
      buyer: { firstName: 'Nour', lastName: 'Fahmy', email: 'nour@example.com', phone: '01066666666' },
      attendees: [{ firstName: 'Nour', lastName: 'Fahmy', phone: '01066666666' }, { firstName: 'Lina', lastName: 'Fahmy', email: 'lina@example.com' }],
    });
    expect(out.body.status).toBe('pending');
    const payId = out.body.checkoutUrl.split('/').pop();
    await app.inject({ method: 'POST', url: `/dev/pay/${payId}`, payload: 'result=paid', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    const order = await api.get(`/api/public/orders/${held.code}`);
    expect(order.body.status).toBe('paid');
    const token = order.body.tickets[1].url.split('/t/')[1];
    const pass = await api.get(`/api/public/pass/${token}`);
    expect(pass.body).toMatchObject({ type: 'ticket', name: 'Lina Fahmy', ticketType: 'VIP lounge', seat: 'A2', appleWallet: { configured: false } });
    const png = await app.inject({ url: `/api/public/qr/${token}.png` });
    expect(png.headers['content-type']).toBe('image/png');

    const sales = await api.get(`${v()}/events/${eventId}/sales`);
    expect(sales.body).toMatchObject({ orders: 2, tickets: 16, fees: 50000, venuePayout: 1000000 });
    // Door: right venue, wrong night until the event night.
    expect((await api.post(`${v()}/checkin`, { token })).body.reason).toBe('wrong_night');
    await db.update(schema.events).set({ startsAt: new Date() }).where(eq(schema.events.id, eventId));
    expect((await api.post(`${v()}/checkin`, { token })).body).toMatchObject({ ok: true, type: 'ticket', name: 'Lina Fahmy' });
    ticketToken = token;
  });

  it('wallets: Google link and Apple pass with the table, and the Apple update service', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    Object.assign(config.googleWallet, { issuerId: '3388000000012345678', serviceAccountEmail: 'w@x.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
    Object.assign(config.appleWallet, { passTypeId: 'pass.eg.xtra.test', teamId: 'ABCDE12345', ...fakeAppleCerts() });
    try {
      const pass = await api.get(`/api/public/pass/${ticketToken}`);
      expect(pass.body).toMatchObject({ googleWalletUrl: `http://test.local/api/public/pass/${ticketToken}/google`, appleWallet: { configured: true } });
      const g = await app.inject({ url: `/api/public/pass/${ticketToken}/google` });
      expect(g.statusCode).toBe(302);
      const jwt = JSON.parse(Buffer.from(g.headers.location!.toString().split('/').pop()!.split('.')[1], 'base64url').toString());
      expect(jwt.payload.eventTicketClasses[0]).toMatchObject({ issuerName: 'Lumen Rooftop' });
      expect(jwt.payload.eventTicketObjects[0]).toMatchObject({ ticketHolderName: 'Lina Fahmy', ticketNumber: expect.any(String) });
      expect(jwt.payload.eventTicketObjects[0].textModulesData).toEqual(expect.arrayContaining([{ id: 'table', header: 'Table', body: 'A2' }]));
      const pk = await app.inject({ url: `/api/public/pass/${ticketToken}/apple.pkpass` });
      expect(pk.headers['content-type']).toBe('application/vnd.apple.pkpass');

      // An iPhone registers for updates, asks what changed, downloads the pass, unregisters.
      const dev = `/api/wallet/apple/v1/devices/dev1/registrations/pass.eg.xtra.test`;
      const auth = { authorization: `ApplePass ${appleAuthToken(ticketToken)}` };
      const reg = (headers: Record<string, string>) => app.inject({ method: 'POST', url: `${dev}/${ticketToken}`, headers, payload: { pushToken: 'ab'.repeat(32) } });
      expect((await reg({ authorization: 'ApplePass wrong' })).statusCode).toBe(401);
      expect((await reg(auth)).statusCode).toBe(201);
      expect((await reg(auth)).statusCode).toBe(200);
      const list = await app.inject({ url: dev });
      expect(list.json().serialNumbers).toEqual([ticketToken]);
      expect((await app.inject({ url: `${dev}?passesUpdatedSince=${list.json().lastUpdated}` })).statusCode).toBe(204);
      await db.insert(schema.walletPassUpdates).values({ serial: ticketToken, updatedAt: new Date(Date.now() + 5000) });
      expect((await app.inject({ url: `${dev}?passesUpdatedSince=${list.json().lastUpdated}` })).json().serialNumbers).toEqual([ticketToken]);
      const latest = await app.inject({ url: `/api/wallet/apple/v1/passes/pass.eg.xtra.test/${ticketToken}`, headers: auth });
      expect(latest.statusCode).toBe(200);
      expect((await app.inject({ url: `/api/wallet/apple/v1/passes/pass.eg.xtra.test/${ticketToken}`, headers: { ...auth, 'if-modified-since': latest.headers['last-modified'] as string } })).statusCode).toBe(304);
      expect((await app.inject({ method: 'DELETE', url: `${dev}/${ticketToken}`, headers: auth })).statusCode).toBe(200);
      expect((await app.inject({ url: dev })).statusCode).toBe(204);
    } finally {
      Object.assign(config.googleWallet, { issuerId: '', serviceAccountEmail: '', privateKey: '' });
      Object.assign(config.appleWallet, { passTypeId: '', teamId: '', cert: '', key: '', wwdr: '' });
    }
  });
});

describe('guests, community, marketing', () => {
  it('guest signs in with a WhatsApp code and sees bookings, tickets and tier', async () => {
    const otp = await api.post('/api/guest/otp', { phone: '01011111111' });
    expect((await api.post('/api/guest/verify', { phone: '01011111111', code: '000000' === otp.body.code ? '111111' : '000000' })).status).toBe(400);
    const ok = await api.post('/api/guest/verify', { phone: '01011111111', code: otp.body.code });
    api.setToken(ok.body.token);
    const me = await api.get('/api/guest/me');
    expect(me.body.guest.firstName).toBe('Mona');
    expect(me.body.memberships[0]).toMatchObject({ venue: 'Lumen Rooftop', tier: { name: 'Member' } });
    expect(me.body.bookings).toHaveLength(1);
    expect((await api.get(`${v()}/guests`)).status).toBe(401);
    api.setToken(ownerToken);
  });

  it('campaigns reach opted-in guests only and fill variables', async () => {
    const aud = await api.post(`${v()}/campaigns/audience`, { channel: 'whatsapp', segment: {} });
    expect(aud.body.count).toBe(1); // only Mona opted in
    const c = await api.post(`${v()}/campaigns`, { name: 'Weekend', channel: 'whatsapp', body: 'Hi {first_name}, this weekend at {venue}!' });
    const sent = await api.post(`${v()}/campaigns/${c.body.id}/send`);
    expect(sent.body).toMatchObject({ status: 'sent', sentCount: 1 });
    const [msg] = await db.select().from(schema.messages).where(eq(schema.messages.kind, 'campaign'));
    expect(msg.body).toBe('Hi Mona, this weekend at Lumen Rooftop!');
    expect((await api.post(`${v()}/campaigns/${c.body.id}/send`)).status).toBe(409);
  });

  it('managers tag guests and edit tiers', async () => {
    const list = await api.get(`${v()}/guests?q=mona`);
    await api.patch(`${v()}/guests/${list.body[0].id}`, { tags: ['vip'] });
    expect((await api.get(`${v()}/guests?tag=vip`)).body).toHaveLength(1);
    const t = await api.put(`${v()}/tiers`, { tiers: [{ name: 'Member', minSpend: 0, perks: [] }, { name: 'Black', minSpend: 500000, perks: ['Free entry'] }] });
    expect(t.body).toHaveLength(2);
    expect((await api.get(`${v()}/guests?q=mona`)).body[0].tier).toBe('Black');
  });
});

describe('live app support', () => {
  it('staff screens get ticket fees and which integrations are live', async () => {
    const r = await api.get('/api/platform');
    expect(r.body).toMatchObject({ bookingFeeBps: 500, feeVatBps: 1400, integrations: { paymob: false, whatsapp: false, email: false, googleWallet: false } });
    const anon = await app.inject({ url: '/api/platform' });
    expect(anon.statusCode).toBe(401);
  });

  it('a guest who goes back can let go of held tickets', async () => {
    const e = await api.post(`${v()}/events`, { title: 'Release Night', startsAt: new Date(Date.now() + 5 * 86400_000).toISOString() });
    const map = await api.put(`${v()}/events/${e.body.id}/map`, { zones: [{ name: 'Floor', kind: 'standing', price: 50000, capacity: 2, x: 0, y: 0, w: 10, h: 4 }] });
    const zoneId = map.body.zones[0].id;
    await api.patch(`${v()}/events/${e.body.id}`, { status: 'published' });
    const h = await api.post(`/api/public/events/${e.body.id}/hold`, { items: [{ zoneId, qty: 2 }] });
    expect((await api.post(`/api/public/events/${e.body.id}/hold`, { items: [{ zoneId, qty: 1 }] })).status).toBe(409);
    expect((await api.post(`/api/public/orders/${h.body.code}/release`)).body.released).toBe(true);
    expect((await api.post(`/api/public/events/${e.body.id}/hold`, { items: [{ zoneId, qty: 2 }] })).status).toBe(201);
  });

  it('automatic birthday message goes out once to opted-in guests', async () => {
    const { runAutomations } = await import('../src/modules/automations.js');
    const { localDate } = await import('../src/lib/dates.js');
    const [mona] = (await api.get(`${v()}/guests?q=mona`)).body;
    await db.update(schema.guests).set({ birthDate: `1995-${localDate(new Date(Date.now() + 7 * 86400_000)).slice(5)}`, whatsappOptIn: true }).where(eq(schema.guests.id, mona.id));
    await runAutomations();
    await runAutomations();
    const sent = await db.select().from(schema.messages).where(eq(schema.messages.guestId, mona.id));
    expect(sent.filter((m) => m.kind.startsWith('auto:bday:'))).toHaveLength(1);
    expect((await api.get(`${v()}/automations`)).body.bday).toBe(1);
  });
});

describe('XTRA admin: features and roles', () => {
  it('a venue role opens exactly the screens it was given', async () => {
    api.setToken(ownerToken);
    const role = await api.post(`${v()}/roles`, { name: 'Host', permissions: ['door', 'bookings'] });
    expect(role.status).toBe(201);
    const staff = await api.post(`${v()}/staff`, { name: 'Hana Host', email: 'host@lumen.eg', password: 'password1', roleId: role.body.id });
    expect(staff.body).toMatchObject({ roleName: 'Host', roleId: role.body.id });
    await api.login('host@lumen.eg', 'password1');
    const me = await api.get('/api/auth/me');
    expect(me.body.venues[0]).toMatchObject({ roleName: 'Host', perms: ['bookings', 'door'] });
    expect((await api.get(`${v()}/reservations`)).status).toBe(200);
    expect((await api.get(`${v()}/tabs`)).status).toBe(403);
    expect((await api.put(`${v()}/floor`, { items: [] })).status).toBe(403);
    expect((await api.get(`${v()}/staff`)).status).toBe(403);
    api.setToken(ownerToken);
    // In use: cannot delete until the staff member has another role.
    expect((await api.del(`${v()}/roles/${role.body.id}`)).status).toBe(409);
    await api.patch(`${v()}/staff/${staff.body.userId}`, { role: 'door' });
    expect((await api.del(`${v()}/roles/${role.body.id}`)).body.ok).toBe(true);
  });

  it('staff managers who are not owners cannot change an owner', async () => {
    const role = await api.post(`${v()}/roles`, { name: 'Office', permissions: ['staff'] });
    await api.post(`${v()}/staff`, { name: 'Omar Office', email: 'office@lumen.eg', password: 'password1', roleId: role.body.id });
    const owner = (await api.get(`${v()}/staff`)).body.find((s: any) => s.email === 'owner@lumen.eg');
    await api.login('office@lumen.eg', 'password1');
    expect((await api.patch(`${v()}/staff/${owner.userId}`, { role: 'waiter' })).status).toBe(400);
    expect((await api.post(`${v()}/staff`, { name: 'X', email: 'x@lumen.eg', password: 'password1', role: 'owner' })).status).toBe(400);
    api.setToken(ownerToken);
  });

  it('XTRA switches modules off per venue, for staff and guests', async () => {
    expect((await api.patch(`/api/admin/venues/${venueId}`, { features: ['reservations'] })).status).toBe(403);
    await api.login('admin@xtra.eg', 'admin1234');
    const list = await api.get('/api/admin/venues');
    expect(list.body.find((x: any) => x.id === venueId).owners[0].email).toBe('owner@lumen.eg');
    await api.patch(`/api/admin/venues/${venueId}`, { features: ['reservations', 'ordering', 'guests', 'community', 'marketing'] });
    api.setToken(ownerToken);
    const ev = await api.get(`${v()}/events`);
    expect(ev.body.error).toBe('feature_off');
    expect((await api.get('/api/auth/me')).body.venues[0].perms).not.toContain('events');
    const [anyEvent] = await db.select().from(schema.events).where(eq(schema.events.venueId, venueId)).limit(1);
    expect((await api.get(`/api/public/events/${anyEvent.id}`)).status).toBe(404);
    await api.login('admin@xtra.eg', 'admin1234');
    await api.patch(`/api/admin/venues/${venueId}`, { features: ['reservations', 'ordering', 'ticketing', 'marketing', 'guests', 'community'] });
    api.setToken(ownerToken);
    expect((await api.get(`${v()}/events`)).status).toBe(200);
  });
});

describe('Venue images and location', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  it('uploads a photo, reads a pin from a Maps link and shows both to guests', async () => {
    api.setToken(ownerToken);
    expect((await api.post(`${v()}/media`, { data: 'data:text/html;base64,PGgxPg==' })).status).toBe(400);
    const up = await api.post(`${v()}/media`, { data: png });
    expect(up.status).toBe(201);
    const img = await app.inject({ method: 'GET', url: up.body.url });
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload.length).toBeGreaterThan(50);
    const p = await api.patch(v(), { photoUrl: up.body.url, mapUrl: 'https://www.google.com/maps/place/Lumen/@30.0271,31.4913,17z' });
    expect(p.body).toMatchObject({ mapLat: 30.0271, mapLng: 31.4913, photoUrl: up.body.url });
    const pub = await api.get('/api/public/venues/lumen-rooftop');
    expect(pub.body.venue).toMatchObject({ lat: 30.0271, lng: 31.4913, photoUrl: up.body.url });
    expect((await api.patch(v(), { photoUrl: 'javascript:alert(1)' })).status).toBe(400);
  });
});

describe('Ticket tiers sold out by hand, and invitations', () => {
  it('a tier marked sold out stops sales but not invites; invites send free tickets that can be cancelled', async () => {
    api.setToken(ownerToken);
    const e = await api.post(`${v()}/events`, { title: 'Invite Night', startsAt: new Date(Date.now() + 4 * 86400_000).toISOString() });
    const map = await api.put(`${v()}/events/${e.body.id}/map`, { zones: [
      { name: 'Early bird', kind: 'standing', price: 30000, capacity: 5, x: 0, y: 0, w: 10, h: 4 },
      { name: 'VIP', kind: 'table', price: 100000, x: 0, y: 5, w: 10, h: 4, seats: [{ label: 'V1', seats: 4 }, { label: 'V2', seats: 4 }] },
    ] });
    const early = map.body.zones.find((z: any) => z.name === 'Early bird');
    const vip = map.body.zones.find((z: any) => z.name === 'VIP');
    await api.patch(`${v()}/events/${e.body.id}`, { status: 'published' });

    // Mark Early bird sold out: the page shows it closed and holds are refused.
    expect((await api.patch(`${v()}/events/${e.body.id}/zones/${early.id}`, { soldOut: true })).body.soldOut).toBe(true);
    let pub = await api.get(`/api/public/events/${e.body.id}`);
    expect(pub.body.zones.find((z: any) => z.id === early.id)).toMatchObject({ left: 0, soldOut: true, closed: true });
    expect((await api.post(`/api/public/events/${e.body.id}/hold`, { items: [{ zoneId: early.id, qty: 1 }] })).status).toBe(409);
    // Saving the seat map again keeps it closed.
    const again = await api.put(`${v()}/events/${e.body.id}/map`, { zones: map.body.zones.map((z: any) => ({ ...z, soldOut: undefined, seats: map.body.seats.filter((s: any) => s.zoneId === z.id) })) });
    expect(again.status).toBe(200);
    expect(again.body.zones.find((z: any) => z.id === early.id).markedSoldOut).toBe(true);

    // Invite 3 people to the closed tier by WhatsApp and email.
    const inv = await api.post(`${v()}/events/${e.body.id}/invites`, { zoneId: early.id, qty: 3, firstName: 'Sara', lastName: 'Adel', phone: '+971 50 123 4567', email: 'sara@example.com', note: 'See you there' });
    expect(inv.status).toBe(201);
    expect(inv.body.tickets).toBe(3);
    const wa = await db.select().from(schema.messages).where(eq(schema.messages.channel, 'whatsapp'));
    expect(wa.some((m) => m.to.endsWith('971501234567') && m.body.includes('invited you'))).toBe(true);
    const mail = await db.select().from(schema.messages).where(eq(schema.messages.kind, 'ticket_invite'));
    expect(mail[0].subject).toContain("You're invited");
    // A whole VIP table, email only.
    const v1 = map.body.seats.find((s: any) => s.label === 'V1');
    expect((await api.post(`${v()}/events/${e.body.id}/invites`, { zoneId: vip.id, seatId: v1.id, firstName: 'Omar', email: 'omar@example.com', channels: ['email'] })).body.tickets).toBe(4);
    expect((await api.post(`${v()}/events/${e.body.id}/invites`, { zoneId: vip.id, seatId: v1.id, firstName: 'Late', email: 'l@example.com', channels: ['email'] })).status).toBe(409);
    expect((await api.post(`${v()}/events/${e.body.id}/invites`, { zoneId: early.id, firstName: 'NoPhone', channels: ['whatsapp'] })).status).toBe(400);
    pub = await api.get(`/api/public/events/${e.body.id}`);
    expect(pub.body.seats.find((s: any) => s.id === v1.id).taken).toBe(true);

    // Invites are not sales: no money, counted apart.
    const sales = await api.get(`${v()}/events/${e.body.id}/sales`);
    expect(sales.body).toMatchObject({ tickets: 0, invited: 7, collected: 0, orders: 0 });
    const list = await api.get(`${v()}/events/${e.body.id}/invites`);
    expect(list.body.length).toBe(2);
    const sara = list.body.find((x: any) => x.name === 'Sara Adel');
    expect(sara).toMatchObject({ tickets: 3, status: 'active', phone: '+971501234567' });
    const tix = await api.get(`${v()}/events/${e.body.id}/tickets`);
    expect(tix.body.filter((t: any) => t.invite).length).toBe(7);
    expect(tix.body.some((t: any) => t.firstName === 'Guest' && t.lastName === 'of Sara')).toBe(true);

    // Resend, then cancel: the QR stops working.
    expect((await api.post(`${v()}/events/${e.body.id}/invites/${sara.id}/resend`)).body.sent).toBe(true);
    expect((await api.del(`${v()}/events/${e.body.id}/invites/${sara.id}`)).body.cancelled).toBe(true);
    const [t] = await db.select().from(schema.tickets).innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.tickets.orderId)).where(eq(schema.ticketOrders.id, sara.id));
    expect((await app.inject({ url: `/api/public/pass/${t.tickets.qrToken}` })).statusCode).toBe(404);

    // Reopen the tier: guests can buy again.
    await api.patch(`${v()}/events/${e.body.id}/zones/${early.id}`, { soldOut: false });
    expect((await api.post(`/api/public/events/${e.body.id}/hold`, { items: [{ zoneId: early.id, qty: 1 }] })).status).toBe(201);
  });
});

describe('Reports', () => {
  it('adds up bills, bookings, no-shows, tickets and best guests for a date range', async () => {
    api.setToken(ownerToken);
    const r = await api.get(`${v()}/reports`);
    expect(r.status).toBe(200);
    expect(r.body.days.length).toBe(30);
    expect(r.body.money.tables).toBeGreaterThan(0);
    expect(r.body.money.total).toBe(r.body.money.tables + r.body.money.tickets);
    expect(r.body.money.byMethod.reduce((s: number, m: any) => s + m.total, 0)).toBe(r.body.money.tables);
    expect(r.body.bookings.requests).toBeGreaterThan(0);
    expect(r.body.topGuests.length).toBeGreaterThan(0);
    expect(r.body.topGuests[0].spend).toBeGreaterThanOrEqual(r.body.topGuests.at(-1).spend);
    expect(r.body.events.length).toBeGreaterThan(0);
    expect(r.body.tickets.sold).toBeGreaterThan(0);
    expect(r.body.tickets.invited).toBeGreaterThan(0);
    expect(r.body.previous).toMatchObject({ to: new Date(Date.parse(r.body.from) - 864e5).toISOString().slice(0, 10) });
    expect(typeof r.body.previous.total).toBe('number');
    const custom = await api.get(`${v()}/reports?from=2026-01-01&to=2026-01-10`);
    expect(custom.body.days.length).toBe(10);
    expect(custom.body.previous).toMatchObject({ from: '2025-12-22', to: '2025-12-31' });
    expect((await api.get(`${v()}/reports?from=2026-02-01&to=2026-01-01`)).status).toBe(400);
    // Built-in door staff do not see money.
    await api.post(`${v()}/staff`, { name: 'Dina Door', email: 'dina@lumen.eg', password: 'password1', role: 'door' });
    await api.login('dina@lumen.eg', 'password1');
    expect((await api.get(`${v()}/reports`)).status).toBe(403);
    api.setToken(ownerToken);
  });
});

describe('Policies', () => {
  it('serves Terms, Privacy and Refunds pages', async () => {
    for (const [u, t] of [['/terms', 'Terms of use'], ['/privacy', 'Law No. 151 of 2020'], ['/refunds', 'Refund and cancellation']]) {
      const r = await app.inject({ method: 'GET', url: u });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toContain('text/html');
      expect(r.body).toContain(t);
    }
  });
});

describe('seated sections, live holds and find-your-seat', () => {
  let eventId: string;
  let stalls: any;
  let seats: any[];

  it('saves a block of rows with its layout and keeps seat ids when the rows are sent again', async () => {
    const e = await api.post(`${v()}/events`, { title: 'Theatre Night', startsAt: new Date(Date.now() + 4 * 86400_000).toISOString() });
    eventId = e.body.id;
    const rows = ['A', 'B'].flatMap((r, ri) => [1, 2, 3].map((n) => ({ label: `${r}-${n}`, x: n * 14, y: 100 + ri * 17 })));
    const zones = [
      { name: 'Stage', kind: 'decor', shape: 'stage', x: 0, y: 0, w: 100, h: 40 },
      { name: 'Entrance', kind: 'decor', shape: 'entrance', x: 20, y: 200, w: 60, h: 10 },
      { name: 'Stalls', kind: 'seated', price: 80000, x: 0, y: 90, w: 60, h: 40, meta: { x: 28, y: 108, rows: 2, cols: 3, curve: 0.3 }, seats: rows },
    ];
    const map = await api.put(`${v()}/events/${eventId}/map`, { zones });
    expect(map.status).toBe(200);
    stalls = map.body.zones.find((z: any) => z.name === 'Stalls');
    expect(stalls.meta).toMatchObject({ rows: 2, cols: 3 });
    expect(stalls.left).toBe(6);
    const ids = map.body.seats.filter((s: any) => s.zoneId === stalls.id).map((s: any) => s.id).sort();
    // The editor sends the rows again without ids: same seats, nothing duplicated.
    const again = await api.put(`${v()}/events/${eventId}/map`, { zones: map.body.zones.map((z: any) => ({ id: z.id, name: z.name, kind: z.kind, shape: z.shape, price: z.price, x: z.x, y: z.y, w: z.w, h: z.h, meta: z.meta, seats: z.kind === 'seated' ? rows : [] })) });
    expect(again.status).toBe(200);
    expect(again.body.seats.filter((s: any) => s.zoneId === stalls.id).map((s: any) => s.id).sort()).toEqual(ids);
    await api.patch(`${v()}/events/${eventId}`, { status: 'published' });
    seats = (await api.get(`/api/public/events/${eventId}`)).body.seats;
  });

  it('the first pick starts the hold, changes keep the clock, others see the seat on hold', async () => {
    const a1 = seats.find((s) => s.label === 'A-1'), a2 = seats.find((s) => s.label === 'A-2'), b1 = seats.find((s) => s.label === 'B-1');
    const h = await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: stalls.id, seatId: a1.id }] });
    expect(h.status).toBe(201);
    expect(h.body.lines[0]).toMatchObject({ seatId: a1.id, place: 'Stalls · Row A, Seat 1', tickets: 1 });
    const pub = await api.get(`/api/public/events/${eventId}`);
    expect(pub.body.seats.find((s: any) => s.id === a1.id)).toMatchObject({ taken: true, held: true });
    // Someone else cannot take it.
    expect((await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: stalls.id, seatId: a1.id }] })).body.error).toBe('seat_taken');
    // Add A-2, drop A-1, the expiry does not move.
    const before = h.body.holdExpiresAt;
    const ch = await api.put(`/api/public/orders/${h.body.code}/items`, { items: [{ zoneId: stalls.id, seatId: a2.id }, { zoneId: stalls.id, seatId: b1.id }] });
    expect(ch.status).toBe(200);
    expect(ch.body.holdExpiresAt).toBe(before);
    expect(ch.body.totals.tickets).toBe(160000);
    expect(ch.body.lines.map((l: any) => l.seat).sort()).toEqual(['A-2', 'B-1']);
    const other = await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: stalls.id, seatId: a1.id }] });
    expect(other.status).toBe(201);
    // A pick of nothing lets every seat go.
    const none = await api.put(`/api/public/orders/${other.body.code}/items`, { items: [] });
    expect(none.body.status).toBe('expired');
    // The first hold buys its two seats.
    const out = await api.post(`/api/public/orders/${h.body.code}/checkout`, { buyer: { firstName: 'Salma', lastName: 'Ali', email: 'salma@example.com', phone: '01077777777' }, attendees: [{ firstName: 'Salma', lastName: 'Ali' }, { firstName: 'Omar', lastName: 'Ali' }] });
    const payId = out.body.checkoutUrl.split('/').pop();
    await app.inject({ method: 'POST', url: `/dev/pay/${payId}`, payload: { result: 'paid' } });
    const order = await api.get(`/api/public/orders/${h.body.code}`);
    expect(order.body.tickets.map((t: any) => t.label).sort()).toEqual(['Stalls · Row A, Seat 2', 'Stalls · Row B, Seat 1']);
    const after = await api.get(`/api/public/events/${eventId}`);
    expect(after.body.seats.find((s: any) => s.id === a2.id)).toMatchObject({ taken: true, held: false });
    // A changed hold that expired cannot be changed again.
    await db.update(schema.ticketOrders).set({ holdExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.ticketOrders.code, other.body.code));
    expect((await api.put(`/api/public/orders/${other.body.code}/items`, { items: [] })).status).toBe(409);
  });

  it('the pass knows its seat and carries the map for the route; the door shows the seat', async () => {
    const order = (await db.select().from(schema.ticketOrders).where(eq(schema.ticketOrders.eventId, eventId))).find((o) => o.status === 'paid')!;
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.orderId, order.id));
    const pass = await api.get(`/api/public/pass/${t.qrToken}`);
    expect(pass.body).toMatchObject({ type: 'ticket', zoneKind: 'seated', ticketType: 'Stalls' });
    expect(pass.body.map.seatId).toBe(t.seatId);
    expect(pass.body.map.zones.some((z: any) => z.shape === 'entrance')).toBe(true);
    expect(pass.body.map.seats.length).toBe(6);
    await db.update(schema.events).set({ startsAt: new Date() }).where(eq(schema.events.id, eventId));
    const scan = await api.post(`${v()}/checkin`, { token: t.qrToken });
    expect(scan.body).toMatchObject({ ok: true, type: 'ticket' });
    expect(scan.body.seat).toMatch(/^Row [AB], Seat \d$/);
  });

  it('a sold seat cannot be removed from the map', async () => {
    const map = await api.get(`${v()}/events/${eventId}`);
    const r = await api.put(`${v()}/events/${eventId}/map`, { zones: map.body.zones.map((z: any) => ({ id: z.id, name: z.name, kind: z.kind, shape: z.shape, price: z.price, x: z.x, y: z.y, w: z.w, h: z.h, meta: z.meta, seats: [] })) });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain('Stalls · Row');
  });
});

describe('corporate events: invitation only, free seating and assigned seats', () => {
  let eventId: string;
  let vip: any;
  let hall: any;

  it('an invitation-only event sells nothing', async () => {
    const e = await api.post(`${v()}/events`, { title: 'Bank Annual Meeting', startsAt: new Date(Date.now() + 6 * 86400_000).toISOString(), inviteOnly: true });
    eventId = e.body.id;
    expect(e.body.inviteOnly).toBe(true);
    const seatsOf = (rows: string[], n: number) => rows.flatMap((r, ri) => Array.from({ length: n }, (_, i) => ({ label: `${r}-${i + 1}`, x: i * 14, y: ri * 17 })));
    const map = await api.put(`${v()}/events/${eventId}/map`, { zones: [
      { name: 'Entrance', kind: 'decor', shape: 'entrance', x: 0, y: 300, w: 60, h: 10 },
      { name: 'VIP', kind: 'seated', price: 0, x: 0, y: 0, w: 60, h: 40, meta: { x: 30, y: 20, rows: 2, cols: 2 }, seats: seatsOf(['A', 'B'], 2) },
      { name: 'Hall', kind: 'seated', price: 0, x: 0, y: 100, w: 60, h: 40, meta: { x: 30, y: 120, rows: 2, cols: 3, freeSeating: true }, seats: seatsOf(['C', 'D'], 3) },
    ] });
    vip = map.body.zones.find((z: any) => z.name === 'VIP');
    hall = map.body.zones.find((z: any) => z.name === 'Hall');
    expect(hall.left).toBe(6);
    await api.patch(`${v()}/events/${eventId}`, { status: 'published' });
    const pub = await api.get(`/api/public/events/${eventId}`);
    expect(pub.body.event.inviteOnly).toBe(true);
    const h = await api.post(`/api/public/events/${eventId}/hold`, { items: [{ zoneId: hall.id, qty: 1 }] });
    expect(h.body.error).toBe('invite_only');
  });

  it('invites one person to a chosen VIP seat and two to free seating', async () => {
    const seat = (await api.get(`${v()}/events/${eventId}`)).body.seats.find((s: any) => s.label === 'B-2');
    const one = await api.post(`${v()}/events/${eventId}/invites`, { zoneId: vip.id, seatId: seat.id, firstName: 'Hany', email: 'hany@bank.eg', channels: ['email'] });
    expect(one.status).toBe(201);
    expect(one.body.place).toBe('VIP · Row B, Seat 2');
    expect((await api.post(`${v()}/events/${eventId}/invites`, { zoneId: vip.id, seatId: seat.id, firstName: 'Late', email: 'l@bank.eg', channels: ['email'] })).body.error).toBe('seat_taken');
    expect((await api.post(`${v()}/events/${eventId}/invites`, { zoneId: vip.id, firstName: 'No seat', email: 'n@bank.eg', channels: ['email'] })).body.error).toBe('seat_needed');
    const free = await api.post(`${v()}/events/${eventId}/invites`, { zoneId: hall.id, qty: 2, firstName: 'Mai', email: 'mai@bank.eg', channels: ['email'] });
    expect(free.body).toMatchObject({ tickets: 2, place: 'Hall · Free seating' });
  });

  it('invites a list: assigned seats go row by row, all or nothing', async () => {
    const list = [{ firstName: 'A', email: 'a@bank.eg' }, { firstName: 'B', phone: '01011111111' }, { firstName: 'C', email: 'c@bank.eg' }];
    const r = await api.post(`${v()}/events/${eventId}/invites/bulk`, { zoneId: vip.id, people: list });
    expect(r.status).toBe(201);
    // B-2 is taken already, so A-1, A-2, B-1.
    expect(r.body.places).toEqual(['VIP · Row A, Seat 1', 'VIP · Row A, Seat 2', 'VIP · Row B, Seat 1']);
    const tooMany = await api.post(`${v()}/events/${eventId}/invites/bulk`, { zoneId: hall.id, people: [1, 2, 3, 4, 5].map((i) => ({ firstName: 'P' + i, email: `p${i}@bank.eg` })) });
    expect(tooMany.status).toBe(409);
    const fits = await api.post(`${v()}/events/${eventId}/invites/bulk`, { zoneId: hall.id, people: [1, 2, 3, 4].map((i) => ({ firstName: 'P' + i, email: `p${i}@bank.eg` })) });
    expect(fits.body.invited).toBe(4);
    expect((await api.get(`${v()}/events/${eventId}`)).body.zones.find((z: any) => z.id === hall.id).left).toBe(0);
  });

  it('a free-seating pass shows the section and carries the map', async () => {
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.zoneId, hall.id));
    const pass = await api.get(`/api/public/pass/${t.qrToken}`);
    expect(pass.body).toMatchObject({ type: 'ticket', zoneKind: 'seated', seat: null, ticketType: 'Hall' });
    expect(pass.body.map.zoneId).toBe(hall.id);
  });
});

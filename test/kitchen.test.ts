import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { pool } from '../src/db/index.js';
import { freshApp, client } from './helpers.js';

let app: FastifyInstance;
let api: ReturnType<typeof client>;
let venueId: string;
let owner = '';
const v = () => `/api/venues/${venueId}`;

beforeAll(async () => {
  app = await freshApp();
  api = client(app);
  await api.login('admin@xtra.eg', 'admin1234');
  const r = await api.post('/api/admin/venues', { name: 'Kitchen Test', owner: { name: 'Owner', email: 'owner@k.eg', password: 'password1' } });
  venueId = r.body.venue.id;
  owner = (await api.login('owner@k.eg', 'password1')).body.token;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('kitchen and bar tickets', () => {
  let burger = '', mojito = '', tabId = '';

  it('menu items have a station and extras', async () => {
    const b = await api.post(`${v()}/menu`, {
      category: 'Food', name: 'Burger', price: 30000, station: 'kitchen',
      options: [
        { name: 'Cooking', required: true, multi: false, choices: [{ name: 'Medium' }, { name: 'Well done' }] },
        { name: 'Extras', multi: true, choices: [{ name: 'Cheese', price: 2500 }, { name: 'Bacon', price: 4000 }] },
      ],
    });
    expect(b.status).toBe(201);
    expect(b.body.station).toBe('kitchen');
    burger = b.body.id;
    mojito = (await api.post(`${v()}/menu`, { category: 'Drinks', name: 'Mojito', price: 32000 })).body.id;
    expect((await api.post(`${v()}/menu`, { category: 'Food', name: 'X', price: 1, station: 'grill' })).status).toBe(400);
  });

  it('checks the extras and adds their price', async () => {
    tabId = (await api.post(`${v()}/tabs`, { guestName: 'Walk-in', partySize: 2 })).body.id;
    const miss = await api.post(`${v()}/tabs/${tabId}/items`, { items: [{ menuItemId: burger, qty: 1 }] });
    expect(miss.status).toBe(400);
    expect(miss.body.code ?? miss.body.error).toBeTruthy();
    const two = await api.post(`${v()}/tabs/${tabId}/items`, { items: [{ menuItemId: burger, qty: 1, options: [{ group: 'Cooking', name: 'Medium' }, { group: 'Cooking', name: 'Well done' }] }] });
    expect(two.status).toBe(400);
    const ok = await api.post(`${v()}/tabs/${tabId}/items`, { items: [
      { menuItemId: burger, qty: 2, note: 'No onions', options: [{ group: 'Cooking', name: 'Medium' }, { group: 'Extras', name: 'Cheese' }, { group: 'Extras', name: 'Bacon' }] },
      { menuItemId: mojito, qty: 1 },
    ] });
    expect(ok.status).toBe(200);
    const line = ok.body.items.find((i: any) => i.menuItemId === burger);
    expect(line.unitPrice).toBe(36500);
    expect(line.options.map((o: any) => o.name)).toEqual(['Medium', 'Cheese', 'Bacon']);
    expect(ok.body.bill.subtotal).toBe(2 * 36500 + 32000);
  });

  it('one send makes one ticket number, split by station', async () => {
    const s = await api.post(`${v()}/tabs/${tabId}/send`);
    expect(s.body).toMatchObject({ sent: 2, ticketNo: 1 });
    const k = await api.get(`${v()}/kitchen?station=kitchen`);
    expect(k.body.open).toHaveLength(1);
    expect(k.body.open[0]).toMatchObject({ ticketNo: 1, station: 'kitchen', guest: 'Walk-in', waiter: 'Owner' });
    expect(k.body.open[0].items[0]).toMatchObject({ name: 'Burger', qty: 2, note: 'No onions' });
    const all = await api.get(`${v()}/kitchen`);
    expect(all.body.open.map((t: any) => t.station).sort()).toEqual(['bar', 'kitchen']);

    await api.post(`${v()}/tabs/${tabId}/items`, { items: [{ menuItemId: mojito, qty: 1 }] });
    expect((await api.post(`${v()}/tabs/${tabId}/send`)).body.ticketNo).toBe(2);
  });

  it('ready moves a ticket to done, and it can come back', async () => {
    expect((await api.post(`${v()}/kitchen/1/ready`, { station: 'kitchen' })).status).toBe(200);
    let k = await api.get(`${v()}/kitchen?station=kitchen`);
    expect(k.body.open).toHaveLength(0);
    expect(k.body.done[0].ticketNo).toBe(1);
    const tab = await api.get(`${v()}/tabs/${tabId}`);
    expect(tab.body.items.find((i: any) => i.menuItemId === burger).status).toBe('served');
    expect((await api.post(`${v()}/kitchen/1/ready`, { station: 'kitchen' })).status).toBe(404);
    await api.post(`${v()}/kitchen/1/ready`, { station: 'kitchen', ready: false });
    k = await api.get(`${v()}/kitchen?station=kitchen`);
    expect(k.body.open).toHaveLength(1);
  });

  it('only roles with the Kitchen screen open it', async () => {
    await api.post(`${v()}/staff`, { name: 'Waiter', email: 'w@k.eg', password: 'password1', role: 'waiter' });
    // Every new venue gets a ready-made Kitchen role.
    const role = (await api.get(`${v()}/roles`)).body.roles.find((r: any) => r.name === 'Kitchen');
    expect(role.permissions).toEqual(['kitchen']);
    await api.post(`${v()}/staff`, { name: 'Chef', email: 'chef@k.eg', password: 'password1', roleId: role.id });
    await api.login('w@k.eg', 'password1');
    expect((await api.get(`${v()}/kitchen`)).status).toBe(403);
    await api.login('chef@k.eg', 'password1');
    expect((await api.get(`${v()}/kitchen`)).status).toBe(200);
    expect((await api.get(`${v()}/tabs`)).status).toBe(403);
    api.setToken(owner);
  });
});

describe('split bills and end of night', () => {
  let tab = '', mojito = '';
  it('takes a bill in parts, closes it when paid in full', async () => {
    mojito = (await api.get(`${v()}/menu`)).body.find((m: any) => m.name === 'Mojito').id;
    tab = (await api.post(`${v()}/tabs`, { guestName: 'Friends', partySize: 3 })).body.id;
    const t = await api.post(`${v()}/tabs/${tab}/items`, { items: [{ menuItemId: mojito, qty: 3 }] });
    // 960 + 12% service 115.20 + 14% VAT 150.53 = 1,225.73
    expect(t.body.bill).toMatchObject({ total: 122573, paid: 0, remaining: 122573 });
    const p1 = await api.post(`${v()}/tabs/${tab}/payments`, { method: 'cash', amount: 40858, label: 'Omar' });
    expect(p1.body).toMatchObject({ status: 'open' });
    expect(p1.body.bill.remaining).toBe(81715);
    expect((await api.post(`${v()}/tabs/${tab}/payments`, { method: 'card', amount: 90000 })).status).toBe(400);
    await api.post(`${v()}/tabs/${tab}/payments`, { method: 'card', amount: 40858 });
    const last = await api.post(`${v()}/tabs/${tab}/payments`, { method: 'instapay', amount: 40857 });
    expect(last.body).toMatchObject({ status: 'paid', payMethod: 'mixed' });
    expect(last.body.payments).toHaveLength(3);
    expect((await api.post(`${v()}/tabs/${tab}/payments`, { method: 'cash', amount: 1 })).status).toBe(409);
  });

  it('paying the rest in one go records the rest only', async () => {
    const t2 = (await api.post(`${v()}/tabs`, { guestName: 'Pair' })).body.id;
    await api.post(`${v()}/tabs/${t2}/items`, { items: [{ menuItemId: mojito, qty: 1 }] });
    await api.post(`${v()}/tabs/${t2}/payments`, { method: 'card', amount: 10000 });
    const paid = await api.post(`${v()}/tabs/${t2}/pay`, { method: 'cash' });
    expect(paid.body.status).toBe('paid');
    const full = await api.get(`${v()}/tabs/${t2}`);
    expect(full.body.payments.map((p: any) => [p.method, p.amount])).toEqual([['card', 10000], ['cash', full.body.bill.total - 10000]]);
  });

  it('end of night adds up by method and saves the cash count', async () => {
    const s = await api.get(`${v()}/shift`);
    expect(s.status).toBe(200);
    expect(s.body.byMethod.instapay).toBe(40857);
    expect(s.body.byMethod.card).toBe(50858);
    expect(s.body.bills).toBe(2);
    expect(s.body.open.length).toBeGreaterThan(0); // the kitchen test bill is still open
    const cash = s.body.byMethod.cash;
    const c = await api.post(`${v()}/shift/close`, { countedCash: cash - 5000, note: 'Short 50' });
    expect(c.status).toBe(201);
    expect(c.body.cashDifference).toBe(-5000);
    expect((await api.get(`${v()}/shift/history`)).body[0]).toMatchObject({ countedCash: cash - 5000, cashDifference: -5000, closedByName: 'Owner' });
    await api.login('w@k.eg', 'password1');
    expect((await api.get(`${v()}/shift`)).status).toBe(403);
    api.setToken(owner);
  });
});

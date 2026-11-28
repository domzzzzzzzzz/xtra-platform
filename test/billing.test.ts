import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/index.js';
import { nightOf } from '../src/lib/dates.js';
import { runSaasInvoices } from '../src/modules/billing.js';
import { freshApp, client } from './helpers.js';

let app: FastifyInstance;
let api: ReturnType<typeof client>;
let venueId = '', admin = '', owner = '';

beforeAll(async () => {
  app = await freshApp();
  api = client(app);
  admin = (await api.login('admin@xtra.eg', 'admin1234')).body.token;
  venueId = (await api.post('/api/admin/venues', { name: 'Paying Venue', owner: { name: 'Owner Person', email: 'o@b.eg', password: 'password1' } })).body.venue.id;
  owner = (await api.login('o@b.eg', 'password1')).body.token;
  api.setToken(admin);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('XTRA billing and venue settlement', () => {
  let invoiceId = '';
  it('new venues start on a free trial; no invoice without a price', async () => {
    expect((await api.post(`/api/admin/venues/${venueId}/invoices`, {})).body.error).toBe('no_price');
    expect(await runSaasInvoices()).toBe(0);
  });

  it('bills an active plan once a month with 14% VAT and emails the owner', async () => {
    expect((await api.put(`/api/admin/venues/${venueId}/plan`, { price: 500000, status: 'active' })).status).toBe(200);
    expect(await runSaasInvoices()).toBe(1);
    expect(await runSaasInvoices()).toBe(0);
    const [inv] = await db.select().from(schema.saasInvoices).where(eq(schema.saasInvoices.venueId, venueId));
    expect(inv).toMatchObject({ amount: 500000, vat: 70000, total: 570000, status: 'unpaid', period: nightOf().slice(0, 7) });
    expect(inv.number).toMatch(/^XTRA-\d{6}-001$/);
    invoiceId = inv.id;
    const mail = await db.select().from(schema.messages).where(eq(schema.messages.kind, `saas_invoice:${inv.id}`));
    expect(mail.map((m) => m.to)).toEqual(['o@b.eg']);
    const sum = await api.get('/api/admin/billing');
    expect(sum.body.mrr).toBe(500000);
    expect(sum.body.unpaid).toBe(570000);
  });

  it('the owner pays online; staff cannot see billing', async () => {
    api.setToken(owner);
    const pay = await api.post(`/api/venues/${venueId}/billing/invoices/${invoiceId}/pay`);
    expect(pay.body.checkoutUrl).toContain('/dev/pay/');
    await app.inject({ method: 'POST', url: `/dev/pay/${pay.body.paymentId}`, payload: { result: 'paid' } });
    const view = await api.get(`/api/venues/${venueId}/billing`);
    expect(view.body.invoices[0]).toMatchObject({ status: 'paid', method: 'paymob' });
    await api.post(`/api/venues/${venueId}/staff`, { name: 'Mgr', email: 'm@b.eg', password: 'password1', role: 'manager' });
    await api.login('m@b.eg', 'password1');
    expect((await api.get(`/api/venues/${venueId}/billing`)).status).toBe(403);
    api.setToken(admin);
  });

  it('settlement: guests\' online money for the venue, minus refunds, minus payouts; fees stay XTRA\'s', async () => {
    const now = new Date();
    const [p1] = await db.insert(schema.payments).values({ venueId, purpose: 'deposit', refId: crypto.randomUUID(), amount: 100000, provider: 'paymob', status: 'paid', paidAt: now }).returning();
    await db.insert(schema.payments).values({ venueId, purpose: 'tab', refId: crypto.randomUUID(), amount: 250000, provider: 'paymob', status: 'paid', paidAt: now });
    await db.insert(schema.refunds).values({ venueId, purpose: 'deposit', refId: p1.refId, paymentId: p1.id, amount: 100000, venueAmount: 100000, method: 'paymob' });
    const v1 = await api.get(`/api/admin/venues/${venueId}/billing`);
    expect(v1.body.settlement).toMatchObject({ deposits: 100000, bills: 250000, tickets: 0, refunds: 100000, owed: 250000 });
    expect(v1.body.balance).toBe(250000);
    await api.post(`/api/admin/venues/${venueId}/payouts`, { amount: 200000, reference: 'CIB 1234' });
    const v2 = await api.get(`/api/admin/venues/${venueId}/billing`);
    expect(v2.body).toMatchObject({ paidOut: 200000, balance: 50000 });
    expect(v2.body.payouts[0].reference).toBe('CIB 1234');
  });

  it('only XTRA admins change plans or record payouts', async () => {
    api.setToken(owner);
    expect((await api.put(`/api/admin/venues/${venueId}/plan`, { price: 0, status: 'active' })).status).toBe(403);
    expect((await api.post(`/api/admin/venues/${venueId}/payouts`, { amount: 1 })).status).toBe(403);
  });
});

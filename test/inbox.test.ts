import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../src/db/index.js';
import { config } from '../src/config.js';
import { send } from '../src/integrations/notify.js';
import { renderEmail } from '../src/integrations/email-html.js';
import * as M from '../src/modules/guest-messages.js';
import { client, freshApp } from './helpers.js';

let app: FastifyInstance;
let api: ReturnType<typeof client>;
let venueId: string;
const v = () => `/api/venues/${venueId}`;
const PHONE = '+201001112233';

const hook = (body: unknown, secret = 'app-secret') => {
  const raw = JSON.stringify(body);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload: raw, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig } });
};
const wrap = (value: object, phoneNumberId = 'PNID-OURS') => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, ...value } }] }] });

beforeAll(async () => {
  config.whatsapp.verifyToken = 'verify-me';
  config.whatsapp.appSecret = 'app-secret';
  config.whatsapp.phoneNumberId = 'PNID-OURS';
  app = await freshApp();
  api = client(app);
  await api.login('admin@xtra.eg', 'admin1234');
  const r = await api.post('/api/admin/venues', { name: 'Lumen Rooftop', owner: { name: 'Owner', email: 'owner@lumen.eg', password: 'password1' } });
  venueId = r.body.venue.id;
  await db.insert(schema.guests).values({ phone: PHONE, firstName: 'Nour', lastName: 'Hassan', referralCode: 'NOUR01', whatsappOptIn: true });
  await api.login('owner@lumen.eg', 'password1');
});
afterAll(async () => { config.whatsapp.verifyToken = ''; config.whatsapp.appSecret = ''; config.whatsapp.phoneNumberId = ''; await app.close(); });

describe('WhatsApp webhook and inbox', () => {
  it('answers Meta\'s verify call only with the right word', async () => {
    const ok = await app.inject({ url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345' });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe('12345');
    expect((await app.inject({ url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1' })).statusCode).toBe(403);
  });

  it('rejects calls that are not signed by Meta', async () => {
    expect((await hook(wrap({ messages: [] }), 'wrong')).statusCode).toBe(401);
  });

  it('ignores events for the other numbers on the same WhatsApp account', async () => {
    await hook(wrap({ messages: [{ id: 'wamid.OTHER1', from: '201001112299', timestamp: '1764190000', type: 'text', text: { body: 'hello other brand' } }] }, 'PNID-SOMEONE-ELSE'));
    const rows = await db.select().from(schema.messages).where(eq(schema.messages.providerId, 'wamid.OTHER1'));
    expect(rows).toHaveLength(0);
  });

  it('marks our messages delivered, then read, never back', async () => {
    const [m] = await db.insert(schema.messages).values({ venueId, channel: 'whatsapp', to: PHONE, kind: 'booking_accepted', body: 'Hi Nour', status: 'sent', providerId: 'wamid.OUT1' }).returning();
    await hook(wrap({ statuses: [{ id: 'wamid.OUT1', status: 'read', timestamp: '1764190000' }] }));
    await hook(wrap({ statuses: [{ id: 'wamid.OUT1', status: 'delivered', timestamp: '1764189990' }] }));
    const [after] = await db.select().from(schema.messages).where(eq(schema.messages.id, m.id));
    expect(after.status).toBe('read');
    expect(after.readAt).toBeTruthy();
    expect(after.deliveredAt).toBeTruthy();
  });

  it('a guest reply lands in the venue that wrote to them, and staff can answer', async () => {
    const r = await hook(wrap({ contacts: [{ wa_id: '201001112233', profile: { name: 'Nour H' } }], messages: [{ from: '201001112233', id: 'wamid.IN1', type: 'text', text: { body: 'Can we come at 11 instead?' } }] }));
    expect(r.statusCode).toBe(200);
    await hook(wrap({ messages: [{ from: '201001112233', id: 'wamid.IN1', type: 'text', text: { body: 'Can we come at 11 instead?' } }] })); // Meta retries: no duplicate

    const list = await api.get(`${v()}/inbox`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ phone: PHONE, name: 'Nour Hassan', unread: 1, open: true, lastFromGuest: true });

    const t = await api.get(`${v()}/inbox/${encodeURIComponent(PHONE)}`);
    expect(t.body.messages.map((m: any) => m.direction)).toEqual(['out', 'in']);
    expect((await api.get(`${v()}/inbox`)).body[0].unread).toBe(0);

    const reply = await api.post(`${v()}/inbox/${encodeURIComponent(PHONE)}`, { text: 'Of course, see you at 11.' });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ direction: 'out', status: 'logged' });
  });

  it('after 24 hours the chat is closed for free text', async () => {
    await db.update(schema.messages).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(schema.messages.providerId, 'wamid.IN1'));
    const r = await api.post(`${v()}/inbox/${encodeURIComponent(PHONE)}`, { text: 'Hello?' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('window_closed');
  });

  it('STOP turns off WhatsApp offers', async () => {
    await hook(wrap({ messages: [{ from: '201001112233', id: 'wamid.IN2', type: 'text', text: { body: 'STOP' } }] }));
    const [g] = await db.select().from(schema.guests).where(eq(schema.guests.phone, PHONE));
    expect(g.whatsappOptIn).toBe(false);
  });

  it('the message log shows failures and can send them again', async () => {
    const [m] = await db.insert(schema.messages).values({ venueId, channel: 'email', to: 'nour@example.com', kind: 'booking_pass', subject: 'Your pass', body: 'x', status: 'failed', error: 'Mailbox full', payload: { html: '<p>x</p>' } }).returning();
    const log = await api.get(`${v()}/messages?status=failed`);
    expect(log.body.map((x: any) => x.id)).toContain(m.id);
    const again = await api.post(`${v()}/messages/${m.id}/resend`);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('logged');
  });

  it('door staff cannot read the inbox', async () => {
    await api.post(`${v()}/staff`, { name: 'Door', email: 'door@lumen.eg', password: 'password1', role: 'door' });
    await api.login('door@lumen.eg', 'password1');
    expect((await api.get(`${v()}/inbox`)).status).toBe(403);
    await api.login('owner@lumen.eg', 'password1');
  });
});

describe('Guest emails', () => {
  const venue = { id: 'v1', name: 'Lumen Rooftop', slug: 'lumen', logoUrl: '/media/6f1b6a3e-1b52-4a37-9d7e-0f7c8d0c1a11', address: 'New Cairo', mapUrl: 'https://maps.app.goo.gl/abc', email: 'hello@lumen.eg', settings: { color: '#2e3192' } };
  const res = { code: 'AB12CD', date: '2026-12-05', slotLabel: '22:00 to 23:30', partySize: 4, depositAmount: 100000, depositPaidAt: null };

  it('a booking email is branded, with the details, the button and the venue as sender', async () => {
    const m = M.depositDue(venue, { firstName: 'Nour' }, res);
    expect(m.subject).toBe('Pay your deposit to confirm · Lumen Rooftop · Sat 5 Dec');
    expect(m.wa).toEqual({ name: 'xtra_booking_deposit', header: 'Lumen Rooftop', params: ['Nour', 'Sat 5 Dec', 'EGP 1,000'], button: 'b/AB12CD' });
    const parts = M.emailParts(venue, m.mail.doc);
    expect(parts.fromName).toBe('Lumen Rooftop via XTRA');
    expect(parts.replyTo).toBe('hello@lumen.eg');
    expect(parts.html).toContain('http://test.local/media/6f1b6a3e-1b52-4a37-9d7e-0f7c8d0c1a11');
    expect(parts.html).toContain('background:#2e3192');
    expect(parts.html).toContain('Pay EGP 1,000');
    expect(parts.html).toContain('href="http://test.local/b/AB12CD"');
    expect(parts.body).toContain('Time: 10:00 PM');
  });

  it('a confirmed booking is one message: the booking, the pass QR and the deposit receipt', () => {
    const m = M.bookingConfirmed(venue, { firstName: 'Nour' }, { ...res, depositPaidAt: new Date() }, { name: 'Nour Fahmy', qrToken: 'tok123' });
    expect(m.wa).toEqual({ name: 'xtra_booking_pass', header: 'Lumen Rooftop', params: ['Nour', 'Sat 5 Dec', '10:00 PM'], button: 'p/tok123' });
    const parts = M.emailParts(venue, m.mail.doc);
    expect(parts.html).toContain('tok123');
    expect(parts.html).toContain('EGP 1,000');
    const d = M.bookingCancelled(venue, { firstName: 'Nour' }, res, { declined: true, reason: 'We are closed for a private party.' });
    expect(d.wa?.name).toBe('xtra_booking_cancelled');
    expect(d.wa?.params[2]).toBe('Lumen Rooftop cannot take your booking on this night. We are closed for a private party. No payment was taken.');
  });

  it('offers carry an unsubscribe link that works', async () => {
    const [g] = await db.select().from(schema.guests).where(eq(schema.guests.phone, PHONE));
    await db.update(schema.guests).set({ emailOptIn: true }).where(eq(schema.guests.id, g.id));
    const m = M.winback(venue, { id: g.id, firstName: 'Nour' });
    const html = M.emailParts(venue, m.mail.doc).html;
    const url = /href="(http:\/\/test\.local\/unsubscribe[^"]+)"/.exec(html)![1].replace(/&amp;/g, '&');
    const r = await app.inject({ url: url.replace('http://test.local', '') });
    expect(r.body).toContain('You are unsubscribed');
    const [after] = await db.select().from(schema.guests).where(eq(schema.guests.id, g.id));
    expect(after.emailOptIn).toBe(false);
    expect((await app.inject({ url: `/unsubscribe?g=${g.id}&s=AAAAAAAAAAAAAAAAAAAAAA` })).body).toContain('does not work');
  });

  it('a ticket order email lists every ticket with its QR and the receipt', () => {
    const m = M.ticketOrderEmail(venue, { code: 'T-9K2', subtotal: 200000, discount: 20000, fee: 9000, feeVat: 1260, total: 190260 }, 'Afro Night', 'Fri 5 Dec, 10:00 pm',
      [{ name: 'Nour Hassan', type: 'VIP', qrToken: 'TOKEN_aaaaaaaaaa' }, { name: 'Omar Ali', type: 'VIP', qrToken: 'TOKEN_bbbbbbbbbb' }], 'Nour');
    const html = renderEmail({ ...m.mail.doc, venue });
    expect(m.subject).toBe('Your 2 tickets · Afro Night · Fri 5 Dec, 10:00 pm');
    expect(html.match(/\/api\/public\/qr\//g)).toHaveLength(2);
    expect(html).toContain('Total paid');
    expect(html).toContain('EGP 1,902.60');
  });

  it('records the email HTML so it can be sent again', async () => {
    const row = await send({ channel: 'email', to: 'a@b.eg', kind: 'x', subject: 's', body: 'b', html: '<p>hi</p>', fromName: 'Lumen via XTRA' });
    expect(row).toBe(true);
  });
});

describe('pointing our number at the webhook', () => {
  it('needs the verify token before it calls Meta', async () => {
    const a = client(app);
    await a.login('admin@xtra.eg', 'admin1234');
    const { token, phoneNumberId, verifyToken } = config.whatsapp;
    Object.assign(config.whatsapp, { token: 'x', phoneNumberId: 'PN', verifyToken: '' });
    try {
      const r = await a.post('/api/admin/whatsapp-webhook', {});
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).toContain('WHATSAPP_VERIFY_TOKEN');
    } finally {
      Object.assign(config.whatsapp, { token, phoneNumberId, verifyToken });
    }
  });
});

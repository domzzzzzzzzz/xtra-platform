import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { send } from '../src/integrations/notify.js';
import { client, freshApp } from './helpers.js';

const mail = vi.hoisted(() => ({ opts: null as any, sent: [] as any[] }));
vi.mock('nodemailer', () => ({
  default: { createTransport: (opts: any) => { mail.opts = opts; return { sendMail: async (m: any) => { mail.sent.push(m); return { messageId: '<m1@test>' }; } }; } },
}));

let app: Awaited<ReturnType<typeof freshApp>>;
beforeAll(async () => { app = await freshApp(); });
afterAll(async () => { config.smtp.password = ''; config.whatsapp.token = ''; config.whatsapp.phoneNumberId = ''; vi.unstubAllGlobals(); await app.close(); });

describe('WhatsApp templates', () => {
  it('sends the approved template with body values and the link button', async () => {
    config.whatsapp.token = 'tok'; config.whatsapp.phoneNumberId = '123';
    const calls: { url: string; body: any }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 });
    });
    expect(await send({
      channel: 'whatsapp', to: '+201001234567', kind: 'booking_received', body: 'fallback text',
      whatsappTemplate: { name: 'xtra_booking_received', params: ['Nour', 'Lumen', 'Fri 5 Dec', ''], button: 'b/AB12CD' },
    })).toBe(true);
    expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect(calls[0].body).toEqual({
      messaging_product: 'whatsapp', to: '201001234567', type: 'template',
      template: {
        name: 'xtra_booking_received', language: { code: 'en' },
        components: [
          { type: 'body', parameters: ['Nour', 'Lumen', 'Fri 5 Dec', '-'].map((text) => ({ type: 'text', text })) },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'b/AB12CD' }] },
        ],
      },
    });
  });

  it('XTRA admins can send a test message (hello_world), and see the error when it fails', async () => {
    const api = client(app);
    await api.login('admin@xtra.eg', 'admin1234');
    let sent: any;
    vi.stubGlobal('fetch', async (_u: string, init: any) => { sent = JSON.parse(init.body); return new Response('{"error":{"message":"bad number"}}', { status: 400 }); });
    const r = await api.post('/api/admin/test-message', { channel: 'whatsapp', to: '+201001234567' });
    expect(r.status).toBe(200);
    expect(sent.template).toEqual({ name: 'hello_world', language: { code: 'en_US' } });
    expect(r.body).toMatchObject({ ok: false, status: 'failed' });
    expect(r.body.error).toContain('bad number');
  });

  it('Email goes by SMTP (Hostinger) when host, username and password are set', async () => {
    Object.assign(config.smtp, { host: 'smtp.hostinger.com', port: 465, user: 'info@xtratickets.com', password: 'pw', from: 'no-reply@xtratickets.com', ssl: true, starttls: false });
    vi.stubGlobal('fetch', async () => { throw new Error('Resend must not be called'); });
    expect(await send({ channel: 'email', to: 'nour@example.com', kind: 'test', subject: 'Hi', body: 'Hello' })).toBe(true);
    expect(mail.opts).toMatchObject({ host: 'smtp.hostinger.com', port: 465, secure: true, auth: { user: 'info@xtratickets.com', pass: 'pw' } });
    expect(mail.sent[0]).toMatchObject({ from: '"XTRA" <no-reply@xtratickets.com>', to: 'nour@example.com', subject: 'Hi', text: 'Hello' });
  });
});

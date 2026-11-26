import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { send } from '../src/integrations/notify.js';
import { client, freshApp } from './helpers.js';

let app: Awaited<ReturnType<typeof freshApp>>;
beforeAll(async () => { app = await freshApp(); });
afterAll(async () => { config.whatsapp.token = ''; config.whatsapp.phoneNumberId = ''; vi.unstubAllGlobals(); await app.close(); });

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
});

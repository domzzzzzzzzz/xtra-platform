/**
 * Messages and the WhatsApp inbox.
 *
 * - /webhooks/whatsapp: Meta calls it with delivery receipts (sent, delivered,
 *   read, failed) and with messages guests send to the business number.
 *   Each call is signed with the app secret (X-Hub-Signature-256).
 * - A guest's reply goes to the venue that last wrote to that number.
 * - Staff can answer free text while the chat is open (24 hours after the
 *   guest's last message, Meta's rule). After that only templates go out.
 * - "STOP" from a guest turns off WhatsApp offers for them.
 */
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { parse, venueAccess } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { normalizePhone } from '../lib/codes.js';
import { resend, sendMessage } from '../integrations/notify.js';

const WINDOW_MS = 24 * 3600_000;
const RANK: Record<string, number> = { logged: 0, sent: 1, delivered: 2, read: 3 };

type Status = { id: string; status: string; timestamp?: string; errors?: { title?: string; message?: string; error_data?: { details?: string } }[] };
type Inbound = { from: string; id: string; timestamp?: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } }; image?: { caption?: string }; location?: { name?: string; address?: string } };

/** Readable text for any kind of incoming WhatsApp message. */
function inboundText(m: Inbound) {
  switch (m.type) {
    case 'text': return m.text?.body ?? '';
    case 'button': return m.button?.text ?? '';
    case 'interactive': return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '';
    case 'image': return `[Photo]${m.image?.caption ? ` ${m.image.caption}` : ''}`;
    case 'location': return `[Location] ${[m.location?.name, m.location?.address].filter(Boolean).join(', ')}`.trim();
    default: return `[${m.type[0].toUpperCase()}${m.type.slice(1)}]`;
  }
}

export async function applyStatus(s: Status) {
  const [msg] = await db.select().from(schema.messages).where(eq(schema.messages.providerId, s.id)).limit(1);
  if (!msg) return;
  const at = s.timestamp ? new Date(+s.timestamp * 1000) : new Date();
  if (s.status === 'failed') {
    const e = s.errors?.[0];
    await db.update(schema.messages).set({ status: 'failed', error: [e?.title, e?.error_data?.details ?? e?.message].filter(Boolean).join(': ') || 'Failed' }).where(eq(schema.messages.id, msg.id));
    return;
  }
  if ((RANK[s.status] ?? -1) <= (RANK[msg.status] ?? -1)) return;
  await db.update(schema.messages).set({
    status: s.status,
    ...(s.status === 'delivered' || s.status === 'read' ? { deliveredAt: msg.deliveredAt ?? at } : {}),
    ...(s.status === 'read' ? { readAt: at } : {}),
  }).where(eq(schema.messages.id, msg.id));
}

export async function applyInbound(m: Inbound, name?: string) {
  const phone = normalizePhone(m.from);
  const [dupe] = await db.select({ id: schema.messages.id }).from(schema.messages).where(eq(schema.messages.providerId, m.id)).limit(1);
  if (dupe) return;
  const [last] = await db.select({ venueId: schema.messages.venueId }).from(schema.messages)
    .where(and(eq(schema.messages.to, phone), eq(schema.messages.channel, 'whatsapp'), sql`${schema.messages.venueId} is not null`))
    .orderBy(desc(schema.messages.createdAt)).limit(1);
  const [guest] = await db.select({ id: schema.guests.id }).from(schema.guests).where(eq(schema.guests.phone, phone));
  const body = inboundText(m);
  await db.insert(schema.messages).values({
    venueId: last?.venueId ?? null, guestId: guest?.id ?? null, channel: 'whatsapp', to: phone, kind: 'inbound',
    subject: name ?? null, body, status: 'received', providerId: m.id, direction: 'in',
    createdAt: m.timestamp ? new Date(+m.timestamp * 1000) : new Date(),
  });
  if (guest && /^\s*(stop|unsubscribe|الغاء|إلغاء)\s*$/i.test(body)) {
    await db.update(schema.guests).set({ whatsappOptIn: false }).where(eq(schema.guests.id, guest.id));
  }
}

/** Meta's webhook. Outside /api, like the Paymob one. */
export async function whatsappWebhook(app: FastifyInstance) {
  // The signature is over the exact bytes, so keep the raw body.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.get<{ Querystring: Record<string, string> }>('/webhooks/whatsapp', async (req, reply) => {
    const q = req.query;
    if (q['hub.mode'] === 'subscribe' && config.whatsapp.verifyToken && q['hub.verify_token'] === config.whatsapp.verifyToken) {
      return reply.type('text/plain').send(q['hub.challenge'] ?? '');
    }
    return reply.code(403).send('Forbidden');
  });

  app.post('/webhooks/whatsapp', async (req, reply) => {
    const raw = req.body as Buffer;
    const sig = String(req.headers['x-hub-signature-256'] ?? '');
    if (!config.whatsapp.appSecret) return reply.code(503).send({ error: 'not_configured' });
    const want = 'sha256=' + crypto.createHmac('sha256', config.whatsapp.appSecret).update(raw).digest('hex');
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return reply.code(401).send({ error: 'bad_signature' });
    const data = JSON.parse(raw.toString('utf8')) as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; statuses?: Status[]; messages?: Inbound[]; contacts?: { wa_id: string; profile?: { name?: string } }[] } }[] }[] };
    for (const e of data.entry ?? []) {
      for (const c of e.changes ?? []) {
        const v = c.value ?? {};
        // The WhatsApp account also holds other numbers; only take events for ours.
        if (v.metadata?.phone_number_id !== config.whatsapp.phoneNumberId) continue;
        for (const s of v.statuses ?? []) await applyStatus(s);
        for (const m of v.messages ?? []) await applyInbound(m, v.contacts?.find((x) => x.wa_id === m.from)?.profile?.name);
      }
    }
    return { ok: true };
  });
}

const phoneParam = z.string().regex(/^\+\d{8,15}$/);

export default async function inbox(app: FastifyInstance) {
  type P = { venueId: string };

  /* Every message the venue sent or got, newest first. */
  app.get<{ Params: P; Querystring: { q?: string; status?: string; channel?: string; before?: string } }>('/venues/:venueId/messages', async (req) => {
    await venueAccess(req, req.params.venueId, []);
    const m = schema.messages, q = req.query;
    const conds = [eq(m.venueId, req.params.venueId)];
    if (q.channel === 'whatsapp' || q.channel === 'email') conds.push(eq(m.channel, q.channel));
    if (q.status === 'failed') conds.push(eq(m.status, 'failed'));
    if (q.status === 'in') conds.push(eq(m.direction, 'in'));
    if (q.q) conds.push(or(ilike(m.to, `%${q.q}%`), ilike(m.body, `%${q.q}%`), ilike(schema.guests.firstName, `%${q.q}%`))!);
    if (q.before) conds.push(sql`${m.createdAt} < ${new Date(q.before)}`);
    const rows = await db.select({
      id: m.id, channel: m.channel, to: m.to, kind: m.kind, subject: m.subject, body: m.body, status: m.status, error: m.error,
      direction: m.direction, createdAt: m.createdAt, deliveredAt: m.deliveredAt, readAt: m.readAt,
      guest: sql<string | null>`nullif(trim(${schema.guests.firstName} || ' ' || ${schema.guests.lastName}), '')`,
    }).from(m).leftJoin(schema.guests, eq(schema.guests.id, m.guestId)).where(and(...conds)).orderBy(desc(m.createdAt)).limit(100);
    return rows;
  });

  app.post<{ Params: P & { id: string } }>('/venues/:venueId/messages/:id/resend', async (req) => {
    await venueAccess(req, req.params.venueId, []);
    const [old] = await db.select({ venueId: schema.messages.venueId, direction: schema.messages.direction }).from(schema.messages).where(eq(schema.messages.id, req.params.id));
    if (!old || old.venueId !== req.params.venueId) throw notFound('Message not found');
    if (old.direction !== 'out') throw badRequest('Only messages we sent can be sent again');
    const row = await resend(req.params.id);
    return { id: row!.id, status: row!.status, error: row!.error };
  });

  /* WhatsApp chats: one per guest who wrote to us. */
  app.get<{ Params: P }>('/venues/:venueId/inbox', async (req) => {
    await venueAccess(req, req.params.venueId, []);
    const r = await db.execute(sql`
      with c as (
        select "to" as phone, max(created_at) as last_at,
          max(created_at) filter (where direction = 'in') as last_in,
          count(*) filter (where direction = 'in' and seen_at is null) as unread
        from messages where venue_id = ${req.params.venueId} and channel = 'whatsapp'
        group by "to" having count(*) filter (where direction = 'in') > 0)
      select c.*, nullif(trim(g.first_name || ' ' || g.last_name), '') as name, g.id as guest_id,
        (select body from messages x where x.venue_id = ${req.params.venueId} and x.channel = 'whatsapp' and x."to" = c.phone order by created_at desc limit 1) as last_body,
        (select direction from messages x where x.venue_id = ${req.params.venueId} and x.channel = 'whatsapp' and x."to" = c.phone order by created_at desc limit 1) as last_dir,
        (select subject from messages x where x.venue_id = ${req.params.venueId} and x.direction = 'in' and x."to" = c.phone and x.subject is not null order by created_at desc limit 1) as profile
      from c left join guests g on g.phone = c.phone
      order by c.last_at desc limit 200`);
    const now = Date.now();
    return r.rows.map((x) => ({
      phone: x.phone, name: x.name ?? x.profile ?? null, guestId: x.guest_id ?? null, lastAt: x.last_at, lastBody: x.last_body, lastFromGuest: x.last_dir === 'in',
      unread: Number(x.unread), open: x.last_in ? now - new Date(x.last_in as string).getTime() < WINDOW_MS : false,
    }));
  });

  app.get<{ Params: P & { phone: string } }>('/venues/:venueId/inbox/:phone', async (req) => {
    await venueAccess(req, req.params.venueId, []);
    const phone = parse(phoneParam, req.params.phone);
    const m = schema.messages;
    const where = and(eq(m.venueId, req.params.venueId), eq(m.channel, 'whatsapp'), eq(m.to, phone));
    const rows = await db.select({ id: m.id, body: m.body, kind: m.kind, direction: m.direction, status: m.status, error: m.error, createdAt: m.createdAt, readAt: m.readAt, deliveredAt: m.deliveredAt })
      .from(m).where(where).orderBy(desc(m.createdAt)).limit(200);
    await db.update(m).set({ seenAt: new Date() }).where(and(where, eq(m.direction, 'in'), isNull(m.seenAt)));
    const [g] = await db.select().from(schema.guests).where(eq(schema.guests.phone, phone));
    const lastIn = rows.find((x) => x.direction === 'in');
    return {
      phone, guest: g ? { id: g.id, name: `${g.firstName} ${g.lastName}`.trim(), email: g.email } : null,
      open: lastIn ? Date.now() - lastIn.createdAt.getTime() < WINDOW_MS : false,
      closesAt: lastIn ? new Date(lastIn.createdAt.getTime() + WINDOW_MS) : null,
      messages: rows.reverse(),
    };
  });

  app.post<{ Params: P & { phone: string } }>('/venues/:venueId/inbox/:phone', async (req) => {
    const { user } = await venueAccess(req, req.params.venueId, []);
    const phone = parse(phoneParam, req.params.phone);
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }), req.body);
    const m = schema.messages;
    const [lastIn] = await db.select({ at: m.createdAt, guestId: m.guestId }).from(m)
      .where(and(eq(m.venueId, req.params.venueId), eq(m.channel, 'whatsapp'), eq(m.to, phone), eq(m.direction, 'in')))
      .orderBy(desc(m.createdAt)).limit(1);
    if (!lastIn || Date.now() - lastIn.at.getTime() >= WINDOW_MS) {
      throw conflict('This chat is closed. WhatsApp only allows replies within 24 hours of the guest\'s last message.', 'window_closed');
    }
    const row = await sendMessage({ channel: 'whatsapp', to: phone, kind: 'reply', body: text, venueId: req.params.venueId, guestId: lastIn.guestId, sentBy: user.sub });
    return { id: row.id, body: row.body, kind: row.kind, direction: 'out', status: row.status, error: row.error, createdAt: row.createdAt };
  });
}

/** Turns off offer emails from the link in a marketing email. */
export async function unsubscribePage(app: FastifyInstance) {
  app.get<{ Querystring: { g?: string; s?: string } }>('/unsubscribe', async (req, reply) => {
    const { unsubscribeSig } = await import('./guest-messages.js');
    const g = req.query.g ?? '', s = req.query.s ?? '';
    let ok = false;
    if (z.string().uuid().safeParse(g).success && s.length === 22 && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(unsubscribeSig(g)))) {
      await db.update(schema.guests).set({ emailOptIn: false }).where(eq(schema.guests.id, g));
      ok = true;
    }
    const msg = ok ? ['You are unsubscribed.', 'You will not get offer emails from us any more. Booking and ticket emails still come, so you never miss a confirmation.']
      : ['This link does not work.', 'It may be broken or old. Reply to any of our emails and we will take you off the list.'];
    return reply.type('text/html').header('Cache-Control', 'no-store').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe · XTRA</title>
<style>:root{color-scheme:light dark;--bg:light-dark(#f3f4f8,#0c0e26);--card:light-dark(#fff,#151842);--ink:light-dark(#12153f,#eef1ff);--mute:light-dark(#5b6280,#9aa2cc)}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:20px;box-sizing:border-box}
main{background:var(--card);max-width:440px;padding:32px 28px;border-radius:16px}h1{margin:0 0 8px;font-size:24px;letter-spacing:-.02em}p{margin:0;color:var(--mute)}</style></head>
<body><main><h1>${msg[0]}</h1><p>${msg[1]}</p></main></body></html>`);
  });
}

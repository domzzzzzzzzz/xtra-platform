/**
 * Outgoing WhatsApp + email. Every message is written to the messages table,
 * with what is needed to send it again (template, HTML, sender).
 * With no provider keys set, messages are only logged (status "logged"), so
 * the system works end to end in development.
 */
import { eq } from 'drizzle-orm';
import nodemailer, { type Transporter } from 'nodemailer';
import { db, schema } from '../db/index.js';
import type { MessagePayload } from '../db/schema.js';
import { config } from '../config.js';
import { normalizePhone } from '../lib/codes.js';
import { renderEmail, renderText, type EmailDoc } from './email-html.js';

/**
 * A Meta-approved WhatsApp template. `header` fills the header's {{1}} (the
 * venue name), `params` the body, and `button` the {{1}} at the end of the
 * URL button (the path after the app URL, e.g. "b/AB12CD").
 */
export type WaTemplate = { name: string; params: string[]; button?: string; header?: string; language?: string };

export type Outgoing = {
  channel: 'whatsapp' | 'email';
  to: string;
  kind: string; // booking_received, booking_accepted, tickets, campaign ...
  subject?: string;
  body: string;
  venueId?: string | null;
  guestId?: string | null;
  campaignId?: string | null;
  /** Meta-approved template. Needed for WhatsApp outside the 24h window. */
  whatsappTemplate?: WaTemplate | null;
  /** Email only. */
  html?: string;
  fromName?: string;
  replyTo?: string | null;
  sentBy?: string | null;
};

/** Path for a template's URL button: the link with the app URL taken off. */
export const waPath = (url: string) => url.replace(`${config.publicAppUrl}/`, '');

export const whatsappReady = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);
export const smtpReady = () => Boolean(config.smtp.host && config.smtp.user && config.smtp.password);
export const emailReady = () => smtpReady() || Boolean(config.email.resendKey);

/** Meta wants the full international number without "+" (01xxxxxxxxx becomes 201xxxxxxxxx). */
const waNumber = (to: string) => normalizePhone(to).slice(1);

function templatePayload(t: WaTemplate) {
  const lang = { code: t.language ?? config.whatsapp.language };
  const text = (v: string) => ({ type: 'text', text: v.trim() || '-' });
  const components = [
    ...(t.header != null ? [{ type: 'header', parameters: [text(t.header)] }] : []),
    ...(t.params.length ? [{ type: 'body', parameters: t.params.map(text) }] : []),
    ...(t.button != null ? [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: t.button }] }] : []),
  ];
  return components.length ? { name: t.name, language: lang, components } : { name: t.name, language: lang };
}

async function sendWhatsApp(m: Outgoing): Promise<{ status: string; providerId?: string }> {
  if (!config.whatsapp.token) return { status: 'logged' };
  const to = waNumber(m.to);
  const payload = m.whatsappTemplate
    ? { messaging_product: 'whatsapp', to, type: 'template', template: templatePayload(m.whatsappTemplate) }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: m.body, preview_url: true } };
  const res = await fetch(`https://graph.facebook.com/v21.0/${config.whatsapp.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { messages?: { id: string }[] };
  return { status: 'sent', providerId: data.messages?.[0]?.id };
}

const graph = async (path: string, init?: { method: string; body: unknown }) => {
  const res = await fetch(`https://graph.facebook.com/v21.0/${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${data.error?.message ?? 'request failed'}`);
  return data;
};

/** Where Meta sends events for our number: the number's own override, else the app's or the account's webhook. */
export const whatsappWebhookUrl = () => `${config.publicAppUrl}/webhooks/whatsapp`;
export async function getNumberWebhook() {
  const d = await graph(`${config.whatsapp.phoneNumberId}?fields=display_phone_number,webhook_configuration`);
  return { number: d.display_phone_number as string | undefined, config: (d.webhook_configuration ?? null) as Record<string, string> | null };
}

/**
 * Points only our phone number's events at this system. The Meta app and the
 * WhatsApp account are shared with other brands, so their webhook is left alone.
 * Meta calls GET /webhooks/whatsapp with the verify token before it accepts.
 */
export async function setNumberWebhook() {
  if (!whatsappReady()) throw new Error('WhatsApp is not set up');
  if (!config.whatsapp.verifyToken) throw new Error('Set WHATSAPP_VERIFY_TOKEN first');
  await graph(config.whatsapp.phoneNumberId, { method: 'POST', body: { webhook_configuration: { override_callback_uri: whatsappWebhookUrl(), verify_token: config.whatsapp.verifyToken } } });
  return getNumberWebhook();
}

/** "no-reply@x.com" becomes "<name> <no-reply@x.com>"; a value that has a name keeps it unless a name is given. */
const fromHeader = (v: string, name?: string) => {
  const addr = /<([^>]+)>/.exec(v)?.[1] ?? v.trim();
  const own = /^(.*?)\s*</.exec(v)?.[1]?.replace(/"/g, '').trim();
  const n = (name ?? own ?? 'XTRA').replace(/["<>]/g, '');
  return `"${n}" <${addr}>`;
};

let smtp: Transporter | null = null;
const smtpTransport = () => smtp ??= nodemailer.createTransport({
  host: config.smtp.host, port: config.smtp.port,
  secure: config.smtp.ssl, requireTLS: config.smtp.starttls,
  auth: { user: config.smtp.user, pass: config.smtp.password },
  connectionTimeout: 15_000,
});

async function sendEmail(m: Outgoing): Promise<{ status: string; providerId?: string }> {
  const subject = m.subject ?? 'XTRA';
  const replyTo = m.replyTo || undefined;
  if (smtpReady()) {
    const info = await smtpTransport().sendMail({
      from: fromHeader(config.smtp.from || config.smtp.user, m.fromName), to: m.to, subject, text: m.body, html: m.html, replyTo,
    });
    return { status: 'sent', providerId: info.messageId };
  }
  if (!config.email.resendKey) return { status: 'logged' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromHeader(config.email.from, m.fromName), to: [m.to], subject, text: m.body, html: m.html, reply_to: replyTo }),
  });
  if (!res.ok) throw new Error(`Email ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id?: string };
  return { status: 'sent', providerId: data.id };
}

async function deliver(m: Outgoing) {
  try {
    return { ...(m.channel === 'whatsapp' ? await sendWhatsApp(m) : await sendEmail(m)), error: undefined };
  } catch (e) {
    return { status: 'failed', providerId: undefined, error: (e as Error).message };
  }
}

/** Sends one message and records it. Returns the message row. */
export async function sendMessage(m: Outgoing) {
  if (m.channel === 'whatsapp') m = { ...m, to: normalizePhone(m.to) };
  const r = await deliver(m);
  const payload: MessagePayload = { whatsappTemplate: m.whatsappTemplate ?? null, html: m.html, fromName: m.fromName, replyTo: m.replyTo ?? undefined };
  const [row] = await db.insert(schema.messages).values({
    venueId: m.venueId ?? null, guestId: m.guestId ?? null, campaignId: m.campaignId ?? null,
    channel: m.channel, to: m.to, kind: m.kind, subject: m.subject ?? null, body: m.body,
    status: r.status, providerId: r.providerId ?? null, error: r.error ?? null, payload, sentBy: m.sentBy ?? null,
  }).returning();
  return row;
}

export async function send(m: Outgoing): Promise<boolean> {
  return (await sendMessage(m)).status !== 'failed';
}

/** Sends a recorded outgoing message again, as a new message. */
export async function resend(id: string) {
  const [old] = await db.select().from(schema.messages).where(eq(schema.messages.id, id));
  if (!old || old.direction !== 'out') return null;
  const p = old.payload ?? {};
  return sendMessage({
    channel: old.channel, to: old.to, kind: old.kind, subject: old.subject ?? undefined, body: old.body,
    venueId: old.venueId, guestId: old.guestId, campaignId: old.campaignId,
    whatsappTemplate: p.whatsappTemplate ?? null, html: p.html, fromName: p.fromName, replyTo: p.replyTo,
  });
}

export type VenueLike = {
  id: string; name: string; logoUrl?: string | null; address?: string | null; mapUrl?: string | null;
  phone?: string | null; email?: string | null; settings?: { color?: string } | null;
};

/** The venue's look and contact details for an email. */
export const emailVenue = (v: VenueLike) => ({ name: v.name, logoUrl: v.logoUrl, address: v.address, mapUrl: v.mapUrl, phone: v.phone, color: v.settings?.color });

/** Email fields from a venue and a document: HTML, text, sender name and reply-to. */
export function emailParts(v: VenueLike, doc: Omit<EmailDoc, 'venue'>) {
  const d = { ...doc, venue: emailVenue(v) };
  return { html: renderEmail(d), body: renderText(d), fromName: `${v.name} via XTRA`, replyTo: v.email ?? null };
}

/** Send on the venue's chosen channel(s). Skips a channel the guest has no address for. */
export async function notifyGuest(opts: {
  channel: 'email' | 'whatsapp' | 'both';
  phone?: string | null;
  email?: string | null;
  kind: string;
  subject: string;
  /** WhatsApp text, used when no template is given (and as the log line). */
  body: string;
  venueId?: string;
  guestId?: string;
  /** The approved template for WhatsApp. Business-started chats must use one. */
  wa?: WaTemplate;
  /** The branded email. Without it the email is plain text from `body`. */
  mail?: { venue: VenueLike; doc: Omit<EmailDoc, 'venue'> };
}) {
  const jobs: Promise<boolean>[] = [];
  if ((opts.channel === 'whatsapp' || opts.channel === 'both') && opts.phone) {
    jobs.push(send({ channel: 'whatsapp', to: opts.phone, kind: opts.kind, body: opts.body, venueId: opts.venueId, guestId: opts.guestId, whatsappTemplate: opts.wa ?? null }));
  }
  if ((opts.channel === 'email' || opts.channel === 'both') && opts.email) {
    const parts = opts.mail ? emailParts(opts.mail.venue, opts.mail.doc) : { body: opts.body };
    jobs.push(send({ channel: 'email', to: opts.email, kind: opts.kind, subject: opts.subject, venueId: opts.venueId, guestId: opts.guestId, ...parts }));
  }
  await Promise.all(jobs);
}

/** Fill {first_name}, {venue} ... in a campaign body. Unknown variables are left as they are. */
export const fillTemplate = (body: string, vars: Record<string, string>) =>
  body.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? vars[k] : all));

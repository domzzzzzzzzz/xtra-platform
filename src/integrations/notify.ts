/**
 * Outgoing WhatsApp + email. Every message is written to the messages table.
 * With no provider keys set, messages are only logged (status "logged"), so
 * the system works end to end in development.
 */
import { db, schema } from '../db/index.js';
import { config } from '../config.js';

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
};

/**
 * A Meta-approved WhatsApp template. `button` fills the {{1}} at the end of the
 * template's URL button (the path after the app URL, e.g. "b/AB12CD").
 */
export type WaTemplate = { name: string; params: string[]; button?: string; language?: string };

/** Path for a template's URL button: the link with the app URL taken off. */
export const waPath = (url: string) => url.replace(`${config.publicAppUrl}/`, '');

async function sendWhatsApp(m: Outgoing): Promise<{ status: string; providerId?: string }> {
  if (!config.whatsapp.token) return { status: 'logged' };
  const to = m.to.replace(/^\+/, '');
  const payload = m.whatsappTemplate
    ? {
        messaging_product: 'whatsapp', to, type: 'template',
        template: m.whatsappTemplate.params.length === 0 && m.whatsappTemplate.button == null
          ? { name: m.whatsappTemplate.name, language: { code: m.whatsappTemplate.language ?? config.whatsapp.language } }
          : {
          name: m.whatsappTemplate.name,
          language: { code: m.whatsappTemplate.language ?? config.whatsapp.language },
          components: [
            { type: 'body', parameters: m.whatsappTemplate.params.map((text) => ({ type: 'text', text: text.trim() || '-' })) },
            ...(m.whatsappTemplate.button != null
              ? [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: m.whatsappTemplate.button }] }]
              : []),
          ],
        },
      }
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

async function sendEmail(m: Outgoing): Promise<{ status: string; providerId?: string }> {
  if (!config.email.resendKey) return { status: 'logged' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.email.from, to: [m.to], subject: m.subject ?? 'XTRA', text: m.body }),
  });
  if (!res.ok) throw new Error(`Email ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id?: string };
  return { status: 'sent', providerId: data.id };
}

export async function send(m: Outgoing): Promise<boolean> {
  let status = 'failed';
  let providerId: string | undefined;
  let error: string | undefined;
  try {
    const r = m.channel === 'whatsapp' ? await sendWhatsApp(m) : await sendEmail(m);
    status = r.status;
    providerId = r.providerId;
  } catch (e) {
    error = (e as Error).message;
  }
  await db.insert(schema.messages).values({
    venueId: m.venueId ?? null, guestId: m.guestId ?? null, campaignId: m.campaignId ?? null,
    channel: m.channel, to: m.to, kind: m.kind, subject: m.subject ?? null, body: m.body,
    status, providerId: providerId ?? null, error: error ?? null,
  });
  return status !== 'failed';
}

/** Send on the venue's chosen channel(s). Skips a channel the guest has no address for. */
export async function notifyGuest(opts: {
  channel: 'email' | 'whatsapp' | 'both';
  phone?: string | null;
  email?: string | null;
  kind: string;
  subject: string;
  body: string;
  venueId?: string;
  guestId?: string;
  /** The approved template for WhatsApp. Business-started chats must use one. */
  wa?: WaTemplate;
}) {
  const jobs: Promise<boolean>[] = [];
  if ((opts.channel === 'whatsapp' || opts.channel === 'both') && opts.phone) {
    jobs.push(send({ channel: 'whatsapp', to: opts.phone, kind: opts.kind, body: opts.body, venueId: opts.venueId, guestId: opts.guestId, whatsappTemplate: opts.wa ?? null }));
  }
  if ((opts.channel === 'email' || opts.channel === 'both') && opts.email) {
    jobs.push(send({ channel: 'email', to: opts.email, kind: opts.kind, subject: opts.subject, body: opts.body, venueId: opts.venueId, guestId: opts.guestId }));
  }
  await Promise.all(jobs);
}

/** Fill {first_name}, {venue} ... in a campaign body. Unknown variables are left as they are. */
export const fillTemplate = (body: string, vars: Record<string, string>) =>
  body.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? vars[k] : all));

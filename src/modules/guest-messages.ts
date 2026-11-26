/**
 * Every message a guest gets, in one place: the WhatsApp template (with its
 * values) and the branded email for each moment of a booking or ticket.
 * The template names and texts match docs/whatsapp-templates.md.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { prettyDate } from '../lib/dates.js';
import { egp } from '../lib/http.js';
import { emailParts, type VenueLike, type WaTemplate } from '../integrations/notify.js';
import type { EmailDoc } from '../integrations/email-html.js';

type Res = { code: string; date: string; slotLabel: string; partySize: number; depositAmount: number; depositPaidAt?: Date | null; minSpend?: number };
type Person = { id?: string; firstName: string };
type Doc = Omit<EmailDoc, 'venue'>;
export type GuestMessage = { kind: string; subject: string; body: string; wa?: WaTemplate; mail: { venue: VenueLike; doc: Doc } };

const app = () => config.publicAppUrl;
const statusPath = (code: string) => `b/${code}`;
const bookPath = (slug: string) => `book/${slug}`;

/** "22:00 to 23:30" → "10:00 PM". */
export function prettyTime(slotLabel: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(slotLabel);
  if (!m) return slotLabel;
  const h = +m[1] % 24;
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
const guests = (n: number) => `${n} ${n === 1 ? 'guest' : 'guests'}`;

function bookingRows(r: Res, extra: [string, string][] = []): [string, string][] {
  return [['Date', prettyDate(r.date)], ['Time', prettyTime(r.slotLabel)], ['Guests', String(r.partySize)], ...extra, ['Booking code', r.code]];
}

/** Signed link that turns off offer emails for one guest. */
export const unsubscribeSig = (guestId: string) => crypto.createHmac('sha256', config.jwtSecret).update(`unsub:${guestId}`).digest('base64url').slice(0, 22);
export const unsubscribeUrl = (guestId: string) => `${app()}/unsubscribe?g=${guestId}&s=${unsubscribeSig(guestId)}`;

export function bookingReceived(v: VenueLike, g: Person, r: Res): GuestMessage {
  const date = prettyDate(r.date), time = prettyTime(r.slotLabel);
  return {
    kind: 'booking_received', subject: `Booking request received · ${v.name} · ${date}`,
    body: `Hi ${g.firstName}, we received your booking request at ${v.name} for ${date} at ${time}, ${guests(r.partySize)}. We will confirm it shortly. Track it: ${app()}/${statusPath(r.code)}`,
    wa: { name: 'xtra_booking_received', header: v.name, params: [g.firstName, date, time, String(r.partySize)], button: statusPath(r.code) },
    mail: { venue: v, doc: {
      preheader: `We will confirm your table for ${date} shortly.`, title: `We got your request, ${g.firstName}.`,
      intro: `${v.name} is reviewing your booking. We will message you as soon as it is confirmed.`,
      rows: bookingRows(r), button: { label: 'Track my booking', url: `${app()}/${statusPath(r.code)}` },
    } },
  };
}

export function bookingAccepted(v: VenueLike, g: Person, r: Res): GuestMessage {
  const date = prettyDate(r.date), time = prettyTime(r.slotLabel);
  if (r.depositAmount > 0 && !r.depositPaidAt) {
    const dep = egp(r.depositAmount);
    return {
      kind: 'booking_accepted', subject: `Pay your deposit to confirm · ${v.name} · ${date}`,
      body: `Hi ${g.firstName}, ${v.name} accepted your booking for ${date}. Pay the ${dep} deposit to confirm your table. It comes off your bill on the night: ${app()}/${statusPath(r.code)}`,
      wa: { name: 'xtra_booking_deposit', header: v.name, params: [g.firstName, date, dep], button: statusPath(r.code) },
      mail: { venue: v, doc: {
        preheader: `Pay ${dep} to confirm your table for ${date}.`, title: 'Your table is waiting.',
        intro: `Good news, ${g.firstName}. ${v.name} accepted your booking. Pay the deposit to confirm it. The full amount comes off your bill on the night.`,
        rows: bookingRows(r, [['Deposit', dep]]), button: { label: `Pay ${dep}`, url: `${app()}/${statusPath(r.code)}` },
        note: 'Cancel at least 24 hours before your booking and you get the deposit back.',
      } },
    };
  }
  return {
    kind: 'booking_accepted', subject: `Booking confirmed · ${v.name} · ${date}`,
    body: `Hi ${g.firstName}, your booking at ${v.name} is confirmed for ${date} at ${time}, ${guests(r.partySize)}. Please arrive within 30 minutes of your time: ${app()}/${statusPath(r.code)}`,
    wa: { name: 'xtra_booking_accepted', header: v.name, params: [g.firstName, date, time, String(r.partySize)], button: statusPath(r.code) },
    mail: { venue: v, doc: {
      preheader: `${date} at ${time}, ${guests(r.partySize)}.`, title: `You're booked, ${g.firstName}.`,
      intro: 'Please arrive within 30 minutes of your time. Each guest gets their own pass for the door.',
      rows: bookingRows(r), button: { label: 'View my booking', url: `${app()}/${statusPath(r.code)}` },
    } },
  };
}

export function depositPaid(v: VenueLike, g: Person, r: Res): GuestMessage {
  const date = prettyDate(r.date), dep = egp(r.depositAmount);
  return {
    kind: 'deposit_paid', subject: `Deposit received · ${v.name} · ${date}`,
    body: `Hi ${g.firstName}, we received your ${dep} deposit. Your booking at ${v.name} for ${date} is confirmed. Booking code ${r.code}.`,
    wa: { name: 'xtra_deposit_paid', header: v.name, params: [g.firstName, dep, date, r.code], button: statusPath(r.code) },
    mail: { venue: v, doc: {
      preheader: `Your table for ${date} is confirmed.`, title: 'Deposit received. You are confirmed.',
      intro: `Thank you, ${g.firstName}. Your deposit is paid and your table is confirmed. It comes off your bill on the night.`,
      rows: bookingRows(r),
      receipt: [['Deposit', dep], ['Paid', dep]],
      button: { label: 'View my booking', url: `${app()}/${statusPath(r.code)}` },
      note: 'Your guest passes are on their way. Cancel at least 24 hours before your booking and you get the deposit back.',
    } },
  };
}

export function bookingDeclined(v: VenueLike & { slug: string }, g: Person, r: Res, reason?: string | null): GuestMessage {
  const date = prettyDate(r.date);
  return {
    kind: 'booking_declined', subject: `About your booking · ${v.name} · ${date}`,
    body: `Hi ${g.firstName}, we are sorry, ${v.name} cannot take your booking for ${date}.${reason ? ` ${reason}` : ''} We would love to host you another night: ${app()}/${bookPath(v.slug)}`,
    wa: { name: 'xtra_booking_declined', header: v.name, params: [g.firstName, date], button: bookPath(v.slug) },
    mail: { venue: v, doc: {
      preheader: `We could not take your booking for ${date}.`, title: 'We could not take this booking.',
      intro: `Sorry, ${g.firstName}. ${v.name} cannot take your booking for ${date}.${reason ? ` ${reason}` : ''} We would love to host you another night.`,
      button: { label: 'Pick another night', url: `${app()}/${bookPath(v.slug)}` },
    } },
  };
}

export function bookingCancelled(v: VenueLike & { slug: string }, g: Person, r: Res): GuestMessage {
  const date = prettyDate(r.date);
  const refund = r.depositPaidAt && r.depositAmount > 0
    ? `Your ${egp(r.depositAmount)} deposit will be refunded to your card within 7 days.`
    : 'No payment was taken.';
  return {
    kind: 'booking_cancelled', subject: `Booking cancelled · ${v.name} · ${date}`,
    body: `Hi ${g.firstName}, your booking at ${v.name} for ${date} has been cancelled. ${refund}`,
    wa: { name: 'xtra_booking_cancelled', header: v.name, params: [g.firstName, date, refund], button: bookPath(v.slug) },
    mail: { venue: v, doc: {
      preheader: refund, title: 'Your booking is cancelled.',
      intro: `Hi ${g.firstName}, your booking at ${v.name} for ${date} has been cancelled. ${refund}`,
      rows: bookingRows(r), button: { label: 'Book another night', url: `${app()}/${bookPath(v.slug)}` },
      note: 'Questions? Just reply to this email.',
    } },
  };
}

export function bookingPass(v: VenueLike, p: { name: string; qrToken: string }, r: Res): GuestMessage {
  const date = prettyDate(r.date), time = prettyTime(r.slotLabel), url = `${app()}/p/${p.qrToken}`;
  const first = p.name.split(' ')[0] || p.name;
  return {
    kind: 'booking_pass', subject: `Your pass · ${v.name} · ${date}`,
    body: `Hi ${first}, you are on the guest list at ${v.name} for ${date} at ${time}. Show your pass at the door: ${url}`,
    wa: { name: 'xtra_booking_pass', header: v.name, params: [first, date, time], button: `p/${p.qrToken}` },
    mail: { venue: v, doc: {
      preheader: `${date} at ${time}. Show this QR at the door.`, title: `You're on the list, ${first}.`,
      intro: 'Show this QR at the door. It is yours only and works once.',
      rows: [['Date', date], ['Time', time]],
      qrs: [{ token: p.qrToken, caption: p.name, url }],
      button: { label: 'Open my pass', url },
    } },
  };
}

export function bookingReminder(v: VenueLike, g: Person, r: Res, passToken: string): GuestMessage {
  const time = prettyTime(r.slotLabel), url = `${app()}/p/${passToken}`;
  return {
    kind: 'booking_reminder', subject: `See you tonight · ${v.name} · ${time}`,
    body: `Hi ${g.firstName}, see you tonight at ${v.name} at ${time}. Have your pass ready at the door: ${url}`,
    wa: { name: 'xtra_booking_reminder', header: v.name, params: [g.firstName, time], button: `p/${passToken}` },
    mail: { venue: v, doc: {
      preheader: `Tonight at ${time}. Your pass is inside.`, title: `See you tonight, ${g.firstName}.`,
      intro: `Your table is ready for ${time}. Please arrive within 30 minutes of your time.`,
      rows: bookingRows(r), qrs: [{ token: passToken, caption: 'Your pass', url }],
      button: { label: 'Directions', url: v.mapUrl || url },
    } },
  };
}

function marketing(kind: string, name: string, v: VenueLike & { slug: string }, g: Person & { id: string }, subject: string, title: string, intro: string, text: string): GuestMessage {
  const url = `${app()}/${bookPath(v.slug)}`;
  return {
    kind, subject, body: `${text} ${url}\nReply STOP to opt out`,
    wa: { name, header: v.name, params: [g.firstName], button: bookPath(v.slug) },
    mail: { venue: v, doc: { preheader: intro, title, intro, button: { label: 'Book a table', url }, unsubscribeUrl: unsubscribeUrl(g.id) } },
  };
}

export const visitThanks = (v: VenueLike & { slug: string }, g: Person & { id: string }) => marketing('visit_thanks', 'xtra_visit_thanks', v, g,
  `Thank you for last night · ${v.name}`, `Thank you, ${g.firstName}.`,
  'It was great having you last night. We hope to see you again soon.',
  `Hi ${g.firstName}, thank you for spending the night at ${v.name}. We hope to see you again soon:`);

export const birthday = (v: VenueLike & { slug: string }, g: Person & { id: string }) => marketing('birthday', 'xtra_birthday', v, g,
  `Celebrate your birthday at ${v.name}`, `Happy early birthday, ${g.firstName}.`,
  'Your birthday is coming up and we would love to celebrate with you. Book your table now.',
  `Hi ${g.firstName}, your birthday is coming up and ${v.name} would love to celebrate with you. Book your table:`);

export const winback = (v: VenueLike & { slug: string }, g: Person & { id: string }) => marketing('winback', 'xtra_winback', v, g,
  `We miss you · ${v.name}`, `It has been a while, ${g.firstName}.`,
  'We miss you. Come back this week, your table is waiting.',
  `Hi ${g.firstName}, it has been a while and ${v.name} misses you. Come back this week:`);

/** One ticket, for its holder's WhatsApp. */
export function ticketWa(v: VenueLike, t: { firstName: string; qrToken: string; type: string }, event: string, when: string): WaTemplate {
  return { name: 'xtra_ticket', header: v.name, params: [t.firstName || 'there', event, when, t.type], button: `t/${t.qrToken}` };
}

/** The order email: every ticket with its QR, and the receipt. */
export function ticketOrderEmail(
  v: VenueLike, o: { code: string; subtotal: number; discount: number; fee: number; feeVat: number; total: number },
  event: string, when: string, tickets: { name: string; type: string; qrToken: string }[], buyer: string,
): Omit<GuestMessage, 'wa'> {
  const n = tickets.length;
  const receipt: [string, string][] = [[`Tickets (${n})`, egp(o.subtotal)]];
  if (o.discount) receipt.push(['Discount', `- ${egp(o.discount)}`]);
  if (o.fee) receipt.push(['Booking fee', egp(o.fee)]);
  if (o.feeVat) receipt.push(['VAT on fee', egp(o.feeVat)]);
  receipt.push(['Total paid', egp(o.total)]);
  return {
    kind: 'ticket_order', subject: `Your ${n === 1 ? 'ticket' : `${n} tickets`} · ${event} · ${when}`,
    body: `Hi ${buyer}, your ${n === 1 ? 'ticket is' : 'tickets are'} ready for ${event} at ${v.name}, ${when}. Order ${o.code}.`,
    mail: { venue: v, doc: {
      preheader: `${event}, ${when}. Show each QR at the door.`, title: `You're going to ${event}.`,
      intro: `Hi ${buyer}, here ${n === 1 ? 'is your ticket' : `are your ${n} tickets`}. Each QR lets one person in once, so share each one with its guest.`,
      rows: [['Event', event], ['When', when], ['Venue', v.name], ['Order', o.code]],
      receipt,
      qrs: tickets.map((t) => ({ token: t.qrToken, caption: `${t.name} · ${t.type}`, url: `${app()}/t/${t.qrToken}` })),
      note: 'Screenshots work too. The venue may ask for an ID at the door.',
    } },
  };
}

export { emailParts };

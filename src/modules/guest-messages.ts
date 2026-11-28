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
import type { EmailDoc, WalletLinks } from '../integrations/email-html.js';
import { appleWalletLink, appleWalletReady, googleWalletLink, googleWalletReady } from '../integrations/wallet.js';

type Res = { code: string; date: string; slotLabel: string; partySize: number; depositAmount: number; depositPaidAt?: Date | null; minSpend?: number };
type Person = { id?: string; firstName: string };
type Doc = Omit<EmailDoc, 'venue'>;
export type GuestMessage = { kind: string; subject: string; body: string; wa?: WaTemplate; mail: { venue: VenueLike; doc: Doc } };

const app = () => config.publicAppUrl;
/** Wallet buttons for one pass, only for the wallets that are set up. */
const walletFor = (token: string): WalletLinks | undefined => {
  const w = { apple: appleWalletReady() ? appleWalletLink(token) : null, google: googleWalletReady() ? googleWalletLink(token) : null };
  return w.apple || w.google ? w : undefined;
};
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

/** Accepted, with a deposit to pay before the table is confirmed. */
export function depositDue(v: VenueLike, g: Person, r: Res): GuestMessage {
  const date = prettyDate(r.date), dep = egp(r.depositAmount);
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

/**
 * The booking is off: the venue declined the request or cancelled it. One
 * message for both, with what happens to any deposit.
 */
export function bookingCancelled(v: VenueLike & { slug: string }, g: Person, r: Res, x: { declined?: boolean; reason?: string | null } = {}): GuestMessage {
  const date = prettyDate(r.date);
  const why = x.declined ? `${v.name} cannot take your booking on this night.${x.reason ? ` ${x.reason}` : ''}` : '';
  const money = r.depositPaidAt && r.depositAmount > 0
    ? `Your ${egp(r.depositAmount)} deposit will be refunded to your card within 7 days.`
    : 'No payment was taken.';
  const line = [why, money].filter(Boolean).join(' ');
  return {
    kind: x.declined ? 'booking_declined' : 'booking_cancelled', subject: `${x.declined ? 'About your booking' : 'Booking cancelled'} · ${v.name} · ${date}`,
    body: `Hi ${g.firstName}, your booking at ${v.name} for ${date} has been cancelled. ${line}`,
    wa: { name: 'xtra_booking_cancelled', header: v.name, params: [g.firstName, date, line], button: bookPath(v.slug) },
    mail: { venue: v, doc: {
      preheader: x.declined ? `We could not take your booking for ${date}.` : money,
      title: x.declined ? 'We could not take this booking.' : 'Your booking is cancelled.',
      intro: `Hi ${g.firstName}, ${x.declined ? `sorry, ${why} We would love to host you another night.` : `your booking at ${v.name} for ${date} has been cancelled.`} ${money}`,
      rows: bookingRows(r), button: { label: 'Book another night', url: `${app()}/${bookPath(v.slug)}` },
      note: 'Questions? Just reply to this email.',
    } },
  };
}

/**
 * The booker's one message once the table is confirmed: the booking, their own
 * pass with its QR, and the deposit receipt when one was paid.
 */
export function bookingConfirmed(v: VenueLike, g: Person, r: Res, pass: { name: string; qrToken: string }): GuestMessage {
  const date = prettyDate(r.date), time = prettyTime(r.slotLabel), url = `${app()}/p/${pass.qrToken}`;
  const dep = r.depositPaidAt && r.depositAmount > 0 ? egp(r.depositAmount) : null;
  return {
    kind: 'booking_confirmed', subject: `You're booked · ${v.name} · ${date}`,
    body: `Hi ${g.firstName}, your booking at ${v.name} is confirmed for ${date} at ${time}, ${guests(r.partySize)}.${dep ? ` We received your ${dep} deposit, it comes off your bill.` : ''} Your pass for the door: ${url}`,
    wa: { name: 'xtra_booking_pass', header: v.name, params: [g.firstName, date, time], button: `p/${pass.qrToken}` },
    mail: { venue: v, doc: {
      preheader: `${date} at ${time}, ${guests(r.partySize)}. Your pass is inside.`, title: `You're booked, ${g.firstName}.`,
      intro: `Please arrive within 30 minutes of your time and show this QR at the door.${r.partySize > 1 ? ' Guests you added with a phone or email get their own pass.' : ''}`,
      rows: bookingRows(r),
      ...(dep ? { receipt: [['Deposit', dep], ['Paid', dep]] as [string, string][] } : {}),
      qrs: [{ token: pass.qrToken, caption: pass.name, url, wallet: walletFor(pass.qrToken) }],
      button: { label: 'View my booking', url: `${app()}/${statusPath(r.code)}` },
      note: dep ? 'The deposit comes off your bill on the night. Cancel at least 24 hours before and you get it back.' : undefined,
    } },
  };
}

/**
 * Day-of reminder (only when the venue switches it on). Uses the approved
 * xtra_booking_reminder template; the email also lets them cancel so the
 * table can go to someone else.
 */
export function bookingReminder(v: VenueLike, g: Person, r: Res, passToken: string): GuestMessage {
  const time = prettyTime(r.slotLabel), url = `${app()}/p/${passToken}`, manage = `${app()}/${statusPath(r.code)}`;
  return {
    kind: `booking_reminder:${r.code}`, subject: `See you tonight · ${v.name} · ${time}`,
    body: `Hi ${g.firstName}, this is a reminder of your booking tonight at ${v.name} at ${time}. Please have your entry pass ready at the door: ${url}`,
    wa: { name: 'xtra_booking_reminder', header: v.name, params: [g.firstName, time], button: `p/${passToken}` },
    mail: { venue: v, doc: {
      preheader: `Tonight at ${time}. Your pass is inside.`, title: `See you tonight, ${g.firstName}.`,
      intro: `Your table is ready for ${time}, ${guests(r.partySize)}. Show your pass at the door. Plans changed? Cancel from your booking page so we can give the table to someone else.`,
      rows: bookingRows(r),
      button: { label: 'Open my pass', url },
      secondary: { label: 'Cancel my booking', url: manage },
    } },
  };
}

export function bookingPass(v: VenueLike, p: { name: string; qrToken: string }, r: Res): GuestMessage {
  const date = prettyDate(r.date), time = prettyTime(r.slotLabel), url = `${app()}/p/${p.qrToken}`;
  const first = p.name.split(' ')[0] || p.name;
  return {
    kind: 'booking_pass', subject: `Your pass · ${v.name} · ${date}`,
    body: `Hi ${first}, you are on the guest list at ${v.name} for ${date} at ${time}. Your entry pass is ready, please show it at the door: ${url}`,
    wa: { name: 'xtra_booking_pass', header: v.name, params: [first, date, time], button: `p/${p.qrToken}` },
    mail: { venue: v, doc: {
      preheader: `${date} at ${time}. Show this QR at the door.`, title: `You're on the list, ${first}.`,
      intro: 'Show this QR at the door. It is yours only and works once.',
      rows: [['Date', date], ['Time', time]],
      qrs: [{ token: p.qrToken, caption: p.name, url, wallet: walletFor(p.qrToken) }],
      button: { label: 'Open my pass', url },
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
  invite?: { note?: string | null },
): Omit<GuestMessage, 'wa'> {
  const n = tickets.length;
  if (invite) {
    return {
      kind: 'ticket_invite', subject: `You're invited · ${event} · ${when}`,
      body: `Hi ${buyer}, ${v.name} invited you to ${event}, ${when}. Your ${n === 1 ? 'ticket is' : `${n} tickets are`} free. Order ${o.code}.`,
      mail: { venue: v, doc: {
        preheader: `${v.name} invited you. ${event}, ${when}.`, title: `You're invited to ${event}.`,
        intro: `Hi ${buyer}, ${v.name} has invited you${n > 1 ? ` and ${n - 1} ${n === 2 ? 'guest' : 'guests'}` : ''}. ${n === 1 ? 'Your ticket is' : 'Your tickets are'} below, free of charge. Each QR lets one person in once.${invite.note ? ` A note from ${v.name}: "${invite.note}"` : ''}`,
        rows: [['Event', event], ['When', when], ['Venue', v.name], ['Invitation', o.code]],
        qrs: tickets.map((t) => ({ token: t.qrToken, caption: `${t.name} · ${t.type}`, url: `${app()}/t/${t.qrToken}`, wallet: walletFor(t.qrToken) })),
        note: 'Screenshots work too. The venue may ask for an ID at the door.',
      } },
    };
  }
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
      qrs: tickets.map((t) => ({ token: t.qrToken, caption: `${t.name} · ${t.type}`, url: `${app()}/t/${t.qrToken}`, wallet: walletFor(t.qrToken) })),
      note: 'Screenshots work too. The venue may ask for an ID at the door.',
    } },
  };
}

/** Money back on a ticket order or a deposit. */
export function refundDone(v: VenueLike, g: Person, x: { what: string; amount: number; code: string; method: 'paymob' | 'manual' }): GuestMessage {
  const amount = egp(x.amount);
  const how = x.method === 'paymob'
    ? 'It goes back to the card or wallet you paid with. Banks usually show it within 5 to 14 days.'
    : `${v.name} will give it back to you directly.`;
  return {
    kind: 'refund', subject: `Refund of ${amount} · ${v.name}`,
    body: `Hi ${g.firstName}, ${v.name} refunded ${amount} for your ${x.what} (${x.code}). ${how}`,
    wa: { name: 'xtra_refund', header: v.name, params: [g.firstName, amount, x.what, x.code] },
    mail: { venue: v, doc: {
      preheader: `${amount} is on its way back to you.`, title: `We refunded ${amount}.`,
      intro: `Hi ${g.firstName}, ${v.name} refunded your ${x.what}. ${how}`,
      rows: [['Refund', amount], ['For', x.what], ['Reference', x.code]],
      note: x.what.includes('ticket') ? 'The QR codes of this order no longer work at the door.' : 'Questions? Just reply to this email.',
    } },
  };
}

/** A place opened up for a guest on an event's waitlist. */
export function waitlistOpen(v: VenueLike, g: Person, x: { event: string; when: string; eventId: string; type?: string | null }): GuestMessage {
  const url = `${app()}/e/${x.eventId}`;
  const what = x.type ? `${x.type} tickets for ${x.event}` : `tickets for ${x.event}`;
  return {
    kind: 'waitlist_open', subject: `Tickets are available again · ${x.event}`,
    body: `Hi ${g.firstName}, good news: ${what} at ${v.name}, ${x.when}, are available again. They go to whoever books first: ${url}`,
    wa: { name: 'xtra_waitlist_open', header: v.name, params: [g.firstName, x.event, x.when], button: `e/${x.eventId}` },
    mail: { venue: v, doc: {
      preheader: `A place opened up for ${x.event}.`, title: 'A place just opened up.',
      intro: `Hi ${g.firstName}, you were on the waitlist and ${what}, ${x.when}, are available again. They go to whoever books first, so be quick.`,
      button: { label: 'Get tickets', url },
      note: 'You got this because you joined the waitlist. We only tell you once.',
    } },
  };
}

/** Email only: what the guest paid at the venue, line by line. */
export function billReceipt(v: VenueLike, g: Person, t: { id: string; paidAt: Date | null; total: number; service: number; vat: number; minSpendTopUp: number; depositCredit: number; subtotal: number; payMethod: string | null },
  items: { name: string; qty: number; unitPrice: number; options?: { name: string }[] }[], when: string): GuestMessage {
  const receipt: [string, string][] = items.map((i) => [`${i.qty} × ${i.name}${i.options?.length ? ` (${i.options.map((o) => o.name).join(', ')})` : ''}`, egp(i.qty * i.unitPrice)]);
  if (t.minSpendTopUp) receipt.push(['Minimum spend top-up', egp(t.minSpendTopUp)]);
  if (t.service) receipt.push(['Service', egp(t.service)]);
  if (t.vat) receipt.push(['VAT', egp(t.vat)]);
  if (t.depositCredit) receipt.push(['Deposit paid before', `- ${egp(t.depositCredit)}`]);
  receipt.push(['Total paid', egp(t.total)]);
  return {
    kind: `receipt:${t.id}`, subject: `Your receipt · ${v.name} · ${when}`,
    body: `Hi ${g.firstName}, thank you for coming to ${v.name}. You paid ${egp(t.total)}.`,
    mail: { venue: v, doc: {
      preheader: `You paid ${egp(t.total)}. Thank you for coming.`, title: `Thank you, ${g.firstName}.`,
      intro: `Here is your receipt from ${v.name}, ${when}.`, receipt,
      note: 'Keep this email for your records.',
    } },
  };
}

export { emailParts };

/**
 * The morning summary: at 10 AM Cairo, last night's numbers go to the people
 * the venue chose in Venue setup, by email, WhatsApp or both (their choice).
 * Off until the owner switches it on. Sent once per venue and night.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { egp, MANAGERS, parse, venueAccess } from '../lib/http.js';
import { nightOf, prettyDate } from '../lib/dates.js';
import { normalizePhone } from '../lib/codes.js';
import { emailParts, send } from '../integrations/notify.js';
import { totals } from './reports.js';
import { waOn } from './waitlist.js';

type Venue = typeof schema.venues.$inferSelect;
const shift = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
const night = (col: unknown) => sql`((${col} at time zone 'Africa/Cairo') - interval '6 hours')::date`;

/** "▲ 12% on last Thursday" */
function vs(now: number, before: number, day: string) {
  if (!before) return now ? `new vs last ${day}` : '';
  const p = Math.round(((now - before) / before) * 100);
  return p === 0 ? `same as last ${day}` : `${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% vs last ${day}`;
}

/** How it goes out: the venue's choice, both when never chosen. */
export const reportChannel = (v: Venue) => v.settings.dailyReport?.channel ?? 'both';

/** Who gets it: the chosen emails (or else the venue owners) and numbers, for the chosen channel. */
async function recipients(v: Venue) {
  const s = v.settings.dailyReport;
  const ch = reportChannel(v);
  let emails = ch === 'whatsapp' ? [] : s?.emails?.filter(Boolean) ?? [];
  if (!emails.length && ch !== 'whatsapp') {
    emails = (await db.select({ e: schema.users.email }).from(schema.venueStaff).innerJoin(schema.users, eq(schema.users.id, schema.venueStaff.userId))
      .where(and(eq(schema.venueStaff.venueId, v.id), eq(schema.venueStaff.role, 'owner')))).map((r) => r.e);
  }
  return { emails, phones: ch === 'email' || !waOn('xtra_daily_report') ? [] : (s?.phones ?? []).filter(Boolean).map(normalizePhone) };
}

/** Last night's numbers for one venue, and what to send. */
export async function buildDailyReport(v: Venue, day: string) {
  const [t, before, items, evs] = await Promise.all([
    totals(v.id, day, day),
    totals(v.id, shift(day, -7), shift(day, -7)),
    db.execute(sql`select i.name, sum(i.qty) as qty from tab_items i join tabs t on t.id = i.tab_id
      where t.venue_id = ${v.id} and t.status = 'paid' and i.status <> 'void' and ${night(sql`t.paid_at`)} = ${day} group by i.name order by sum(i.qty * i.unit_price) desc limit 3`),
    db.execute(sql`select e.title, (select count(*) from tickets t join ticket_orders o on o.id = t.order_id where t.event_id = e.id and o.status = 'paid' and t.checked_in_at is not null) as came
      from events e where e.venue_id = ${v.id} and ${night(sql`e.starts_at`)} = ${day}`),
  ]);
  const M = t.money, B = t.bookings, P = before.money;
  const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const quiet = !M.total && !B.requests && !t.tickets.sold && !M.bills;
  const rows: [string, string][] = [
    ['Money in', `${egp(M.total)}${vs(M.total, P.total, weekday) ? `  (${vs(M.total, P.total, weekday)})` : ''}`],
    ...(M.bills ? [['Bills', `${M.bills} · average ${egp(M.avgBill)}`] as [string, string]] : []),
    ...(t.tickets.sold || t.tickets.invited ? [['Tickets', `${t.tickets.sold} sold · ${egp(M.tickets)}${t.tickets.invited ? ` · ${t.tickets.invited} invited` : ''}`] as [string, string]] : []),
    ...(M.deposits ? [['Deposits', egp(M.deposits)] as [string, string]] : []),
    ...(M.refunds ? [['Refunds', `- ${egp(M.refunds)}`] as [string, string]] : []),
    ['Guests served', String(B.covers)],
    ...(B.confirmed ? [['Bookings', `${B.showed} came of ${B.confirmed}${B.noShows ? ` · ${B.noShows} no-show${B.noShows > 1 ? 's' : ''}` : ''}`] as [string, string]] : []),
    ...evs.rows.map((e) => ['Event', `${e.title} · ${Number(e.came)} came`] as [string, string]),
    ...(items.rows.length ? [['Best sellers', items.rows.map((i) => `${i.name} × ${Number(i.qty)}`).join(', ')] as [string, string]] : []),
  ];
  const date = prettyDate(day);
  const subject = `${v.name} · last night, ${date}: ${egp(M.total)}`;
  const body = `${v.name}, ${date}: ${egp(M.total)} in, ${B.covers} guests, ${t.tickets.sold} tickets sold. Full report: ${config.publicAppUrl}/`;
  const doc = {
    preheader: `${egp(M.total)} in, ${B.covers} guests served.`, title: `Last night at ${v.name}`,
    intro: `Your summary for ${weekday}, ${date}. A night runs until 6 AM.`,
    rows, button: { label: 'Open reports', url: `${config.publicAppUrl}/` },
    note: 'You get this every morning at 10. Turn it off or change who gets it in Venue setup.',
  };
  return { quiet, subject, body, doc, wa: { name: 'xtra_daily_report', header: v.name, params: [date, egp(M.total), String(B.covers), String(t.tickets.sold)] } };
}

async function sendReport(v: Venue, day: string, kind: string) {
  const r = await buildDailyReport(v, day);
  const to = await recipients(v);
  const parts = emailParts(v, r.doc);
  for (const e of to.emails) await send({ channel: 'email', to: e, kind, subject: r.subject, venueId: v.id, ...parts });
  for (const p of to.phones) await send({ channel: 'whatsapp', to: p, kind, body: r.body, venueId: v.id, whatsappTemplate: r.wa });
  return { ...r, to };
}

/** Run from the automations timer: after 10 AM, once per venue and night. */
export async function runDailyReports(now = new Date()) {
  const cairoHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (cairoHour < 10) return 0;
  const day = shift(nightOf(now), -1);
  const venues = await db.select().from(schema.venues).where(eq(schema.venues.active, true));
  let n = 0;
  for (const v of venues) {
    if (!v.settings.dailyReport?.on) continue;
    const kind = `daily_report:${v.id}:${day}`;
    const [done] = await db.select({ id: schema.messages.id }).from(schema.messages).where(eq(schema.messages.kind, kind)).limit(1);
    if (done) continue;
    const to = await recipients(v);
    if (!to.emails.length && !to.phones.length) continue;
    const r = await buildDailyReport(v, day);
    if (r.quiet) continue;
    await sendReport(v, day, kind);
    n++;
  }
  return n;
}

export default async function dailyReport(app: FastifyInstance) {
  /* Send last night's summary now, to check how it looks. */
  app.post<{ Params: { venueId: string } }>('/venues/:venueId/daily-report/test', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), req.body ?? {});
    const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, req.params.venueId));
    const day = b.day ?? shift(nightOf(), -1);
    const r = await sendReport(v, day, `daily_report_test:${v.id}:${Date.now()}`);
    return { day, emails: r.to.emails, phones: r.to.phones, subject: r.subject };
  });
}

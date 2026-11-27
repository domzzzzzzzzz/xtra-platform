/**
 * Offer messages a venue can switch on in Marketing (all off until switched on):
 *  - thanks:  the day after a visit, from 2 PM
 *  - bday:    7 days before a guest's birthday (only guests who opted in)
 *  - winback: 45 days after the last visit (only guests who opted in)
 * Each message is sent once: its `kind` carries a unique key, checked before sending.
 */
import type { FastifyInstance } from 'fastify';
import { and, eq, gte, inArray, like, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { notifyGuest } from '../integrations/notify.js';
import * as M from './guest-messages.js';
import { localDate, nightOf } from '../lib/dates.js';
import { MANAGERS, venueAccess } from '../lib/http.js';
import { runDailyReports } from './daily-report.js';

export const AUTOMATIONS = ['thanks', 'bday', 'winback'] as const;
type Auto = (typeof AUTOMATIONS)[number];
const DEFAULTS: Record<Auto, boolean> = { thanks: false, bday: false, winback: false };

const isOn = (v: typeof schema.venues.$inferSelect, k: Auto) => v.settings?.automations?.[k] ?? DEFAULTS[k];

async function alreadySent(kind: string) {
  const [m] = await db.select({ id: schema.messages.id }).from(schema.messages).where(eq(schema.messages.kind, kind)).limit(1);
  return Boolean(m);
}

/** Minutes since midnight in Cairo. */
function cairoMinutes(d = new Date()) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).split(':').map(Number);
  return h * 60 + m;
}

const slotStart = (label: string) => {
  const [h, m] = (label.split(' ')[0] || '21:00').split(':').map(Number);
  let v = h * 60 + (m || 0);
  if (v < 6 * 60) v += 1440;
  return v;
};

export async function runAutomations(now = new Date()) {
  const venues = await db.select().from(schema.venues).where(eq(schema.venues.active, true));
  let sent = 0;
  for (const v of venues) {
    const ch = 'both' as const;

    if (isOn(v, 'thanks') && cairoMinutes(now) >= 14 * 60) {
      const yesterday = localDate(new Date(now.getTime() - 86400_000));
      const rows = await db.select({ r: schema.reservations, g: schema.guests }).from(schema.reservations)
        .innerJoin(schema.guests, eq(schema.guests.id, schema.reservations.guestId))
        .where(and(eq(schema.reservations.venueId, v.id), eq(schema.reservations.date, yesterday), inArray(schema.reservations.status, ['arrived', 'completed'])));
      for (const { r, g } of rows) {
        const kind = `auto:thanks:${r.id}`;
        if (await alreadySent(kind)) continue;
        await notifyGuest({ channel: ch, phone: g.phone, email: g.emailOptIn ? g.email : null, venueId: v.id, guestId: g.id, ...M.visitThanks(v, g), kind });
        sent++;
      }
    }

    const wantBday = isOn(v, 'bday'), wantWinback = isOn(v, 'winback');
    if (wantBday || wantWinback) {
      const rows = await db.select({ g: schema.guests, vg: schema.venueGuests }).from(schema.venueGuests)
        .innerJoin(schema.guests, eq(schema.guests.id, schema.venueGuests.guestId))
        .where(and(eq(schema.venueGuests.venueId, v.id), eq(schema.venueGuests.blocked, false), eq(schema.guests.whatsappOptIn, true)));
      const inWeek = localDate(new Date(now.getTime() + 7 * 86400_000)).slice(5);
      for (const { g, vg } of rows) {
        if (wantBday && g.birthDate && g.birthDate.slice(5) === inWeek) {
          const kind = `auto:bday:${v.id}:${g.id}:${now.getUTCFullYear()}`;
          if (!(await alreadySent(kind))) {
            await notifyGuest({ channel: 'both', phone: g.phone, email: g.emailOptIn ? g.email : null, venueId: v.id, guestId: g.id, ...M.birthday(v, g), kind });
            sent++;
          }
        }
        if (wantWinback && vg.lastVisitAt) {
          const days = (now.getTime() - vg.lastVisitAt.getTime()) / 86400_000;
          if (days >= 45 && days < 60) {
            const kind = `auto:winback:${v.id}:${g.id}:${localDate(vg.lastVisitAt)}`;
            if (!(await alreadySent(kind))) {
              await notifyGuest({ channel: 'both', phone: g.phone, email: g.emailOptIn ? g.email : null, venueId: v.id, guestId: g.id, ...M.winback(v, g), kind });
              sent++;
            }
          }
        }
      }
    }
  }
  return sent;
}

/** Checks every 10 minutes. */
export function startAutomations() {
  const t = setInterval(() => { runAutomations().catch(() => {}); runDailyReports().catch(() => {}); }, 10 * 60_000);
  t.unref();
  return t;
}

export default async function automations(app: FastifyInstance) {
  /* How many of each automatic message went out this month. */
  app.get<{ Params: { venueId: string } }>('/venues/:venueId/automations', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const rows = await db.select({ kind: sql<string>`split_part(${schema.messages.kind}, ':', 2)`, n: sql<number>`count(distinct ${schema.messages.kind})::int` }).from(schema.messages)
      .where(and(eq(schema.messages.venueId, req.params.venueId), like(schema.messages.kind, 'auto:%'), gte(schema.messages.createdAt, since)))
      .groupBy(sql`split_part(${schema.messages.kind}, ':', 2)`);
    return Object.fromEntries(AUTOMATIONS.map((k) => [k, rows.find((r) => r.kind === k)?.n ?? 0]));
  });
}

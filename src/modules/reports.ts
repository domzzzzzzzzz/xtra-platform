/**
 * Reports for one venue over a date range (Cairo nights): money in, bookings
 * and no-shows, covers, best guests, best sellers and ticket sales per event.
 * Headline numbers also come for the range just before, for "vs before".
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { parse, venueAccess } from '../lib/http.js';
import { badRequest } from '../lib/errors.js';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A "night" in Cairo runs until 6 AM, so a 1 AM bill counts for the night before. */
const night = (col: unknown) => sql`((${col} at time zone 'Africa/Cairo') - interval '6 hours')::date`;
const n = (v: unknown) => Number(v ?? 0);
const shift = (ymdStr: string, days: number) => new Date(Date.parse(ymdStr) + days * 864e5).toISOString().slice(0, 10);

export default async function reports(app: FastifyInstance) {
  app.get<{ Params: { venueId: string }; Querystring: { from?: string; to?: string } }>('/venues/:venueId/reports', async (req) => {
    await venueAccess(req, req.params.venueId, []);
    const today = new Date(Date.now() + 2 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
    const to = parse(ymd.optional(), req.query.to) ?? today;
    const from = parse(ymd.optional(), req.query.from) ?? shift(to, -29);
    if (from > to) throw badRequest('The start date is after the end date');
    const span = Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
    if (span > 400) throw badRequest('Pick a range of up to a year');
    const v = req.params.venueId;
    const prevTo = shift(from, -1), prevFrom = shift(prevTo, -span);

    const [cur, prev, byMethod, days, topGuests, topItems, events] = await Promise.all([
      totals(v, from, to),
      totals(v, prevFrom, prevTo),
      db.execute(sql`select pay_method as method, count(*) as n, coalesce(sum(total),0) as total from tabs
        where venue_id = ${v} and status = 'paid' and ${night(sql`paid_at`)} between ${from} and ${to} group by pay_method order by total desc`),
      db.execute(sql`with d as (select generate_series(${from}::date, ${to}::date, interval '1 day')::date as day)
        select to_char(d.day, 'YYYY-MM-DD') as day,
          (select coalesce(sum(total),0) from tabs where venue_id = ${v} and status = 'paid' and ${night(sql`paid_at`)} = d.day) as tables,
          (select coalesce(sum(subtotal - discount),0) from ticket_orders where venue_id = ${v} and status = 'paid' and kind = 'sale' and ${night(sql`paid_at`)} = d.day) as tickets,
          (select count(*) from reservations where venue_id = ${v} and date = d.day and status in ('confirmed','arrived','completed','no_show')) as bookings,
          (select count(*) from reservations where venue_id = ${v} and date = d.day and status = 'no_show') as no_shows
        from d order by d.day`),
      db.execute(sql`select g.id, trim(g.first_name || ' ' || g.last_name) as name, g.phone, vg.visits, vg.total_spend as spend, vg.points,
          to_char(vg.last_visit_at at time zone 'Africa/Cairo', 'YYYY-MM-DD') as last_visit, vg.tags
        from venue_guests vg join guests g on g.id = vg.guest_id where vg.venue_id = ${v} and (vg.total_spend > 0 or vg.visits > 0)
        order by vg.total_spend desc, vg.visits desc limit 10`),
      db.execute(sql`select i.name, sum(i.qty) as qty, sum(i.qty * i.unit_price) as total from tab_items i join tabs t on t.id = i.tab_id
        where t.venue_id = ${v} and t.status = 'paid' and i.status <> 'void' and ${night(sql`t.paid_at`)} between ${from} and ${to}
        group by i.name order by total desc limit 10`),
      db.execute(sql`select e.id, e.title, to_char(e.starts_at at time zone 'Africa/Cairo', 'YYYY-MM-DD') as day, e.status,
          (select coalesce(sum(case when z.kind = 'standing' then z.capacity else 0 end),0) + (select coalesce(sum(s.seats),0) from event_seats s where s.event_id = e.id)
            from event_zones z where z.event_id = e.id) as capacity,
          (select count(*) from tickets t join ticket_orders o on o.id = t.order_id where t.event_id = e.id and o.status = 'paid' and o.kind = 'sale') as sold,
          (select count(*) from tickets t join ticket_orders o on o.id = t.order_id where t.event_id = e.id and o.status = 'paid' and o.kind = 'invite') as invited,
          (select count(*) from tickets t join ticket_orders o on o.id = t.order_id where t.event_id = e.id and o.status = 'paid' and t.checked_in_at is not null) as checked_in,
          (select coalesce(sum(o.subtotal - o.discount),0) from ticket_orders o where o.event_id = e.id and o.status = 'paid' and o.kind = 'sale') as net
        from events e where e.venue_id = ${v} and ${night(sql`e.starts_at`)} between ${from} and ${to} order by e.starts_at`),
    ]);

    return {
      from, to,
      previous: { from: prevFrom, to: prevTo, ...flat(prev) },
      money: { ...cur.money, byMethod: byMethod.rows.map((r) => ({ method: r.method ?? 'other', bills: n(r.n), total: n(r.total) })) },
      bookings: cur.bookings,
      tickets: cur.tickets,
      days: days.rows.map((r) => ({ day: String(r.day), tables: n(r.tables), tickets: n(r.tickets), bookings: n(r.bookings), noShows: n(r.no_shows) })),
      topGuests: topGuests.rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, visits: n(r.visits), spend: n(r.spend), points: n(r.points), lastVisit: r.last_visit, tags: r.tags })),
      topItems: topItems.rows.map((r) => ({ name: r.name, qty: n(r.qty), total: n(r.total) })),
      events: events.rows.map((r) => ({ id: r.id, title: r.title, day: r.day, status: r.status, capacity: n(r.capacity), sold: n(r.sold), invited: n(r.invited), checkedIn: n(r.checked_in), net: n(r.net) })),
    };
  });
}

/** The headline numbers for one range: used for the range and the one before it. */
export async function totals(v: string, from: string, to: string) {
  const [bills, bookings, deposits, tix, refunds] = await Promise.all([
    db.execute(sql`select count(*) as n, coalesce(sum(total),0) as total, coalesce(sum(service),0) as service, coalesce(sum(vat),0) as vat, coalesce(sum(party_size) filter (where reservation_id is null),0) as covers
      from tabs where venue_id = ${v} and status = 'paid' and ${night(sql`paid_at`)} between ${from} and ${to}`),
    db.execute(sql`select status, count(*) as n, coalesce(sum(party_size),0) as people from reservations
      where venue_id = ${v} and date between ${from} and ${to} group by status`),
    db.execute(sql`select count(*) as n, coalesce(sum(deposit_amount),0) as total from reservations
      where venue_id = ${v} and deposit_paid_at is not null and ${night(sql`deposit_paid_at`)} between ${from} and ${to}`),
    db.execute(sql`select count(distinct o.id) filter (where o.kind = 'sale') as orders, coalesce(sum(o.subtotal - o.discount),0) as net, coalesce(sum(o.subtotal),0) as gross,
        coalesce(sum(o.discount),0) as discounts, coalesce(sum(o.fee + o.fee_vat),0) as fees,
        (select count(*) from tickets t join ticket_orders o2 on o2.id = t.order_id
          where o2.venue_id = ${v} and o2.status = 'paid' and o2.kind = 'sale' and ${night(sql`o2.paid_at`)} between ${from} and ${to}) as tickets,
        (select count(*) from tickets t join ticket_orders o2 on o2.id = t.order_id
          where o2.venue_id = ${v} and o2.status = 'paid' and o2.kind = 'invite' and ${night(sql`o2.paid_at`)} between ${from} and ${to}) as invited
      from ticket_orders o where o.venue_id = ${v} and o.status in ('paid','refunded') and ${night(sql`o.paid_at`)} between ${from} and ${to}`),
    db.execute(sql`select count(*) as n, coalesce(sum(venue_amount),0) as total, coalesce(sum(venue_amount) filter (where purpose = 'deposit'),0) as deposits, coalesce(sum(amount - venue_amount),0) as fees
      from refunds where venue_id = ${v} and ${night(sql`created_at`)} between ${from} and ${to}`),
  ]);
  const b = bills.rows[0] ?? {}, t = tix.rows[0] ?? {}, d = deposits.rows[0] ?? {}, rf = refunds.rows[0] ?? {};
  const st = Object.fromEntries(bookings.rows.map((r) => [String(r.status), { n: n(r.n), people: n(r.people) }]));
  const c = (k: string) => st[k]?.n ?? 0;
  const showed = c('arrived') + c('completed'), noShows = c('no_show');
  return {
    money: {
      tables: n(b.total), bills: n(b.n), avgBill: n(b.n) ? Math.round(n(b.total) / n(b.n)) : 0, service: n(b.service), vat: n(b.vat),
      deposits: n(d.total), depositCount: n(d.n), tickets: n(t.net), ticketGross: n(t.gross), ticketDiscounts: n(t.discounts), bookingFees: n(t.fees) - n(rf.fees),
      refunds: n(rf.total), refundCount: n(rf.n),
      /** Bills are paid after the deposit came off, so deposits are counted on their own. */
      total: n(b.total) + n(t.net) + n(d.total) - n(rf.total),
    },
    bookings: {
      requests: Object.values(st).reduce((s, x) => s + x.n, 0), confirmed: c('confirmed') + showed + noShows, showed, noShows,
      declined: c('declined'), cancelled: c('cancelled'), waiting: c('in_review') + c('accepted'),
      noShowRate: showed + noShows ? Math.round((noShows / (showed + noShows)) * 1000) / 10 : 0,
      covers: (st.arrived?.people ?? 0) + (st.completed?.people ?? 0) + n(b.covers),
    },
    tickets: { orders: n(t.orders), sold: n(t.tickets), invited: n(t.invited), net: n(t.net) },
  };
}

/** The range before, as flat numbers for the "vs before" chips. */
function flat(x: Awaited<ReturnType<typeof totals>>) {
  return {
    total: x.money.total, tables: x.money.tables, tickets: x.money.tickets, deposits: x.money.deposits, bills: x.money.bills, avgBill: x.money.avgBill,
    ticketsSold: x.tickets.sold, confirmed: x.bookings.confirmed, showed: x.bookings.showed, noShows: x.bookings.noShows, noShowRate: x.bookings.noShowRate, covers: x.bookings.covers,
  };
}

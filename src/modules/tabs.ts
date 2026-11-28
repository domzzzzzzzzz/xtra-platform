import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, venueAccess, MANAGERS, SERVICE } from '../lib/http.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { computeBill, type Bill } from '../lib/pricing.js';
import { config } from '../config.js';
import { recordSpend, upsertGuest, ensureVenueGuest } from './guests-service.js';
import { startPayment } from './payments.js';
import { notifyGuest } from '../integrations/notify.js';
import { billReceipt } from './guest-messages.js';
import { prettyDate } from '../lib/dates.js';

type P = { venueId: string };
type PT = P & { tabId: string };
type Tab = typeof schema.tabs.$inferSelect;

/** The bill for a tab right now (or as frozen when paid). */
export async function billFor(tab: Tab) {
  const [items, payments] = await Promise.all([
    db.select().from(schema.tabItems).where(eq(schema.tabItems.tabId, tab.id)).orderBy(asc(schema.tabItems.createdAt)),
    db.select().from(schema.tabPayments).where(eq(schema.tabPayments.tabId, tab.id)).orderBy(asc(schema.tabPayments.createdAt)),
  ]);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const out = (bill: Bill) => ({ items, payments, bill: { ...bill, paid, remaining: Math.max(0, bill.total - paid) } });
  if (tab.status === 'paid') {
    return out({ subtotal: tab.subtotal, minSpend: tab.subtotal + tab.minSpendTopUp, minSpendTopUp: tab.minSpendTopUp, service: tab.service, vat: tab.vat, depositCredit: tab.depositCredit, total: tab.total });
  }
  const [venue] = await db.select().from(schema.venues).where(eq(schema.venues.id, tab.venueId));
  let minSpend = 0;
  let depositPaid = 0;
  if (tab.reservationId) {
    const [r] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, tab.reservationId));
    if (r) {
      minSpend = r.minSpend;
      depositPaid = r.depositPaidAt && !r.depositRefundedAt ? r.depositAmount : 0;
    }
  } else if (tab.tableId) {
    const [t] = await db.select().from(schema.floorItems).where(eq(schema.floorItems.id, tab.tableId));
    if (t?.zoneId) {
      const [zone] = await db.select().from(schema.floorItems).where(eq(schema.floorItems.id, t.zoneId));
      minSpend = zone?.minSpend ?? 0;
    }
  }
  return out(computeBill({
    items: items.filter((i) => i.status !== 'void'), minSpend, serviceBps: venue.serviceBps, vatBps: venue.vatBps, depositPaid,
  }));
}

async function loadTab(venueId: string, tabId: string) {
  const [t] = await db.select().from(schema.tabs).where(and(eq(schema.tabs.id, tabId), eq(schema.tabs.venueId, venueId)));
  if (!t) throw notFound('Bill not found');
  return t;
}

/** Check the waiter's picks against the item's extras and price them from the menu. */
export function pickOptions(m: typeof schema.menuItems.$inferSelect, picks: { group: string; name: string }[]): schema.PickedOption[] {
  const out: schema.PickedOption[] = [];
  for (const g of m.options ?? []) {
    const mine = picks.filter((p) => p.group === g.name);
    if (g.required && !mine.length) throw badRequest(`Pick ${g.name.toLowerCase()} for ${m.name}`, 'option_required');
    if (!g.multi && mine.length > 1) throw badRequest(`Pick one ${g.name.toLowerCase()} for ${m.name}`, 'option_one');
    for (const p of mine) {
      const c = g.choices.find((x) => x.name === p.name);
      if (!c) throw badRequest(`${p.name} is not an option for ${m.name}`, 'option_unknown');
      if (!out.some((o) => o.group === g.name && o.name === c.name)) out.push({ group: g.name, name: c.name, price: c.price });
    }
  }
  if (picks.some((p) => !(m.options ?? []).some((g) => g.name === p.group))) throw badRequest(`Unknown option for ${m.name}`, 'option_unknown');
  return out;
}

const openOnly = (t: Tab) => {
  if (t.status !== 'open') throw conflict('This bill is closed', 'tab_closed');
};

/** Freeze totals, record the guest's spend and points. Safe to call twice. */
export async function onTabPaid(tabId: string, method: (typeof schema.payMethod.enumValues)[number]) {
  const [tab] = await db.select().from(schema.tabs).where(eq(schema.tabs.id, tabId));
  if (!tab || tab.status !== 'open') return null;
  const { bill, payments } = await billFor(tab);
  return db.transaction(async (tx) => {
    const rest = bill.total - bill.paid;
    const methods = new Set([...payments.map((p) => p.method), ...(rest > 0 ? [method] : [])]);
    const [u] = await tx.update(schema.tabs).set({
      status: 'paid', subtotal: bill.subtotal, minSpendTopUp: bill.minSpendTopUp, service: bill.service, vat: bill.vat,
      depositCredit: bill.depositCredit, total: bill.total, payMethod: methods.size > 1 ? 'mixed' : ([...methods][0] ?? method), paidAt: new Date(),
    }).where(and(eq(schema.tabs.id, tab.id), eq(schema.tabs.status, 'open'))).returning();
    if (!u) return null;
    if (rest > 0) await tx.insert(schema.tabPayments).values({ venueId: u.venueId, tabId: u.id, amount: rest, method });
    if (u.guestId) await recordSpend(tx, u.venueId, u.guestId, bill.total + bill.depositCredit, u.id, 'bill', false);
    if (u.reservationId) await tx.update(schema.reservations).set({ status: 'completed' }).where(eq(schema.reservations.id, u.reservationId));
    return u;
  }).then(async (u) => {
    if (u) await sendReceipt(u).catch(() => {});
    return u;
  });
}

/** Email the guest their receipt once the bill is paid (email only, never WhatsApp). */
async function sendReceipt(t: Tab) {
  if (!t.guestId || t.total <= 0) return;
  const [g] = await db.select().from(schema.guests).where(eq(schema.guests.id, t.guestId));
  if (!g?.email) return;
  const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, t.venueId));
  const items = (await db.select().from(schema.tabItems).where(eq(schema.tabItems.tabId, t.id))).filter((i) => i.status !== 'void');
  const when = prettyDate((t.paidAt ?? new Date()).toLocaleDateString('en-CA', { timeZone: v.timezone }));
  await notifyGuest({ channel: 'email', email: g.email, venueId: v.id, guestId: g.id, ...billReceipt(v, g, t, items, when) });
}

export default async function tabs(app: FastifyInstance) {
  /* ---------- menu */
  app.get<{ Params: P }>('/venues/:venueId/menu', async (req) => {
    await venueAccess(req, req.params.venueId);
    return db.select().from(schema.menuItems).where(eq(schema.menuItems.venueId, req.params.venueId))
      .orderBy(asc(schema.menuItems.category), asc(schema.menuItems.sort), asc(schema.menuItems.name));
  });

  const optionGroup = z.object({
    name: z.string().trim().min(1).max(40), required: z.boolean().default(false), multi: z.boolean().default(false),
    choices: z.array(z.object({ name: z.string().trim().min(1).max(40), price: z.number().int().min(0).default(0) })).min(1).max(20),
  });
  const menuItem = z.object({
    category: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(80), description: z.string().max(300).default(''),
    price: z.number().int().min(0), active: z.boolean().default(true), sort: z.number().int().default(0),
    station: z.enum(schema.STATIONS).default('bar'), options: z.array(optionGroup).max(8).default([]),
  });

  app.post<{ Params: P }>('/venues/:venueId/menu', async (req, reply) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(menuItem, req.body);
    const [m] = await db.insert(schema.menuItems).values({ ...b, venueId: req.params.venueId }).returning();
    reply.code(201);
    return m;
  });

  app.patch<{ Params: P & { itemId: string } }>('/venues/:venueId/menu/:itemId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(menuItem.partial(), req.body);
    const [m] = await db.update(schema.menuItems).set(b)
      .where(and(eq(schema.menuItems.id, req.params.itemId), eq(schema.menuItems.venueId, req.params.venueId))).returning();
    if (!m) throw notFound('Menu item not found');
    return m;
  });

  /* ---------- tabs (a table's running bill) */
  app.get<{ Params: P; Querystring: { status?: 'open' | 'paid' } }>('/venues/:venueId/tabs', async (req) => {
    await venueAccess(req, req.params.venueId, SERVICE);
    const rows = await db.select().from(schema.tabs)
      .where(and(eq(schema.tabs.venueId, req.params.venueId), eq(schema.tabs.status, req.query.status ?? 'open')))
      .orderBy(asc(schema.tabs.createdAt));
    return Promise.all(rows.map(async (t) => ({ ...t, ...(await billFor(t)) })));
  });

  app.post<{ Params: P }>('/venues/:venueId/tabs', async (req, reply) => {
    const { user } = await venueAccess(req, req.params.venueId, SERVICE);
    const b = parse(z.object({
      tableId: z.string().uuid().optional(), reservationId: z.string().uuid().optional(),
      /** Walk-ins: name and party size, phone to keep them as a guest. */
      guestName: z.string().max(80).optional(), partySize: z.number().int().min(1).max(50).optional(), phone: z.string().min(8).max(20).optional(),
    }), req.body ?? {});
    let { tableId } = b;
    let guestId: string | null = null;
    let partySize = b.partySize ?? 0;
    if (b.reservationId) {
      const [r] = await db.select().from(schema.reservations)
        .where(and(eq(schema.reservations.id, b.reservationId), eq(schema.reservations.venueId, req.params.venueId)));
      if (!r) throw notFound('Booking not found');
      tableId = tableId ?? r.tableId ?? undefined;
      guestId = r.guestId;
      partySize = r.partySize;
      const [dup] = await db.select({ id: schema.tabs.id }).from(schema.tabs).where(and(eq(schema.tabs.reservationId, r.id), eq(schema.tabs.status, 'open')));
      if (dup) throw conflict('This booking already has an open bill', 'tab_exists');
    }
    if (tableId) {
      const [t] = await db.select().from(schema.floorItems).where(and(eq(schema.floorItems.id, tableId), eq(schema.floorItems.venueId, req.params.venueId)));
      if (!t) throw badRequest('Unknown table');
      const [busy] = await db.select({ id: schema.tabs.id }).from(schema.tabs).where(and(eq(schema.tabs.tableId, tableId), eq(schema.tabs.status, 'open')));
      if (busy) throw conflict('This table already has an open bill', 'tab_exists');
    }
    if (!guestId && b.phone) {
      const [first, ...rest] = (b.guestName ?? 'Walk-in').trim().split(/\s+/);
      const g = await upsertGuest(db, { phone: b.phone, firstName: first, lastName: rest.join(' ') });
      await ensureVenueGuest(db, req.params.venueId, g.id);
      await recordSpend(db, req.params.venueId, g.id, 0, g.id, 'visit', true);
      guestId = g.id;
    }
    const [tab] = await db.insert(schema.tabs).values({
      venueId: req.params.venueId, tableId: tableId ?? null, reservationId: b.reservationId ?? null, guestId, openedBy: user.sub,
      guestName: b.guestName ?? null, partySize,
    }).returning();
    reply.code(201);
    return { ...tab, ...(await billFor(tab)) };
  });

  app.get<{ Params: PT }>('/venues/:venueId/tabs/:tabId', async (req) => {
    await venueAccess(req, req.params.venueId, SERVICE);
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    return { ...tab, ...(await billFor(tab)) };
  });

  app.post<{ Params: PT }>('/venues/:venueId/tabs/:tabId/items', async (req) => {
    const { user } = await venueAccess(req, req.params.venueId, SERVICE);
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    openOnly(tab);
    const { items } = parse(z.object({
      items: z.array(z.object({
        menuItemId: z.string().uuid(), qty: z.number().int().min(1).max(99), note: z.string().trim().max(200).default(''),
        /** Picked extras, by group and choice name. */
        options: z.array(z.object({ group: z.string(), name: z.string() })).max(40).default([]),
      })).min(1).max(50),
    }), req.body);
    const menu = await db.select().from(schema.menuItems)
      .where(and(eq(schema.menuItems.venueId, tab.venueId), inArray(schema.menuItems.id, items.map((i) => i.menuItemId))));
    const rows = items.map((i) => {
      const m = menu.find((x) => x.id === i.menuItemId);
      if (!m || !m.active) throw badRequest('An item is not on the menu');
      const options = pickOptions(m, i.options);
      const unitPrice = m.price + options.reduce((s, o) => s + o.price, 0);
      return { tabId: tab.id, menuItemId: m.id, name: m.name, unitPrice, qty: i.qty, note: i.note, options, station: m.station, addedBy: user.sub };
    });
    await db.insert(schema.tabItems).values(rows);
    return { ...tab, ...(await billFor(tab)) };
  });

  /* "Send": every new item goes to the kitchen or bar screen under one ticket number. */
  app.post<{ Params: PT }>('/venues/:venueId/tabs/:tabId/send', async (req) => {
    await venueAccess(req, req.params.venueId, SERVICE);
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    openOnly(tab);
    const sent = await db.transaction(async (tx) => {
      // One venue at a time so two waiters never get the same ticket number.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'ticket:' + tab.venueId}))`);
      const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${schema.tabItems.ticketNo}), 0)::int` })
        .from(schema.tabItems).innerJoin(schema.tabs, eq(schema.tabs.id, schema.tabItems.tabId))
        .where(eq(schema.tabs.venueId, tab.venueId));
      return tx.update(schema.tabItems).set({ status: 'sent', ticketNo: n + 1, sentAt: new Date() })
        .where(and(eq(schema.tabItems.tabId, tab.id), eq(schema.tabItems.status, 'new'))).returning();
    });
    return { sent: sent.length, ticketNo: sent[0]?.ticketNo ?? null, items: sent };
  });

  /* Take one off: a given line, or the newest of an item (not sent yet first). Sent items need a manager. */
  app.post<{ Params: PT }>('/venues/:venueId/tabs/:tabId/remove', async (req) => {
    const { role } = await venueAccess(req, req.params.venueId, SERVICE);
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    openOnly(tab);
    const b = parse(z.object({ menuItemId: z.string().uuid().optional(), itemId: z.string().uuid().optional() })
      .refine((x) => x.menuItemId || x.itemId, 'Say which item'), req.body);
    const rows = await db.select().from(schema.tabItems)
      .where(and(eq(schema.tabItems.tabId, tab.id), ne(schema.tabItems.status, 'void'),
        b.itemId ? eq(schema.tabItems.id, b.itemId) : eq(schema.tabItems.menuItemId, b.menuItemId!)))
      .orderBy(desc(schema.tabItems.createdAt));
    const it = rows.find((r) => r.status === 'new') ?? rows[0];
    if (!it) throw notFound('Item not on this bill');
    if (it.status !== 'new' && !MANAGERS.includes(role)) throw forbidden('Ask a manager to remove an item that was sent to the bar');
    if (it.qty > 1) await db.update(schema.tabItems).set({ qty: it.qty - 1 }).where(eq(schema.tabItems.id, it.id));
    else await db.update(schema.tabItems).set({ status: 'void' }).where(eq(schema.tabItems.id, it.id));
    return { ...tab, ...(await billFor(tab)) };
  });

  /* The table asked for the bill: shows on the floor map. */
  app.post<{ Params: PT }>('/venues/:venueId/tabs/:tabId/ask-bill', async (req) => {
    await venueAccess(req, req.params.venueId, SERVICE);
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    openOnly(tab);
    const [u] = await db.update(schema.tabs).set({ billRequestedAt: new Date() }).where(eq(schema.tabs.id, tab.id)).returning();
    return u;
  });

  app.post<{ Params: PT & { itemId: string } }>('/venues/:venueId/tabs/:tabId/items/:itemId/void', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    openOnly(tab);
    const [it] = await db.update(schema.tabItems).set({ status: 'void' })
      .where(and(eq(schema.tabItems.id, req.params.itemId), eq(schema.tabItems.tabId, tab.id), ne(schema.tabItems.status, 'void'))).returning();
    if (!it) throw notFound('Item not found');
    return { ...tab, ...(await billFor(tab)) };
  });

  /**
   * Take part of the bill: split between friends, or part cash part card.
   * When the parts reach the total the bill closes and the table is free.
   */
  app.post<{ Params: PT }>('/venues/:venueId/tabs/:tabId/payments', async (req) => {
    const { user } = await venueAccess(req, req.params.venueId, SERVICE);
    const b = parse(z.object({
      method: z.enum(['card', 'cash', 'instapay', 'wallet']), amount: z.number().int().min(1), label: z.string().trim().max(40).default(''),
    }), req.body);
    const res = await db.transaction(async (tx) => {
      // One payment at a time per bill, so two waiters can't overpay it.
      await tx.execute(sql`select 1 from tabs where id = ${req.params.tabId} for update`);
      const tab = await loadTab(req.params.venueId, req.params.tabId);
      openOnly(tab);
      const { bill } = await billFor(tab);
      if (b.amount > bill.remaining) throw badRequest(`Only ${(bill.remaining / 100).toLocaleString('en-US')} EGP is left on this bill`, 'over_pay');
      await tx.insert(schema.tabPayments).values({ venueId: tab.venueId, tabId: tab.id, amount: b.amount, method: b.method, label: b.label, takenBy: user.sub });
      return { tab, closes: b.amount === bill.remaining };
    });
    if (res.closes) {
      const paid = (await onTabPaid(res.tab.id, b.method)) ?? (await loadTab(req.params.venueId, req.params.tabId));
      return { ...paid, ...(await billFor(paid)) };
    }
    return { ...res.tab, ...(await billFor(res.tab)) };
  });

  /* Undo a part payment typed by mistake (managers, open bills only). */
  app.delete<{ Params: PT & { paymentId: string } }>('/venues/:venueId/tabs/:tabId/payments/:paymentId', async (req) => {
    const { role } = await venueAccess(req, req.params.venueId, MANAGERS);
    if (!MANAGERS.includes(role)) throw forbidden('Ask a manager to undo a payment');
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    openOnly(tab);
    const [d] = await db.delete(schema.tabPayments).where(and(eq(schema.tabPayments.id, req.params.paymentId), eq(schema.tabPayments.tabId, tab.id))).returning();
    if (!d) throw notFound('Payment not found');
    return { ...tab, ...(await billFor(tab)) };
  });

  /**
   * Close the bill. Cash / card machine / InstaPay / wallet are confirmed by
   * staff on the spot. "paymob" returns a link the guest pays on their phone.
   */
  app.post<{ Params: PT }>('/venues/:venueId/tabs/:tabId/pay', async (req) => {
    await venueAccess(req, req.params.venueId, SERVICE);
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    openOnly(tab);
    const { method } = parse(z.object({ method: z.enum(['card', 'cash', 'instapay', 'wallet', 'paymob']) }), req.body);
    const { bill } = await billFor(tab);
    if (method === 'paymob' && bill.remaining > 0) {
      let customer = { firstName: 'Guest', lastName: '', email: null as string | null, phone: '+200000000000' };
      if (tab.guestId) {
        const [g] = await db.select().from(schema.guests).where(eq(schema.guests.id, tab.guestId));
        if (g) customer = { firstName: g.firstName, lastName: g.lastName, email: g.email, phone: g.phone };
      }
      const pay = await startPayment({
        venueId: tab.venueId, purpose: 'tab', refId: tab.id, amount: bill.remaining, description: 'Table bill',
        customer, redirectUrl: `${config.publicAppUrl}/paid`,
      });
      return { status: 'pending', bill, ...pay };
    }
    const paid = await onTabPaid(tab.id, bill.total === 0 ? 'free' : method);
    if (!paid) throw conflict('This bill is closed', 'tab_closed');
    return { status: 'paid', bill, tab: paid };
  });
}

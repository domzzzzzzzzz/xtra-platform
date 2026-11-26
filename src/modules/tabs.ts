import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, venueAccess, MANAGERS, SERVICE } from '../lib/http.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { computeBill } from '../lib/pricing.js';
import { config } from '../config.js';
import { recordSpend } from './guests-service.js';
import { startPayment } from './payments.js';

type P = { venueId: string };
type PT = P & { tabId: string };
type Tab = typeof schema.tabs.$inferSelect;

/** The bill for a tab right now (or as frozen when paid). */
export async function billFor(tab: Tab) {
  const items = await db.select().from(schema.tabItems).where(eq(schema.tabItems.tabId, tab.id)).orderBy(asc(schema.tabItems.createdAt));
  if (tab.status === 'paid') {
    return { items, bill: { subtotal: tab.subtotal, minSpend: tab.subtotal + tab.minSpendTopUp, minSpendTopUp: tab.minSpendTopUp, service: tab.service, vat: tab.vat, depositCredit: tab.depositCredit, total: tab.total } };
  }
  const [venue] = await db.select().from(schema.venues).where(eq(schema.venues.id, tab.venueId));
  let minSpend = 0;
  let depositPaid = 0;
  if (tab.reservationId) {
    const [r] = await db.select().from(schema.reservations).where(eq(schema.reservations.id, tab.reservationId));
    if (r) {
      minSpend = r.minSpend;
      depositPaid = r.depositPaidAt ? r.depositAmount : 0;
    }
  } else if (tab.tableId) {
    const [t] = await db.select().from(schema.floorItems).where(eq(schema.floorItems.id, tab.tableId));
    if (t?.zoneId) {
      const [zone] = await db.select().from(schema.floorItems).where(eq(schema.floorItems.id, t.zoneId));
      minSpend = zone?.minSpend ?? 0;
    }
  }
  const bill = computeBill({
    items: items.filter((i) => i.status !== 'void'), minSpend, serviceBps: venue.serviceBps, vatBps: venue.vatBps, depositPaid,
  });
  return { items, bill };
}

async function loadTab(venueId: string, tabId: string) {
  const [t] = await db.select().from(schema.tabs).where(and(eq(schema.tabs.id, tabId), eq(schema.tabs.venueId, venueId)));
  if (!t) throw notFound('Bill not found');
  return t;
}

const openOnly = (t: Tab) => {
  if (t.status !== 'open') throw conflict('This bill is closed', 'tab_closed');
};

/** Freeze totals, record the guest's spend and points. Safe to call twice. */
export async function onTabPaid(tabId: string, method: (typeof schema.payMethod.enumValues)[number]) {
  const [tab] = await db.select().from(schema.tabs).where(eq(schema.tabs.id, tabId));
  if (!tab || tab.status !== 'open') return null;
  const { bill } = await billFor(tab);
  return db.transaction(async (tx) => {
    const [u] = await tx.update(schema.tabs).set({
      status: 'paid', subtotal: bill.subtotal, minSpendTopUp: bill.minSpendTopUp, service: bill.service, vat: bill.vat,
      depositCredit: bill.depositCredit, total: bill.total, payMethod: method, paidAt: new Date(),
    }).where(and(eq(schema.tabs.id, tab.id), eq(schema.tabs.status, 'open'))).returning();
    if (!u) return null;
    if (u.guestId) await recordSpend(tx, u.venueId, u.guestId, bill.total + bill.depositCredit, u.id, 'bill', false);
    if (u.reservationId) await tx.update(schema.reservations).set({ status: 'completed' }).where(eq(schema.reservations.id, u.reservationId));
    return u;
  });
}

export default async function tabs(app: FastifyInstance) {
  /* ---------- menu */
  app.get<{ Params: P }>('/venues/:venueId/menu', async (req) => {
    await venueAccess(req, req.params.venueId);
    return db.select().from(schema.menuItems).where(eq(schema.menuItems.venueId, req.params.venueId))
      .orderBy(asc(schema.menuItems.category), asc(schema.menuItems.sort), asc(schema.menuItems.name));
  });

  const menuItem = z.object({
    category: z.string().min(1), name: z.string().min(1), description: z.string().default(''),
    price: z.number().int().min(0), active: z.boolean().default(true), sort: z.number().int().default(0),
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
    const b = parse(z.object({ tableId: z.string().uuid().optional(), reservationId: z.string().uuid().optional() }), req.body ?? {});
    let { tableId } = b;
    let guestId: string | null = null;
    if (b.reservationId) {
      const [r] = await db.select().from(schema.reservations)
        .where(and(eq(schema.reservations.id, b.reservationId), eq(schema.reservations.venueId, req.params.venueId)));
      if (!r) throw notFound('Booking not found');
      tableId = tableId ?? r.tableId ?? undefined;
      guestId = r.guestId;
      const [dup] = await db.select({ id: schema.tabs.id }).from(schema.tabs).where(and(eq(schema.tabs.reservationId, r.id), eq(schema.tabs.status, 'open')));
      if (dup) throw conflict('This booking already has an open bill', 'tab_exists');
    }
    if (tableId) {
      const [t] = await db.select().from(schema.floorItems).where(and(eq(schema.floorItems.id, tableId), eq(schema.floorItems.venueId, req.params.venueId)));
      if (!t) throw badRequest('Unknown table');
      const [busy] = await db.select({ id: schema.tabs.id }).from(schema.tabs).where(and(eq(schema.tabs.tableId, tableId), eq(schema.tabs.status, 'open')));
      if (busy) throw conflict('This table already has an open bill', 'tab_exists');
    }
    const [tab] = await db.insert(schema.tabs).values({
      venueId: req.params.venueId, tableId: tableId ?? null, reservationId: b.reservationId ?? null, guestId, openedBy: user.sub,
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
      items: z.array(z.object({ menuItemId: z.string().uuid(), qty: z.number().int().min(1).max(99), note: z.string().max(200).default('') })).min(1).max(50),
    }), req.body);
    const menu = await db.select().from(schema.menuItems)
      .where(and(eq(schema.menuItems.venueId, tab.venueId), inArray(schema.menuItems.id, items.map((i) => i.menuItemId))));
    const rows = items.map((i) => {
      const m = menu.find((x) => x.id === i.menuItemId);
      if (!m || !m.active) throw badRequest('An item is not on the menu');
      return { tabId: tab.id, menuItemId: m.id, name: m.name, unitPrice: m.price, qty: i.qty, note: i.note, addedBy: user.sub };
    });
    await db.insert(schema.tabItems).values(rows);
    return { ...tab, ...(await billFor(tab)) };
  });

  /* "Send to bar": every new item on the tab goes out. */
  app.post<{ Params: PT }>('/venues/:venueId/tabs/:tabId/send', async (req) => {
    await venueAccess(req, req.params.venueId, SERVICE);
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    openOnly(tab);
    const sent = await db.update(schema.tabItems).set({ status: 'sent' })
      .where(and(eq(schema.tabItems.tabId, tab.id), eq(schema.tabItems.status, 'new'))).returning();
    return { sent: sent.length, items: sent };
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
   * Close the bill. Cash / card machine / InstaPay / wallet are confirmed by
   * staff on the spot. "paymob" returns a link the guest pays on their phone.
   */
  app.post<{ Params: PT }>('/venues/:venueId/tabs/:tabId/pay', async (req) => {
    await venueAccess(req, req.params.venueId, SERVICE);
    const tab = await loadTab(req.params.venueId, req.params.tabId);
    openOnly(tab);
    const { method } = parse(z.object({ method: z.enum(['card', 'cash', 'instapay', 'wallet', 'paymob']) }), req.body);
    const { bill } = await billFor(tab);
    if (method === 'paymob' && bill.total > 0) {
      let customer = { firstName: 'Guest', lastName: '', email: null as string | null, phone: '+200000000000' };
      if (tab.guestId) {
        const [g] = await db.select().from(schema.guests).where(eq(schema.guests.id, tab.guestId));
        if (g) customer = { firstName: g.firstName, lastName: g.lastName, email: g.email, phone: g.phone };
      }
      const pay = await startPayment({
        venueId: tab.venueId, purpose: 'tab', refId: tab.id, amount: bill.total, description: 'Table bill',
        customer, redirectUrl: `${config.publicAppUrl}/paid`,
      });
      return { status: 'pending', bill, ...pay };
    }
    const paid = await onTabPaid(tab.id, bill.total === 0 ? 'free' : method);
    return { status: 'paid', bill, tab: paid };
  });
}

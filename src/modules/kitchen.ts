import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, venueAccess } from '../lib/http.js';
import { notFound } from '../lib/errors.js';

/**
 * Kitchen and bar screen. Each "Send" from a waiter makes one ticket number;
 * a ticket shows here once per station that has items on it. The cook taps
 * Ready, the waiter sees the items as ready on the order.
 */
type P = { venueId: string };
const station = z.enum(['kitchen', 'bar', 'all']).default('all');

export default async function kitchen(app: FastifyInstance) {
  app.get<{ Params: P; Querystring: { station?: string } }>('/venues/:venueId/kitchen', async (req) => {
    await venueAccess(req, req.params.venueId);
    const st = parse(station, req.query.station);
    const since = new Date(Date.now() - 20 * 60_000);
    const rows = await db.select({ it: schema.tabItems, tab: schema.tabs, waiter: schema.users.name })
      .from(schema.tabItems)
      .innerJoin(schema.tabs, eq(schema.tabs.id, schema.tabItems.tabId))
      .leftJoin(schema.users, eq(schema.users.id, schema.tabItems.addedBy))
      .where(and(
        eq(schema.tabs.venueId, req.params.venueId), eq(schema.tabs.status, 'open'), isNotNull(schema.tabItems.ticketNo),
        inArray(schema.tabItems.status, ['sent', 'served']),
        st === 'all' ? undefined : eq(schema.tabItems.station, st),
      ))
      .orderBy(asc(schema.tabItems.sentAt), asc(schema.tabItems.createdAt));
    const tableIds = [...new Set(rows.map((r) => r.tab.tableId).filter(Boolean))] as string[];
    const tables = tableIds.length
      ? await db.select({ id: schema.floorItems.id, name: schema.floorItems.label }).from(schema.floorItems).where(inArray(schema.floorItems.id, tableIds))
      : [];
    const guestIds = [...new Set(rows.map((r) => r.tab.guestId).filter(Boolean))] as string[];
    const guests = guestIds.length
      ? await db.select({ id: schema.guests.id, firstName: schema.guests.firstName }).from(schema.guests).where(inArray(schema.guests.id, guestIds))
      : [];
    const map = new Map<string, any>();
    for (const { it, tab, waiter } of rows) {
      const key = `${it.ticketNo}:${it.station}`;
      let t = map.get(key);
      if (!t) {
        t = {
          key, ticketNo: it.ticketNo, station: it.station, tabId: tab.id, sentAt: it.sentAt,
          table: tables.find((x) => x.id === tab.tableId)?.name ?? null,
          guest: tab.guestName || guests.find((g) => g.id === tab.guestId)?.firstName || null,
          waiter: waiter ?? null, items: [] as any[], readyAt: null as Date | null,
        };
        map.set(key, t);
      }
      t.items.push({ id: it.id, name: it.name, qty: it.qty, note: it.note, options: it.options, ready: it.status === 'served' });
    }
    const list = [...map.values()].sort((a, b) => a.ticketNo - b.ticketNo || (a.station === 'kitchen' ? -1 : 1)).map((t) => {
      const ready = t.items.every((i: any) => i.ready);
      const readyAt = ready ? rows.filter((r) => `${r.it.ticketNo}:${r.it.station}` === t.key).reduce((m, r) => (r.it.readyAt && r.it.readyAt > m ? r.it.readyAt : m), new Date(0)) : null;
      return { ...t, ready, readyAt };
    });
    return {
      open: list.filter((t) => !t.ready),
      // Done in the last 20 minutes, so a ticket tapped by mistake can come back.
      done: list.filter((t) => t.ready && t.readyAt > since).sort((a, b) => +b.readyAt - +a.readyAt).slice(0, 12),
    };
  });

  /* Ready (or back to open) for one ticket at one station. */
  app.post<{ Params: P & { ticketNo: string } }>('/venues/:venueId/kitchen/:ticketNo/ready', async (req) => {
    await venueAccess(req, req.params.venueId);
    const b = parse(z.object({ station: z.enum(schema.STATIONS), ready: z.boolean().default(true) }), req.body ?? {});
    const no = parse(z.coerce.number().int().min(1), req.params.ticketNo);
    const ids = await db.select({ id: schema.tabItems.id }).from(schema.tabItems)
      .innerJoin(schema.tabs, eq(schema.tabs.id, schema.tabItems.tabId))
      .where(and(eq(schema.tabs.venueId, req.params.venueId), eq(schema.tabItems.ticketNo, no), eq(schema.tabItems.station, b.station),
        inArray(schema.tabItems.status, b.ready ? ['sent'] : ['served'])));
    if (!ids.length) throw notFound('Ticket not found');
    await db.update(schema.tabItems).set(b.ready ? { status: 'served', readyAt: new Date() } : { status: 'sent', readyAt: null })
      .where(inArray(schema.tabItems.id, ids.map((i) => i.id)));
    return { ok: true, items: ids.length };
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { byNight } from '../lib/dates.js';
import { parse, venueAccess, MANAGERS } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';

type P = { venueId: string };

const floorItem = z.object({
  id: z.string().uuid().optional(),
  /** Client-side id so children can point to a parent that is new in this save. */
  ref: z.string().optional(),
  parentRef: z.string().optional(),
  zoneRef: z.string().optional(),
  kind: z.enum(schema.floorItemKind.enumValues),
  label: z.string().default(''),
  shape: z.string().nullish(),
  x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(),
  rotation: z.number().default(0),
  seats: z.number().int().min(0).default(0),
  enabled: z.boolean().default(true),
  minSpend: z.number().int().min(0).default(0),
  deposit: z.number().int().min(0).default(0),
  color: z.string().nullish(),
  sort: z.number().int().default(0),
});

const slot = z.object({
  weekday: z.number().int().min(0).max(6).nullable().default(null),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/),
  capacity: z.number().int().min(0).default(0),
  maxBookings: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

const settingsBody = z.object({
  where: z.string().max(80),
  color: z.string().max(20),
  firstSlot: z.number().int().min(0).max(36 * 60),
  lastSlot: z.number().int().min(0).max(36 * 60),
  slotStep: z.number().int().min(15).max(240),
  maxPerSlot: z.number().int().min(0).max(500),
  approval: z.enum(['manual', 'auto']),
  askNames: z.boolean(),
  mapPick: z.boolean(),
  socials: z.record(z.string().max(30), z.string().max(200)),
  connections: z.record(z.string().max(30), z.boolean()),
  automations: z.record(z.string().max(30), z.boolean()),
}).partial();

export default async function venues(app: FastifyInstance) {
  app.get<{ Params: P }>('/venues/:venueId', async (req) => {
    await venueAccess(req, req.params.venueId);
    const [v] = await db.select().from(schema.venues).where(eq(schema.venues.id, req.params.venueId));
    if (!v) throw notFound('Venue not found');
    return v;
  });

  app.patch<{ Params: P }>('/venues/:venueId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({
      name: z.string().min(2), logoUrl: z.string().url().nullable(), phone: z.string().nullable(), email: z.string().email().nullable(),
      address: z.string().nullable(), mapUrl: z.string().url().nullable(), instagram: z.string().nullable(), tiktok: z.string().nullable(),
      notifyChannel: z.enum(schema.notifyChannel.enumValues),
      serviceBps: z.number().int().min(0).max(3000), vatBps: z.number().int().min(0).max(3000),
      depositPerPerson: z.number().int().min(0), pointsPerAmount: z.number().int().min(0),
      settings: settingsBody,
    }).partial(), req.body);
    const { settings, ...rest } = b;
    const [cur] = await db.select({ settings: schema.venues.settings }).from(schema.venues).where(eq(schema.venues.id, req.params.venueId));
    const [v] = await db.update(schema.venues).set({ ...rest, ...(settings ? { settings: { ...cur?.settings, ...settings } } : {}) })
      .where(eq(schema.venues.id, req.params.venueId)).returning();
    return v;
  });

  /* ---------- staff */
  app.get<{ Params: P }>('/venues/:venueId/staff', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    return db.select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.venueStaff.role })
      .from(schema.venueStaff).innerJoin(schema.users, eq(schema.users.id, schema.venueStaff.userId))
      .where(eq(schema.venueStaff.venueId, req.params.venueId));
  });

  app.post<{ Params: P }>('/venues/:venueId/staff', async (req, reply) => {
    const { role: myRole } = await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({
      name: z.string().min(2), email: z.string().email(), password: z.string().min(8),
      role: z.enum(schema.staffRole.enumValues),
    }), req.body);
    if (b.role === 'owner' && myRole !== 'owner') throw badRequest('Only an owner can add another owner');
    const email = b.email.toLowerCase();
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (!user) [user] = await db.insert(schema.users).values({ email, name: b.name, passwordHash: await bcrypt.hash(b.password, 10) }).returning();
    await db.insert(schema.venueStaff).values({ venueId: req.params.venueId, userId: user.id, role: b.role })
      .onConflictDoUpdate({ target: [schema.venueStaff.venueId, schema.venueStaff.userId], set: { role: b.role } });
    reply.code(201);
    return { userId: user.id, name: user.name, email: user.email, role: b.role };
  });

  app.delete<{ Params: P & { userId: string } }>('/venues/:venueId/staff/:userId', async (req) => {
    const { user } = await venueAccess(req, req.params.venueId, MANAGERS);
    if (user.sub === req.params.userId) throw badRequest('You cannot remove yourself');
    await db.delete(schema.venueStaff).where(and(eq(schema.venueStaff.venueId, req.params.venueId), eq(schema.venueStaff.userId, req.params.userId)));
    return { ok: true };
  });

  /* ---------- floor map */
  app.get<{ Params: P }>('/venues/:venueId/floor', async (req) => {
    await venueAccess(req, req.params.venueId);
    return db.select().from(schema.floorItems).where(eq(schema.floorItems.venueId, req.params.venueId)).orderBy(asc(schema.floorItems.sort));
  });

  /**
   * Save the whole map from the editor. Items with an id are updated, items
   * without one are created, and items missing from the list are deleted.
   */
  app.put<{ Params: P }>('/venues/:venueId/floor', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const { venueId } = req.params;
    const items = parse(z.object({ items: z.array(floorItem).max(2000) }), req.body).items;
    return db.transaction(async (tx) => {
      const existing = await tx.select({ id: schema.floorItems.id }).from(schema.floorItems).where(eq(schema.floorItems.venueId, venueId));
      const existingIds = new Set(existing.map((e) => e.id));
      for (const it of items) if (it.id && !existingIds.has(it.id)) throw badRequest('Unknown floor item');
      const keep = new Set(items.filter((i) => i.id).map((i) => i.id!));
      const gone = [...existingIds].filter((i) => !keep.has(i));
      if (gone.length) await tx.delete(schema.floorItems).where(inArray(schema.floorItems.id, gone));

      // First pass: write every item, remember ref -> id.
      const refToId = new Map<string, string>();
      const saved: { id: string; src: z.infer<typeof floorItem> }[] = [];
      for (const it of items) {
        const values = {
          venueId, kind: it.kind, label: it.label, shape: it.shape ?? null, x: it.x, y: it.y, w: it.w, h: it.h,
          rotation: it.rotation, seats: it.seats, enabled: it.enabled, minSpend: it.minSpend, deposit: it.deposit, color: it.color ?? null, sort: it.sort,
        };
        let rowId: string;
        if (it.id) {
          await tx.update(schema.floorItems).set(values).where(eq(schema.floorItems.id, it.id));
          rowId = it.id;
        } else {
          [{ id: rowId }] = await tx.insert(schema.floorItems).values(values).returning({ id: schema.floorItems.id });
        }
        if (it.ref) refToId.set(it.ref, rowId);
        refToId.set(rowId, rowId);
        saved.push({ id: rowId, src: it });
      }
      // Second pass: links. A ref may be a client ref or an existing id.
      for (const { id: rowId, src } of saved) {
        const parentId = src.parentRef ? refToId.get(src.parentRef) ?? null : null;
        let zoneId = src.zoneRef ? refToId.get(src.zoneRef) ?? null : null;
        if (!zoneId && src.kind !== 'zone' && src.kind !== 'chair') zoneId = zoneContaining(saved, src);
        await tx.update(schema.floorItems).set({ parentId, zoneId }).where(eq(schema.floorItems.id, rowId));
      }
      return tx.select().from(schema.floorItems).where(eq(schema.floorItems.venueId, venueId)).orderBy(asc(schema.floorItems.sort));
    });
  });

  /* Switch one chair / sofa / table on or off. */
  app.patch<{ Params: P & { itemId: string } }>('/venues/:venueId/floor/:itemId', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const b = parse(z.object({ enabled: z.boolean().optional(), label: z.string().optional(), minSpend: z.number().int().min(0).optional(), deposit: z.number().int().min(0).optional(), seats: z.number().int().min(0).optional() }), req.body);
    const [it] = await db.update(schema.floorItems).set(b)
      .where(and(eq(schema.floorItems.id, req.params.itemId), eq(schema.floorItems.venueId, req.params.venueId))).returning();
    if (!it) throw notFound('Item not found');
    return it;
  });

  /* ---------- time slots */
  app.get<{ Params: P }>('/venues/:venueId/slots', async (req) => {
    await venueAccess(req, req.params.venueId);
    return (await db.select().from(schema.timeSlots).where(eq(schema.timeSlots.venueId, req.params.venueId))).sort(byNight);
  });

  app.put<{ Params: P }>('/venues/:venueId/slots', async (req) => {
    await venueAccess(req, req.params.venueId, MANAGERS);
    const { slots } = parse(z.object({ slots: z.array(slot).max(100) }), req.body);
    const { venueId } = req.params;
    return db.transaction(async (tx) => {
      // Existing bookings keep their slot label, so replacing slots is safe.
      await tx.delete(schema.timeSlots).where(eq(schema.timeSlots.venueId, venueId));
      if (slots.length) await tx.insert(schema.timeSlots).values(slots.map((s) => ({ ...s, venueId })));
      return tx.select().from(schema.timeSlots).where(eq(schema.timeSlots.venueId, venueId)).orderBy(asc(schema.timeSlots.startsAt));
    });
  });
}

/** The zone a table sits in: the zone that contains its centre point. */
function zoneContaining(all: { id: string; src: z.infer<typeof floorItem> }[], it: z.infer<typeof floorItem>) {
  const cx = it.x + it.w / 2;
  const cy = it.y + it.h / 2;
  const z = all.find(({ src: s }) => s.kind === 'zone' && cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h);
  return z?.id ?? null;
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, staffUser, superAdmin } from '../lib/http.js';
import { config } from '../config.js';
import { appleWalletReady, googleWalletReady } from '../integrations/wallet.js';
import { paymobEnabled } from '../integrations/paymob.js';
import { slugify } from '../lib/codes.js';
import { conflict, notFound } from '../lib/errors.js';
import { FEATURES } from '../lib/access.js';

export async function getPlatformSettings() {
  const [s] = await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.id, 1));
  if (s) return s;
  const [created] = await db.insert(schema.platformSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(schema.platformSettings).where(eq(schema.platformSettings.id, 1)))[0];
}

export default async function admin(app: FastifyInstance) {
  /* What every staff screen needs: ticket fees and which integrations are live. */
  app.get('/platform', async (req) => {
    await staffUser(req);
    const s = await getPlatformSettings();
    return {
      bookingFeeBps: s.bookingFeeBps, feeVatBps: s.feeVatBps,
      integrations: {
        paymob: paymobEnabled(), whatsapp: Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId), email: Boolean(config.email.resendKey),
        googleWallet: googleWalletReady(), appleWallet: appleWalletReady(),
      },
    };
  });

  app.get('/admin/settings', async (req) => {
    await superAdmin(req);
    return getPlatformSettings();
  });

  /* Booking fee % and VAT on fees, editable by XTRA admins. */
  app.put('/admin/settings', async (req) => {
    await superAdmin(req);
    const b = parse(z.object({ bookingFeeBps: z.number().int().min(0).max(5000), feeVatBps: z.number().int().min(0).max(3000) }), req.body);
    await getPlatformSettings();
    const [s] = await db.update(schema.platformSettings).set({ ...b, updatedAt: new Date() }).where(eq(schema.platformSettings.id, 1)).returning();
    return s;
  });

  /* Every venue with its owners and how many staff accounts it has. */
  app.get('/admin/venues', async (req) => {
    await superAdmin(req);
    const venues = await db.select().from(schema.venues).orderBy(asc(schema.venues.name));
    const staff = await db.select({ venueId: schema.venueStaff.venueId, role: schema.venueStaff.role, roleId: schema.venueStaff.roleId, name: schema.users.name, email: schema.users.email })
      .from(schema.venueStaff).innerJoin(schema.users, eq(schema.users.id, schema.venueStaff.userId));
    return venues.map((v) => {
      const mine = staff.filter((s) => s.venueId === v.id);
      return { ...v, owners: mine.filter((s) => s.role === 'owner' && !s.roleId).map(({ name, email }) => ({ name, email })), staffCount: mine.length };
    });
  });

  /* Switch modules on or off for a venue, rename it, or pause it. */
  app.patch<{ Params: { venueId: string } }>('/admin/venues/:venueId', async (req) => {
    await superAdmin(req);
    const b = parse(z.object({
      name: z.string().min(2).max(80), active: z.boolean(), features: z.array(z.enum(FEATURES)).max(FEATURES.length),
    }).partial(), req.body);
    const [v] = await db.update(schema.venues).set(b).where(eq(schema.venues.id, parse(z.string().uuid(), req.params.venueId))).returning();
    if (!v) throw notFound('Venue not found');
    return v;
  });

  /* Onboard a new venue with its owner account. */
  app.post('/admin/venues', async (req, reply) => {
    await superAdmin(req);
    const b = parse(z.object({
      name: z.string().min(2),
      slug: z.string().optional(),
      features: z.array(z.enum(FEATURES)).max(FEATURES.length).optional(),
      owner: z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8) }),
    }), req.body);
    const slug = slugify(b.slug ?? b.name);
    const result = await db.transaction(async (tx) => {
      const [taken] = await tx.select({ id: schema.venues.id }).from(schema.venues).where(eq(schema.venues.slug, slug));
      if (taken) throw conflict('That venue link is taken', 'slug_taken');
      const [venue] = await tx.insert(schema.venues).values({ name: b.name, slug, ...(b.features ? { features: b.features } : {}) }).returning();
      const email = b.owner.email.toLowerCase();
      let [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
      if (!user) {
        [user] = await tx.insert(schema.users).values({ email, name: b.owner.name, passwordHash: await bcrypt.hash(b.owner.password, 10) }).returning();
      }
      await tx.insert(schema.venueStaff).values({ venueId: venue.id, userId: user.id, role: 'owner' });
      await tx.insert(schema.communityTiers).values([
        { venueId: venue.id, name: 'Member', minSpend: 0, perks: ['Birthday welcome drink'], sort: 0 },
        { venueId: venue.id, name: 'Silver', minSpend: 5_000_000, perks: ['Priority booking', 'Skip the line'], sort: 1 },
        { venueId: venue.id, name: 'Gold', minSpend: 15_000_000, perks: ['Guaranteed table', 'Free entry +1', 'Host on WhatsApp'], sort: 2 },
      ]);
      return { venue, owner: { id: user.id, email: user.email, name: user.name } };
    });
    reply.code(201);
    return result;
  });
}

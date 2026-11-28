/**
 * Your own sign-in (name, email, password) and the list of XTRA admins.
 * Changing the password signs out every other device.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, staffUser, superAdmin } from '../lib/http.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';

const password = z.string().min(8, 'at least 8 characters').max(200);
const emailTaken = async (email: string, notId?: string) =>
  (await db.select({ id: schema.users.id }).from(schema.users)
    .where(notId ? and(eq(schema.users.email, email), ne(schema.users.id, notId)) : eq(schema.users.email, email))).length > 0;

export default async function accounts(app: FastifyInstance) {
  /* Change my name, sign-in email or password. Needs the current password. */
  app.put('/auth/account', async (req) => {
    const t = await staffUser(req);
    const b = parse(z.object({
      currentPassword: z.string().min(1),
      name: z.string().trim().min(1).max(80).optional(),
      email: z.string().trim().toLowerCase().email().optional(),
      newPassword: password.optional(),
    }), req.body);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, t.sub));
    if (!(await bcrypt.compare(b.currentPassword, u.passwordHash))) throw new AppError(400, 'bad_password', 'Your current password is not right');
    if (b.email && b.email !== u.email && (await emailTaken(b.email, u.id))) throw conflict('Another account already uses this email');
    const set: Partial<typeof schema.users.$inferInsert> = {};
    if (b.name) set.name = b.name;
    if (b.email) set.email = b.email;
    if (b.newPassword) Object.assign(set, { passwordHash: await bcrypt.hash(b.newPassword, 10), passwordChangedAt: new Date() });
    const [after] = Object.keys(set).length ? await db.update(schema.users).set(set).where(eq(schema.users.id, u.id)).returning() : [u];
    // A new sign-in for this device, so only the others are signed out.
    const token = app.jwt.sign({ kind: 'staff', sub: after.id, sa: after.isSuperAdmin }, { expiresIn: '30d' });
    return { token, user: { id: after.id, name: after.name, email: after.email, isSuperAdmin: after.isSuperAdmin } };
  });

  app.get('/admin/admins', async (req) => {
    const me = await superAdmin(req);
    const rows = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, createdAt: schema.users.createdAt })
      .from(schema.users).where(eq(schema.users.isSuperAdmin, true)).orderBy(asc(schema.users.createdAt));
    return rows.map((r) => ({ ...r, me: r.id === me.sub }));
  });

  /* A new XTRA admin, or an existing account made admin (its password stays). */
  app.post('/admin/admins', async (req) => {
    await superAdmin(req);
    const b = parse(z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().toLowerCase().email(), password }), req.body);
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, b.email));
    if (existing?.isSuperAdmin) throw conflict('This email is already an admin');
    const [u] = existing
      ? await db.update(schema.users).set({ isSuperAdmin: true }).where(eq(schema.users.id, existing.id)).returning()
      : await db.insert(schema.users).values({ name: b.name, email: b.email, isSuperAdmin: true, passwordHash: await bcrypt.hash(b.password, 10) }).returning();
    return { id: u.id, name: u.name, email: u.email, existing: Boolean(existing) };
  });

  /* Remove an admin. Not yourself, never the last one. Venue staff keep their venue access. */
  app.delete<{ Params: { id: string } }>('/admin/admins/:id', async (req) => {
    const me = await superAdmin(req);
    if (req.params.id === me.sub) throw badRequest('You cannot remove yourself');
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, req.params.id), eq(schema.users.isSuperAdmin, true)));
    if (!u) throw notFound('Admin not found');
    const staff = await db.select({ v: schema.venueStaff.venueId }).from(schema.venueStaff).where(eq(schema.venueStaff.userId, u.id)).limit(1);
    // Someone who also works at a venue keeps that; otherwise the account goes
    // (or, if it is named on past records, it simply loses admin rights).
    const demote = () => db.update(schema.users).set({ isSuperAdmin: false }).where(eq(schema.users.id, u.id));
    if (staff.length) await demote();
    else await db.delete(schema.users).where(eq(schema.users.id, u.id)).catch(demote);
    return { ok: true };
  });
}

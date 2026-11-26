import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, staffUser } from '../lib/http.js';
import { AppError } from '../lib/errors.js';
import { normalizePhone, otpCode, sha256 } from '../lib/codes.js';
import { send } from '../integrations/notify.js';
import { upsertGuest } from './guests-service.js';

export default async function auth(app: FastifyInstance) {
  /* Staff sign in (venue owners, managers, door, waiters, XTRA admins). */
  app.post('/auth/login', async (req) => {
    const b = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, b.email.toLowerCase()));
    if (!u || !(await bcrypt.compare(b.password, u.passwordHash))) throw new AppError(401, 'bad_login', 'Wrong email or password');
    const token = app.jwt.sign({ kind: 'staff', sub: u.id, sa: u.isSuperAdmin }, { expiresIn: '30d' });
    return { token, user: { id: u.id, name: u.name, email: u.email, isSuperAdmin: u.isSuperAdmin } };
  });

  app.get('/auth/me', async (req) => {
    const t = await staffUser(req);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, t.sub));
    if (!u) throw new AppError(401, 'unauthorized', 'Please sign in');
    const venues = await db.select({ id: schema.venues.id, name: schema.venues.name, slug: schema.venues.slug, role: schema.venueStaff.role })
      .from(schema.venueStaff).innerJoin(schema.venues, eq(schema.venues.id, schema.venueStaff.venueId))
      .where(eq(schema.venueStaff.userId, u.id));
    return { user: { id: u.id, name: u.name, email: u.email, isSuperAdmin: u.isSuperAdmin }, venues };
  });

  /* Guest sign in with a one-time code sent by WhatsApp. */
  app.post('/guest/otp', async (req) => {
    const b = parse(z.object({ phone: z.string().min(8) }), req.body);
    const phone = normalizePhone(b.phone);
    const code = otpCode();
    await db.insert(schema.guestOtps).values({ phone, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) });
    await send({ channel: 'whatsapp', to: phone, kind: 'otp', body: `Your XTRA code is ${code}. It expires in 10 minutes.` });
    return { sent: true, ...(process.env.NODE_ENV === 'test' ? { code } : {}) };
  });

  app.post('/guest/verify', async (req) => {
    const b = parse(z.object({ phone: z.string().min(8), code: z.string().length(6), firstName: z.string().optional() }), req.body);
    const phone = normalizePhone(b.phone);
    const [otp] = await db.select().from(schema.guestOtps)
      .where(and(eq(schema.guestOtps.phone, phone), isNull(schema.guestOtps.usedAt), gt(schema.guestOtps.expiresAt, new Date())))
      .orderBy(desc(schema.guestOtps.createdAt)).limit(1);
    if (!otp || otp.attempts >= 5) throw new AppError(400, 'bad_code', 'Code expired. Ask for a new one.');
    if (otp.codeHash !== sha256(`${phone}:${b.code}`)) {
      await db.update(schema.guestOtps).set({ attempts: otp.attempts + 1 }).where(eq(schema.guestOtps.id, otp.id));
      throw new AppError(400, 'bad_code', 'Wrong code');
    }
    await db.update(schema.guestOtps).set({ usedAt: new Date() }).where(eq(schema.guestOtps.id, otp.id));
    const guest = await upsertGuest(db, { phone, firstName: b.firstName ?? 'Guest' });
    return { token: app.jwt.sign({ kind: 'guest', sub: guest.id }, { expiresIn: '90d' }), guest };
  });
}

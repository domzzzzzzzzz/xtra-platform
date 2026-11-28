import type { FastifyRequest } from 'fastify';
import { z, ZodTypeAny } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { AppError, forbidden } from './errors.js';
import { PERMS, type Perm, permsOf, ruleFor } from './access.js';

export const parse = <T extends ZodTypeAny>(s: T, data: unknown): z.infer<T> => {
  const r = s.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new AppError(400, 'invalid_input', `${first.path.join('.') || 'input'}: ${first.message}`);
  }
  return r.data;
};

export type StaffToken = { kind: 'staff'; sub: string; sa?: boolean; iat?: number };
export type GuestToken = { kind: 'guest'; sub: string };

export async function staffUser(req: FastifyRequest): Promise<StaffToken> {
  try {
    await req.jwtVerify();
  } catch {
    throw new AppError(401, 'unauthorized', 'Please sign in');
  }
  const u = req.user as StaffToken | GuestToken;
  if (u.kind !== 'staff') throw new AppError(401, 'unauthorized', 'Please sign in');
  // The account must still exist, signed in after its last password change, and
  // admin rights come from the account now, not from when the token was made.
  const [acc] = await db.select({ sa: schema.users.isSuperAdmin, pw: schema.users.passwordChangedAt }).from(schema.users).where(eq(schema.users.id, u.sub));
  if (!acc || (acc.pw && u.iat && u.iat * 1000 < acc.pw.getTime() - 1000)) throw new AppError(401, 'unauthorized', 'Please sign in');
  u.sa = acc.sa;
  return u;
}

export async function guestUser(req: FastifyRequest): Promise<GuestToken> {
  try {
    await req.jwtVerify();
  } catch {
    throw new AppError(401, 'unauthorized', 'Please sign in');
  }
  const u = req.user as StaffToken | GuestToken;
  if (u.kind !== 'guest') throw new AppError(401, 'unauthorized', 'Please sign in');
  return u;
}

export async function superAdmin(req: FastifyRequest) {
  const u = await staffUser(req);
  if (!u.sa) throw forbidden();
  return u;
}

type Role = (typeof schema.staffRole.enumValues)[number];
export const MANAGERS: Role[] = ['owner', 'manager'];
export const FLOOR: Role[] = ['owner', 'manager', 'door', 'waiter'];
export const DOOR: Role[] = ['owner', 'manager', 'door'];
export const SERVICE: Role[] = ['owner', 'manager', 'waiter'];

/**
 * Signed-in staff member of this venue who may use this route. The route's
 * rule in lib/access.ts decides (by screen permission and venue feature);
 * `roles` is only the fallback for a route no rule covers. Super admins pass
 * every permission but still respect the venue's features.
 */
export async function venueAccess(req: FastifyRequest, venueId: string, roles: Role[] = FLOOR) {
  const u = await staffUser(req);
  if (!z.string().uuid().safeParse(venueId).success) throw forbidden();
  const rule = ruleFor(req.method, req.routeOptions.url ?? '');
  const [venue] = await db.select({ features: schema.venues.features }).from(schema.venues).where(eq(schema.venues.id, venueId));
  if (!venue) throw forbidden();
  if (rule?.feature && !venue.features.includes(rule.feature)) {
    throw new AppError(403, 'feature_off', 'This venue does not have this feature. Ask XTRA to switch it on.');
  }
  if (u.sa) return { user: u, role: 'owner' as Role, perms: [...PERMS] as Perm[] };
  const [row] = await db.select({ s: schema.venueStaff, custom: schema.venueRoles.permissions }).from(schema.venueStaff)
    .leftJoin(schema.venueRoles, eq(schema.venueRoles.id, schema.venueStaff.roleId))
    .where(and(eq(schema.venueStaff.venueId, venueId), eq(schema.venueStaff.userId, u.sub)));
  if (!row) throw forbidden();
  const perms = permsOf(row.s, row.s.roleId ? row.custom : null);
  const ok = rule ? rule.any === '*' || rule.any.some((p) => perms.includes(p)) : !row.s.roleId && roles.includes(row.s.role);
  if (!ok) throw forbidden();
  return { user: u, role: row.s.role, perms };
}

export const egp = (piastres: number) =>
  `EGP ${(piastres / 100).toLocaleString('en-US', { minimumFractionDigits: piastres % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const uuidParam = z.string().uuid();

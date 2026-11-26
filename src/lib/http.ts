import type { FastifyRequest } from 'fastify';
import { z, ZodTypeAny } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { AppError, forbidden } from './errors.js';

export const parse = <T extends ZodTypeAny>(s: T, data: unknown): z.infer<T> => {
  const r = s.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new AppError(400, 'invalid_input', `${first.path.join('.') || 'input'}: ${first.message}`);
  }
  return r.data;
};

export type StaffToken = { kind: 'staff'; sub: string; sa?: boolean };
export type GuestToken = { kind: 'guest'; sub: string };

export async function staffUser(req: FastifyRequest): Promise<StaffToken> {
  try {
    await req.jwtVerify();
  } catch {
    throw new AppError(401, 'unauthorized', 'Please sign in');
  }
  const u = req.user as StaffToken | GuestToken;
  if (u.kind !== 'staff') throw new AppError(401, 'unauthorized', 'Please sign in');
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

/** Signed-in staff member with one of `roles` at this venue (super admins pass). */
export async function venueAccess(req: FastifyRequest, venueId: string, roles: Role[] = FLOOR) {
  const u = await staffUser(req);
  if (u.sa) return { user: u, role: 'owner' as Role };
  if (!z.string().uuid().safeParse(venueId).success) throw forbidden();
  const [row] = await db.select().from(schema.venueStaff)
    .where(and(eq(schema.venueStaff.venueId, venueId), eq(schema.venueStaff.userId, u.sub)));
  if (!row || !roles.includes(row.role)) throw forbidden();
  return { user: u, role: row.role };
}

export const egp = (piastres: number) =>
  `EGP ${(piastres / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const uuidParam = z.string().uuid();

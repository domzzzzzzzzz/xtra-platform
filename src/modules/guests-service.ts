import { and, eq, sql, lte, desc } from 'drizzle-orm';
import { schema, type Conn } from '../db/index.js';
import { normalizePhone, referral } from '../lib/codes.js';
import { pointsFor } from '../lib/pricing.js';

export type GuestDetails = {
  phone: string;
  firstName: string;
  lastName?: string;
  email?: string | null;
  instagram?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  birthDate?: string | null;
  whatsappOptIn?: boolean;
  emailOptIn?: boolean;
};

/** Find a guest by phone or create them. Fills in fields we did not know yet. */
export async function upsertGuest(c: Conn, d: GuestDetails) {
  const phone = normalizePhone(d.phone);
  const [found] = await c.select().from(schema.guests).where(eq(schema.guests.phone, phone));
  if (found) {
    const patch: Partial<typeof schema.guests.$inferInsert> = {};
    if (!found.email && d.email) patch.email = d.email;
    if (!found.instagram && d.instagram) patch.instagram = d.instagram;
    if (!found.gender && d.gender) patch.gender = d.gender;
    if (!found.birthDate && d.birthDate) patch.birthDate = d.birthDate;
    if (!found.lastName && d.lastName) patch.lastName = d.lastName;
    if (d.whatsappOptIn) patch.whatsappOptIn = true;
    if (d.emailOptIn) patch.emailOptIn = true;
    if (Object.keys(patch).length) {
      const [u] = await c.update(schema.guests).set(patch).where(eq(schema.guests.id, found.id)).returning();
      return u;
    }
    return found;
  }
  const [g] = await c.insert(schema.guests).values({
    phone,
    firstName: d.firstName,
    lastName: d.lastName ?? '',
    email: d.email ?? null,
    instagram: d.instagram ?? null,
    gender: d.gender ?? null,
    birthDate: d.birthDate ?? null,
    whatsappOptIn: d.whatsappOptIn ?? false,
    emailOptIn: d.emailOptIn ?? false,
    referralCode: referral(),
  }).returning();
  return g;
}

export async function ensureVenueGuest(c: Conn, venueId: string, guestId: string) {
  await c.insert(schema.venueGuests).values({ venueId, guestId }).onConflictDoNothing();
}

/** Record a paid spend: lifetime spend, visit count, points. */
export async function recordSpend(c: Conn, venueId: string, guestId: string, amount: number, refId: string, reason: string, countVisit: boolean) {
  await ensureVenueGuest(c, venueId, guestId);
  const [venue] = await c.select({ ppa: schema.venues.pointsPerAmount }).from(schema.venues).where(eq(schema.venues.id, venueId));
  const pts = pointsFor(amount, venue?.ppa ?? 10000);
  await c.update(schema.venueGuests).set({
    totalSpend: sql`${schema.venueGuests.totalSpend} + ${amount}`,
    points: sql`${schema.venueGuests.points} + ${pts}`,
    ...(countVisit ? { visits: sql`${schema.venueGuests.visits} + 1`, lastVisitAt: new Date() } : {}),
  }).where(and(eq(schema.venueGuests.venueId, venueId), eq(schema.venueGuests.guestId, guestId)));
  if (pts > 0) await c.insert(schema.pointsLedger).values({ venueId, guestId, delta: pts, reason, refId });
  return pts;
}

/** The highest tier whose min spend the guest has reached. */
export async function tierFor(c: Conn, venueId: string, totalSpend: number) {
  const [t] = await c.select().from(schema.communityTiers)
    .where(and(eq(schema.communityTiers.venueId, venueId), lte(schema.communityTiers.minSpend, totalSpend)))
    .orderBy(desc(schema.communityTiers.minSpend)).limit(1);
  return t ?? null;
}

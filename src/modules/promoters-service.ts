import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

/** The active promoter behind a ?ref= code, or null. */
export async function promoterByRef(c: Pick<typeof db, 'select'>, venueId: string, ref?: string | null) {
  if (!ref) return null;
  const [p] = await c.select({ id: schema.promoters.id }).from(schema.promoters)
    .where(and(eq(schema.promoters.venueId, venueId), eq(schema.promoters.code, ref.toUpperCase()), eq(schema.promoters.active, true)));
  return p?.id ?? null;
}


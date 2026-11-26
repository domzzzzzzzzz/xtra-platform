/**
 * Venue images (event posters, location photos).
 * Kept in Postgres so they survive redeploys with no extra storage to run.
 * The web app shrinks images before upload, so rows stay small.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parse, venueAccess } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default async function media(app: FastifyInstance) {
  app.post<{ Params: { venueId: string } }>('/venues/:venueId/media', { bodyLimit: 6 * 1024 * 1024 }, async (req, reply) => {
    await venueAccess(req, req.params.venueId, []);
    const { data } = parse(z.object({ data: z.string() }), req.body);
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(data);
    if (!m || !TYPES.includes(m[1])) throw badRequest('Upload a JPG, PNG or WebP image');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_BYTES) throw badRequest('Image is too big (3 MB max)');
    const [row] = await db.insert(schema.media).values({ venueId: req.params.venueId, mime: m[1], bytes }).returning({ id: schema.media.id });
    return reply.code(201).send({ url: `/media/${row.id}` });
  });
}

/** Public, outside /api: images never change once uploaded. */
export async function mediaFiles(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/media/:id', async (req, reply) => {
    const [row] = await db.select({ mime: schema.media.mime, bytes: schema.media.bytes }).from(schema.media).where(eq(schema.media.id, req.params.id));
    if (!row) throw notFound('Image not found');
    return reply.header('Cache-Control', 'public, max-age=31536000, immutable').type(row.mime).send(row.bytes);
  });
}

/** Venue images: a full URL, an uploaded /media/:id, or (legacy logos) a data URL. */
export const imageRef = z.string().max(400_000).refine(
  (s) => /^https?:\/\//.test(s) || /^\/media\/[0-9a-f-]{36}$/.test(s) || s.startsWith('data:image/'),
  'Not an image link',
);

/** Reads a pin out of a Google Maps link; follows short links (maps.app.goo.gl). */
export async function pinFromMapUrl(url: string): Promise<{ lat: number; lng: number } | null> {
  const read = (u: string) => {
    const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/];
    for (const p of pats) {
      const m = p.exec(u);
      if (m) {
        const lat = +m[1], lng = +m[2];
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
      }
    }
    return null;
  };
  const direct = read(url);
  if (direct) return direct;
  if (!/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(url)) return null;
  try {
    let u = url;
    for (let i = 0; i < 5; i++) {
      const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
      const next = r.headers.get('location');
      if (!next) break;
      u = new URL(next, u).toString();
      const pin = read(decodeURIComponent(u));
      if (pin) return pin;
    }
  } catch { /* offline or blocked: keep the link without a pin */ }
  return null;
}

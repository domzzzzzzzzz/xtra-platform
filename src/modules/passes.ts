/**
 * Guest passes (booking passes, tickets, invitations) and their wallet
 * versions: loading a pass by its QR token, the images wallets show, the
 * Apple Wallet web service, and pushing changes to passes already saved.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import sharp from 'sharp';
import { and, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { config } from '../config.js';
import {
  appleAuthToken, appleCreds, applePkpass, applePush, appleWalletReady, googleUpdate, googleWalletReady, googleWalletUrl,
  type AppleImages, type PassField, type PassInfo,
} from '../integrations/wallet.js';
import { placeOf } from './ticketing-service.js';

const VOID_BOOKING = ['declined', 'cancelled', 'no_show'];
const LIVE_BOOKING = ['confirmed', 'arrived', 'completed'];

/** "22:00 to 23:30" on night 2026-12-05 → start/end in Cairo time (times before 6 AM fall on the next day). */
export function bookingTimes(date: string, slotLabel: string) {
  const at = (hm: RegExpExecArray | null) => {
    if (!hm) return null;
    const h = +hm[1], m = +hm[2];
    const d = new Date(`${date}T00:00:00+02:00`);
    return new Date(d.getTime() + ((h % 24) + (h % 24 < 6 ? 24 : 0)) * 3600_000 + m * 60_000);
  };
  const [a, b] = slotLabel.split(/\s*(?:to|-|–)\s*/);
  const start = at(/^(\d{1,2}):(\d{2})/.exec(a ?? '')) ?? new Date(`${date}T20:00:00+02:00`);
  let end = at(/^(\d{1,2}):(\d{2})/.exec(b ?? ''));
  if (end && end <= start) end = new Date(end.getTime() + 24 * 3600_000);
  return { start, end };
}

/** "C-6" in a seated zone → Section / Row / Seat; a table → Section / Table. */
function ticketPlace(kind: string, zone: string, seat: string | null | undefined): PassField[] {
  if (kind === 'table') return [{ key: 'section', label: 'Section', value: zone }, ...(seat ? [{ key: 'table' as const, label: 'Table', value: seat }] : [])];
  if (kind !== 'seated') return [];
  if (!seat) return [{ key: 'section', label: 'Section', value: zone }, { key: 'entry', label: 'Seating', value: 'Free seating' }];
  const [row, num] = seat.split('-');
  return num
    ? [{ key: 'section', label: 'Section', value: zone }, { key: 'row', label: 'Row', value: row }, { key: 'seat', label: 'Seat', value: num }]
    : [{ key: 'section', label: 'Section', value: zone }, { key: 'seat', label: 'Seat', value: seat }];
}

export type LoadedPass = { info: PassInfo; view: Record<string, unknown>; logoUrl: string | null; posterUrl: string | null };

/** A pass by its QR token, cancelled ones too (flagged `voided`), or null. */
export async function loadPass(token: string): Promise<LoadedPass | null> {
  const [rg] = await db.select({ p: schema.reservationGuests, r: schema.reservations, v: schema.venues }).from(schema.reservationGuests)
    .innerJoin(schema.reservations, eq(schema.reservations.id, schema.reservationGuests.reservationId))
    .innerJoin(schema.venues, eq(schema.venues.id, schema.reservations.venueId)).where(eq(schema.reservationGuests.qrToken, token));
  if (rg && [...LIVE_BOOKING, ...VOID_BOOKING].includes(rg.r.status)) {
    const items = rg.r.tableId || rg.r.zoneId ? await db.select().from(schema.floorItems).where(eq(schema.floorItems.venueId, rg.v.id)) : [];
    const table = items.find((i) => i.id === rg.r.tableId);
    const area = items.find((i) => i.id === (table?.zoneId ?? rg.r.zoneId));
    const { start, end } = bookingTimes(rg.r.date, rg.r.slotLabel);
    const place: PassField[] = [
      ...(area ? [{ key: 'area' as const, label: 'Area', value: area.label }] : []),
      ...(table ? [{ key: 'table' as const, label: 'Table', value: table.label }] : []),
      { key: 'guests', label: 'Party', value: String(rg.r.partySize) },
    ];
    const info: PassInfo = {
      id: rg.p.id, qrToken: token, kind: 'booking', groupId: `${rg.v.id}_${rg.r.date.replace(/-/g, '')}`, venueId: rg.v.id,
      title: rg.v.name, subtitle: [area?.label, table ? `Table ${table.label}` : null, `${rg.r.partySize} ${rg.r.partySize === 1 ? 'guest' : 'guests'}`].filter(Boolean).join(' · '),
      holder: rg.p.name, startsAt: start, endsAt: end, venueName: rg.v.name, address: rg.v.address, lat: rg.v.mapLat, lng: rg.v.mapLng,
      color: rg.v.settings.color, code: rg.r.code, place, ticketType: 'Booking', hasLogo: Boolean(rg.v.logoUrl), hasHero: Boolean(rg.v.photoUrl),
      voided: VOID_BOOKING.includes(rg.r.status), passUrl: `${config.publicAppUrl}/p/${token}`,
    };
    // The floor map with the booked table, so the guest can see the way from the door.
    const map = table ? {
      items: items.map((i) => ({ id: i.id, kind: i.kind, label: i.label, shape: i.shape, x: i.x, y: i.y, w: i.w, h: i.h, rotation: i.rotation, seats: i.seats, zoneId: i.zoneId, parentId: i.parentId, enabled: i.enabled })),
      tableId: table.id, table: table.label, area: area?.label ?? null,
    } : null;
    return { info, logoUrl: rg.v.logoUrl, posterUrl: null,
      view: { type: 'booking', name: rg.p.name, venue: rg.v.name, date: rg.r.date, time: rg.r.slotLabel, used: Boolean(rg.p.checkedInAt), map } };
  }
  const [t] = await db.select({ t: schema.tickets, o: schema.ticketOrders, e: schema.events, z: schema.eventZones, s: schema.eventSeats, v: schema.venues }).from(schema.tickets)
    .innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.tickets.orderId))
    .innerJoin(schema.events, eq(schema.events.id, schema.tickets.eventId))
    .innerJoin(schema.venues, eq(schema.venues.id, schema.events.venueId))
    .innerJoin(schema.eventZones, eq(schema.eventZones.id, schema.tickets.zoneId))
    .leftJoin(schema.eventSeats, eq(schema.eventSeats.id, schema.tickets.seatId))
    .where(eq(schema.tickets.qrToken, token));
  if (t && ['paid', 'cancelled', 'refunded'].includes(t.o.status)) {
    const holder = `${t.t.firstName} ${t.t.lastName}`.trim() || 'Guest';
    const place = ticketPlace(t.z.kind, t.z.name, t.s?.label);
    const info: PassInfo = {
      id: t.t.id, qrToken: token, kind: 'ticket', groupId: t.e.id, venueId: t.v.id, title: t.e.title,
      subtitle: placeOf(t.z.kind, t.z.name, t.s?.label) || t.z.name, holder,
      startsAt: t.e.startsAt, endsAt: t.e.endsAt, venueName: t.v.name, address: t.v.address, lat: t.v.mapLat, lng: t.v.mapLng,
      color: t.e.color ?? t.v.settings.color, code: t.o.code, place,
      ticketType: t.o.kind === 'invite' ? 'Invitation' : place.length ? 'Ticket' : t.z.name,
      hasLogo: Boolean(t.v.logoUrl), hasHero: Boolean(t.e.posterUrl),
      voided: t.o.status !== 'paid' || t.e.status === 'cancelled', passUrl: `${config.publicAppUrl}/t/${token}`,
    };
    // The event map with this ticket's seat, table or zone, for the "find your seat" route.
    let map = null;
    if (t.e.seatMap) {
      const zones = await db.select().from(schema.eventZones).where(eq(schema.eventZones.eventId, t.e.id));
      const seats = await db.select({ id: schema.eventSeats.id, zoneId: schema.eventSeats.zoneId, label: schema.eventSeats.label, x: schema.eventSeats.x, y: schema.eventSeats.y, seats: schema.eventSeats.seats, shape: schema.eventSeats.shape, rotation: schema.eventSeats.rotation })
        .from(schema.eventSeats).where(eq(schema.eventSeats.eventId, t.e.id));
      map = {
        zones: zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind, shape: z.shape, x: z.x, y: z.y, w: z.w, h: z.h, color: z.color, meta: z.meta, sort: z.sort })),
        seats, zoneId: t.z.id, seatId: t.t.seatId,
      };
    }
    return { info, logoUrl: t.v.logoUrl, posterUrl: t.e.posterUrl,
      view: { type: 'ticket', name: holder, event: t.e.title, posterUrl: t.e.posterUrl, venue: t.v.name, startsAt: t.e.startsAt, ticketType: t.z.name, zoneKind: t.z.kind, seat: t.s?.label ?? null, place: placeOf(t.z.kind, '', t.s?.label), used: Boolean(t.t.checkedInAt), map } };
  }
  return null;
}

/** A pass that still works at the door, or 404. */
export async function livePass(token: string) {
  const p = await loadPass(token);
  if (!p || p.info.voided) throw notFound('Pass not found');
  return p;
}

/* ------------------------------------------------------------------ images */

/** Raw bytes of a venue image: an uploaded /media/:id, a data URL, or a web link. */
async function imageBytes(ref: string | null | undefined): Promise<Buffer | null> {
  if (!ref) return null;
  try {
    const m = /^\/media\/([0-9a-f-]{36})$/.exec(ref);
    if (m) {
      const [row] = await db.select({ bytes: schema.media.bytes }).from(schema.media).where(eq(schema.media.id, m[1]));
      return row?.bytes ?? null;
    }
    const d = /^data:image\/[a-z+]+;base64,(.+)$/.exec(ref);
    if (d) return Buffer.from(d[1], 'base64');
    if (/^https:\/\//.test(ref)) {
      const res = await fetch(ref, { signal: AbortSignal.timeout(5000) });
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    }
  } catch { /* a broken image never blocks the pass */ }
  return null;
}

const cache = new Map<string, Buffer | null>();
async function cached(key: string, make: () => Promise<Buffer | null>) {
  if (cache.has(key)) return cache.get(key)!;
  const v = await make().catch(() => null);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(key, v);
  return v;
}

const fit = (ref: string | null, w: number, h: number) => cached(`fit:${ref}:${w}x${h}`, async () => {
  const b = await imageBytes(ref);
  return b ? sharp(b).resize(w, h, { fit: 'inside', withoutEnlargement: true }).png().toBuffer() : null;
});
// Posters behind text: cropped to the strip and darkened so white text reads well.
const strip = (ref: string | null, w: number, h: number) => cached(`strip:${ref}:${w}x${h}`, async () => {
  const b = await imageBytes(ref);
  return b ? sharp(b).resize(w, h, { fit: 'cover', position: 'attention' }).modulate({ brightness: 0.62 }).png().toBuffer() : null;
});

export async function appleImages(p: LoadedPass): Promise<AppleImages> {
  const [logo, logo2x, s1, s2] = await Promise.all([
    fit(p.logoUrl, 160, 50), fit(p.logoUrl, 320, 100),
    p.info.kind === 'ticket' ? strip(p.posterUrl, 375, 98) : null, p.info.kind === 'ticket' ? strip(p.posterUrl, 750, 196) : null,
  ]);
  return { logo: logo ?? undefined, logo2x: logo2x ?? undefined, strip: s1 ?? undefined, strip2x: s2 ?? undefined };
}

/* ------------------------------------------------------------------ updates */

/** QR tokens of every pass in a booking, an order or an event (passes that exist). */
export const passTokens = {
  reservation: async (reservationId: string) => (await db.select({ q: schema.reservationGuests.qrToken }).from(schema.reservationGuests)
    .where(eq(schema.reservationGuests.reservationId, reservationId))).map((x) => x.q),
  order: async (orderId: string) => (await db.select({ q: schema.tickets.qrToken }).from(schema.tickets).where(eq(schema.tickets.orderId, orderId))).map((x) => x.q),
  event: async (eventId: string) => (await db.select({ q: schema.tickets.qrToken }).from(schema.tickets)
    .innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.tickets.orderId))
    .where(and(eq(schema.tickets.eventId, eventId), eq(schema.ticketOrders.status, 'paid')))).map((x) => x.q),
  /** Upcoming passes at a venue, after its name, logo, colour or address changed. */
  venue: async (venueId: string) => {
    const today = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const b = await db.select({ q: schema.reservationGuests.qrToken }).from(schema.reservationGuests)
      .innerJoin(schema.reservations, eq(schema.reservations.id, schema.reservationGuests.reservationId))
      .where(and(eq(schema.reservations.venueId, venueId), gte(schema.reservations.date, today), inArray(schema.reservations.status, ['confirmed', 'arrived'])));
    const t = await db.select({ q: schema.tickets.qrToken }).from(schema.tickets)
      .innerJoin(schema.ticketOrders, eq(schema.ticketOrders.id, schema.tickets.orderId))
      .innerJoin(schema.events, eq(schema.events.id, schema.tickets.eventId))
      .where(and(eq(schema.events.venueId, venueId), eq(schema.ticketOrders.status, 'paid'), gt(schema.events.startsAt, new Date(Date.now() - 864e5))));
    return [...b, ...t].map((x) => x.q);
  },
};

/**
 * The passes changed: saved Apple passes get a push (the phone then downloads
 * the new pass), saved Google passes are patched. Safe to call when no wallet
 * is set up, or when nobody saved the pass.
 */
export async function refreshWallets(tokens: string[]) {
  const apple = appleWalletReady(), google = googleWalletReady();
  if (!tokens.length || (!apple && !google)) return;
  const unique = [...new Set(tokens)];
  await db.insert(schema.walletPassUpdates).values(unique.map((serial) => ({ serial, updatedAt: new Date() })))
    .onConflictDoUpdate({ target: schema.walletPassUpdates.serial, set: { updatedAt: sql`now()` } });
  if (apple) {
    const devices = await db.select().from(schema.walletDevices).where(inArray(schema.walletDevices.serial, unique));
    const gone = await applePush([...new Set(devices.map((d) => d.pushToken))]);
    if (gone.length) await db.delete(schema.walletDevices).where(inArray(schema.walletDevices.pushToken, gone));
  }
  if (google) {
    for (const token of unique) {
      const p = await loadPass(token);
      if (p) await googleUpdate(p.info).catch((e) => console.error('[wallet] google update', token, e.message));
    }
  }
}

/** Fire and forget: the staff action never waits for Apple or Google. */
export function walletChanged(tokens: Promise<string[]> | string[]) {
  if (!appleWalletReady() && !googleWalletReady()) return;
  Promise.resolve(tokens).then(refreshWallets).catch((e) => console.error('[wallet] refresh', e.message));
}

/* ------------------------------------------------------------------ routes */

export default async function passRoutes(app: FastifyInstance) {
  /** Opens Google Wallet with the latest pass details (short link for emails). */
  app.get<{ Params: { token: string } }>('/public/pass/:token/google', async (req, reply) => {
    const { info } = await livePass(req.params.token);
    const url = googleWalletUrl(info);
    if (!url) throw notFound('Google Wallet is not set up yet');
    return reply.header('Cache-Control', 'no-store').redirect(url);
  });

  /** The venue logo and event poster, as PNG, for Google Wallet. */
  app.get<{ Params: { id: string } }>('/public/wallet/logo/:id.png', async (req, reply) => {
    const [v] = await db.select({ logo: schema.venues.logoUrl }).from(schema.venues).where(eq(schema.venues.id, req.params.id));
    const png = await cached(`glogo:${v?.logo}`, async () => {
      const b = await imageBytes(v?.logo);
      // Google shows the logo in a circle: centre it on a white square.
      return b ? sharp(b).resize(560, 560, { fit: 'contain', background: '#ffffff' }).extend({ top: 50, bottom: 50, left: 50, right: 50, background: '#ffffff' }).flatten({ background: '#ffffff' }).png().toBuffer() : null;
    });
    if (!png) throw notFound('No logo');
    return reply.type('image/png').header('Cache-Control', 'public, max-age=3600').send(png);
  });
  app.get<{ Params: { id: string } }>('/public/wallet/venue/:id.png', async (req, reply) => {
    const [v] = await db.select({ photo: schema.venues.photoUrl }).from(schema.venues).where(eq(schema.venues.id, req.params.id));
    const png = await cached(`gvenue:${v?.photo}`, async () => {
      const b = await imageBytes(v?.photo);
      return b ? sharp(b).resize(1032, 336, { fit: 'cover', position: 'attention' }).png().toBuffer() : null;
    });
    if (!png) throw notFound('No photo');
    return reply.type('image/png').header('Cache-Control', 'public, max-age=3600').send(png);
  });
  app.get<{ Params: { id: string } }>('/public/wallet/hero/:id.png', async (req, reply) => {
    const [e] = await db.select({ poster: schema.events.posterUrl }).from(schema.events).where(eq(schema.events.id, req.params.id));
    const png = await cached(`ghero:${e?.poster}`, async () => {
      const b = await imageBytes(e?.poster);
      return b ? sharp(b).resize(1032, 336, { fit: 'cover', position: 'attention' }).png().toBuffer() : null;
    });
    if (!png) throw notFound('No poster');
    return reply.type('image/png').header('Cache-Control', 'public, max-age=3600').send(png);
  });

  /*
   * Apple Wallet web service (developer.apple.com, "Wallet Passes web service").
   * iPhones register here when a pass is added and fetch the new pass after a push.
   */
  const base = '/wallet/apple/v1';
  type Reg = { deviceId: string; passTypeId: string; serial: string };
  const authorized = (serial: string, header?: string) => header === `ApplePass ${appleAuthToken(serial)}`;
  const ready = (reply: FastifyReply, passTypeId: string) => {
    if (passTypeId === appleCreds()?.passTypeId) return true;
    reply.code(404).send();
    return false;
  };

  app.post<{ Params: Reg; Body: { pushToken?: string } }>(`${base}/devices/:deviceId/registrations/:passTypeId/:serial`, async (req, reply) => {
    if (!ready(reply, req.params.passTypeId)) return;
    if (!authorized(req.params.serial, req.headers.authorization)) return reply.code(401).send();
    const pushToken = String(req.body?.pushToken ?? '');
    if (!/^[0-9a-fA-F]{16,200}$/.test(pushToken)) return reply.code(400).send();
    if (!(await loadPass(req.params.serial))) return reply.code(401).send();
    const added = await db.insert(schema.walletDevices).values({ deviceId: req.params.deviceId.slice(0, 200), pushToken, passTypeId: req.params.passTypeId, serial: req.params.serial })
      .onConflictDoUpdate({ target: [schema.walletDevices.deviceId, schema.walletDevices.passTypeId, schema.walletDevices.serial], set: { pushToken }, setWhere: sql`wallet_devices.push_token <> ${pushToken}` })
      .returning({ id: schema.walletDevices.id });
    return reply.code(added.length ? 201 : 200).send();
  });

  app.delete<{ Params: Reg }>(`${base}/devices/:deviceId/registrations/:passTypeId/:serial`, async (req, reply) => {
    if (!ready(reply, req.params.passTypeId)) return;
    if (!authorized(req.params.serial, req.headers.authorization)) return reply.code(401).send();
    await db.delete(schema.walletDevices).where(and(eq(schema.walletDevices.deviceId, req.params.deviceId), eq(schema.walletDevices.passTypeId, req.params.passTypeId), eq(schema.walletDevices.serial, req.params.serial)));
    return reply.code(200).send();
  });

  /** Which of this phone's passes changed since its last check. */
  app.get<{ Params: Omit<Reg, 'serial'>; Querystring: { passesUpdatedSince?: string } }>(`${base}/devices/:deviceId/registrations/:passTypeId`, async (req, reply) => {
    if (!ready(reply, req.params.passTypeId)) return;
    const since = Number(req.query.passesUpdatedSince);
    const rows = await db.select({ serial: schema.walletDevices.serial, updatedAt: schema.walletPassUpdates.updatedAt }).from(schema.walletDevices)
      .leftJoin(schema.walletPassUpdates, eq(schema.walletPassUpdates.serial, schema.walletDevices.serial))
      .where(and(eq(schema.walletDevices.deviceId, req.params.deviceId), eq(schema.walletDevices.passTypeId, req.params.passTypeId)));
    const changed = Number.isFinite(since) && since > 0 ? rows.filter((r) => r.updatedAt && r.updatedAt.getTime() > since) : rows;
    if (!changed.length) return reply.code(204).send();
    const last = Math.max(Date.now(), ...rows.map((r) => r.updatedAt?.getTime() ?? 0));
    return { serialNumbers: changed.map((r) => r.serial), lastUpdated: String(last) };
  });

  /** The latest version of one pass. */
  app.get<{ Params: { passTypeId: string; serial: string } }>(`${base}/passes/:passTypeId/:serial`, async (req, reply) => {
    if (!ready(reply, req.params.passTypeId)) return;
    if (!authorized(req.params.serial, req.headers.authorization)) return reply.code(401).send();
    const p = await loadPass(req.params.serial);
    if (!p) return reply.code(404).send();
    const [u] = await db.select().from(schema.walletPassUpdates).where(eq(schema.walletPassUpdates.serial, req.params.serial));
    const modified = new Date(Math.floor((u?.updatedAt.getTime() ?? 0) / 1000) * 1000);
    const ims = req.headers['if-modified-since'];
    if (u && ims && new Date(ims).getTime() >= modified.getTime()) return reply.code(304).send();
    const buf = await applePkpass(p.info, await appleImages(p));
    return reply.type('application/vnd.apple.pkpass').header('Last-Modified', (u ? modified : new Date()).toUTCString()).send(buf);
  });

  app.post(`${base}/log`, async (req) => {
    const logs = (req.body as { logs?: unknown })?.logs;
    if (Array.isArray(logs)) for (const l of logs.slice(0, 20)) req.log.warn({ appleWallet: String(l).slice(0, 500) });
    return {};
  });
}

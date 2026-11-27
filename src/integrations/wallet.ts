/**
 * Wallet passes for tickets, invitations and booking passes.
 *
 * Google Wallet: a signed "Save to Google Wallet" link. The JWT carries the
 * pass class too, so nothing has to be created in the Google console first
 * beyond the issuer account and a service account key. When a booking or an
 * event changes, the saved pass is patched through the Wallet REST API.
 *
 * Apple Wallet: a signed .pkpass built here. It needs a Pass Type ID
 * certificate from an Apple Developer account (see docs/wallet-setup.md).
 * Each pass names our web service, so iPhones register for updates and we
 * push to them (APNs) when the pass changes.
 *
 * Until the env has the keys, each wallet reports "not configured" and guests
 * get their QR by WhatsApp/email and on the pass page.
 */
import crypto from 'node:crypto';
import http2 from 'node:http2';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PKPass } from 'passkit-generator';
import forge from 'node-forge';
import { config } from '../config.js';

export type PassField = { key: 'section' | 'row' | 'seat' | 'area' | 'table' | 'guests' | 'entry'; label: string; value: string };

export type PassInfo = {
  id: string; // ticket or reservation guest id
  qrToken: string;
  kind: 'ticket' | 'booking';
  /** Event id for tickets, venue id + night for bookings: one Google class each. */
  groupId: string;
  venueId: string;
  title: string; // event or venue name
  /** One line: ticket type and place, or party and time. */
  subtitle: string;
  holder: string;
  startsAt: Date;
  endsAt?: Date | null;
  venueName: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  color?: string | null;
  /** Booking code or order code, shown small on the pass. */
  code?: string | null;
  /** Where the guest sits: section / row / seat, or area / table. Empty for standing. */
  place: PassField[];
  /** "VIP", "Invitation", "Booking"… */
  ticketType: string;
  /** Venue logo and event poster exist (Google loads them from our image links). */
  hasLogo?: boolean;
  hasHero?: boolean;
  /** Cancelled, declined, refunded: the wallet shows it as no longer valid. */
  voided?: boolean;
  /** The guest's pass page. */
  passUrl: string;
};

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const lang = (value: string) => ({ defaultValue: { language: 'en', value } });
const cairo = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-GB', { timeZone: 'Africa/Cairo', ...o });
const whenLong = (d: Date) => cairo(d, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const timeOnly = (d: Date) => cairo(d, { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
const dayShort = (d: Date) => cairo(d, { day: 'numeric', month: 'short' }).toUpperCase();
const brand = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#12153f');
const app = () => config.publicAppUrl;

/** Image links Google fetches; served by /api/public/wallet/... as PNG. */
export const walletImageUrl = {
  logo: (venueId: string) => `${app()}/api/public/wallet/logo/${venueId}.png`,
  hero: (eventId: string) => `${app()}/api/public/wallet/hero/${eventId}.png`,
  /** Booking passes: the venue photo across the pass. */
  venueHero: (venueId: string) => `${app()}/api/public/wallet/venue/${venueId}.png`,
  xtraLogo: () => `${app()}/web/brand/xtra-wallet-logo.png`,
  powered: () => `${app()}/web/brand/wallet-powered.png`,
};

/* ------------------------------------------------------------------ Google */

export const googleWalletReady = () => {
  const g = config.googleWallet;
  return Boolean(g.issuerId && g.serviceAccountEmail && g.privateKey);
};

const googleIds = (p: PassInfo) => {
  const g = config.googleWallet;
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, '');
  return { classId: `${g.issuerId}.xtra_${p.kind}_${clean(p.groupId.replace(/-/g, ''))}`, objectId: `${g.issuerId}.${clean(p.qrToken)}` };
};

/** ISO time with Cairo's offset (+02:00 or +03:00 in summer), so Google shows the local time. */
export function cairoIso(d: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const off = Math.round((wall - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0'), mm = String(Math.abs(off) % 60).padStart(2, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${off < 0 ? '-' : '+'}${hh}:${mm}`;
}

/** Card layout: date, time and type on top; where you sit (section/row/seat or area/table/party) under it. */
const ref = (...ids: string[]) => ({ firstValue: { fields: ids.map((id) => ({ fieldPath: `object.textModulesData['${id}']` })) } });
const googleTemplate = {
  cardTemplateOverride: {
    cardRowTemplateInfos: [
      { threeItems: { startItem: ref('date'), middleItem: ref('time'), endItem: ref('type') } },
      { threeItems: { startItem: ref('section', 'area'), middleItem: ref('row', 'table'), endItem: ref('seat', 'guests', 'entry') } },
    ],
  },
};

export function googleClass(p: PassInfo) {
  const { classId } = googleIds(p);
  const hero = p.hasHero ? (p.kind === 'ticket' ? walletImageUrl.hero(p.groupId) : walletImageUrl.venueHero(p.venueId)) : null;
  return {
    id: classId,
    // The venue's name, not XTRA's: the pass is white label.
    issuerName: p.venueName,
    reviewStatus: 'UNDER_REVIEW',
    eventName: lang(p.title),
    venue: { name: lang(p.venueName), address: lang(p.address || p.venueName) },
    dateTime: { start: cairoIso(p.startsAt), ...(p.endsAt ? { end: cairoIso(p.endsAt) } : {}) },
    hexBackgroundColor: brand(p.color),
    // Venue logo, or the XTRA mark when the venue has none yet.
    logo: { sourceUri: { uri: p.hasLogo ? walletImageUrl.logo(p.venueId) : walletImageUrl.xtraLogo() }, contentDescription: lang(p.hasLogo ? p.venueName : 'XTRA') },
    ...(hero ? { heroImage: { sourceUri: { uri: hero }, contentDescription: lang(p.kind === 'ticket' ? p.title : p.venueName) } } : {}),
    classTemplateInfo: googleTemplate,
    ...(p.lat != null && p.lng != null ? { locations: [{ latitude: p.lat, longitude: p.lng }] } : {}),
  };
}

export function googleObject(p: PassInfo) {
  const { classId, objectId } = googleIds(p);
  const get = (k: PassField['key']) => p.place.find((f) => f.key === k)?.value;
  const seatInfo = p.kind === 'ticket' && (get('section') || get('row') || get('seat'))
    ? { ...(get('section') ? { section: lang(get('section')!) } : {}), ...(get('row') ? { row: lang(get('row')!) } : {}), ...(get('seat') ? { seat: lang(get('seat')!) } : {}) }
    : null;
  const directions = p.lat != null && p.lng != null ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
    : p.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.venueName}, ${p.address}`)}` : null;
  return {
    id: objectId,
    classId,
    state: p.voided ? 'INACTIVE' : 'ACTIVE',
    ticketHolderName: p.holder,
    ticketType: lang(p.ticketType),
    ...(p.code ? { ticketNumber: p.code, reservationInfo: { confirmationCode: p.code } } : {}),
    ...(seatInfo ? { seatInfo } : {}),
    hexBackgroundColor: brand(p.color),
    barcode: { type: 'QR_CODE', value: p.qrToken, alternateText: p.code || p.qrToken.slice(0, 8).toUpperCase() },
    // The card rows read these by id (see googleTemplate); they also list in the pass details.
    textModulesData: [
      { id: 'date', header: 'Date', body: cairo(p.startsAt, { weekday: 'short', day: 'numeric', month: 'short' }) },
      { id: 'time', header: 'Time', body: timeOnly(p.startsAt) },
      { id: 'type', header: p.kind === 'ticket' ? 'Ticket' : 'Pass', body: p.ticketType },
      ...p.place.map((f) => ({ id: f.key, header: f.label, body: f.value })),
      ...(p.voided ? [{ id: 'status', header: 'Status', body: 'Cancelled. This pass no longer works at the door.' }] : []),
      ...(p.address ? [{ id: 'address', header: 'Venue', body: `${p.venueName}\n${p.address}` }] : []),
      { id: 'issuer', header: 'Issued by', body: issuerContact() },
    ],
    linksModuleData: {
      uris: [
        { id: 'pass', uri: p.passUrl, description: 'Open my pass' },
        ...(directions ? [{ id: 'directions', uri: directions, description: 'Directions' }] : []),
        { id: 'terms', uri: `${app()}/terms`, description: 'Terms' },
      ],
    },
    imageModulesData: [{ id: 'powered', mainImage: { sourceUri: { uri: walletImageUrl.powered() }, contentDescription: lang('Powered by XTRA') } }],
  };
}

const signRs256 = (payload: object, key: string) => {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${body}`).sign(key);
  return `${header}.${body}.${b64url(sig)}`;
};

/** The "Save to Google Wallet" link, or null when Google Wallet is not set up. */
export function googleWalletUrl(p: PassInfo): string | null {
  if (!googleWalletReady()) return null;
  const g = config.googleWallet;
  const jwt = signRs256({
    iss: g.serviceAccountEmail, aud: 'google', typ: 'savetowallet', iat: Math.floor(Date.now() / 1000), origins: [app()],
    payload: { eventTicketClasses: [googleClass(p)], eventTicketObjects: [googleObject(p)] },
  }, g.privateKey);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

let googleToken: { value: string; until: number } | null = null;
async function googleAccessToken() {
  if (googleToken && googleToken.until > Date.now() + 60_000) return googleToken.value;
  const g = config.googleWallet;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signRs256({ iss: g.serviceAccountEmail, scope: 'https://www.googleapis.com/auth/wallet_object.issuer', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, g.privateKey);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google token: ${res.status} ${await res.text()}`);
  const j = await res.json() as { access_token: string; expires_in: number };
  googleToken = { value: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

const WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1';

/**
 * Pushes the new pass details to a pass the guest already saved. Returns
 * false when the guest never saved it (Google answers 404): nothing to do.
 */
export async function googleUpdate(p: PassInfo): Promise<boolean> {
  if (!googleWalletReady()) return false;
  const token = await googleAccessToken();
  const call = async (kind: 'eventTicketClass' | 'eventTicketObject', body: { id: string }) => {
    const res = await fetch(`${WALLET_API}/${kind}/${encodeURIComponent(body.id)}`, {
      method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`Google ${kind}: ${res.status} ${await res.text()}`);
    return true;
  };
  if (!(await call('eventTicketObject', googleObject(p)))) return false;
  await call('eventTicketClass', googleClass(p));
  return true;
}

/* ------------------------------------------------------------------- Apple */

type AppleCreds = { passTypeId: string; teamId: string; cert: string; key: string; passphrase?: string };
let credsCache: { sig: string; value: AppleCreds | null } | null = null;

/**
 * The Pass Type ID certificate and key: from APPLE_PASS_P12 (the .p12 file
 * exported from Keychain, base64) or from PEM text. The Pass Type ID and Team
 * ID are read from the certificate when not set.
 */
export function appleCreds(): AppleCreds | null {
  const a = config.appleWallet;
  const sig = [a.passTypeId, a.teamId, a.cert, a.key, a.p12, a.p12Password].join('|');
  if (credsCache?.sig === sig) return credsCache.value;
  let value: AppleCreds | null = null;
  try {
    let cert = a.cert, key = a.key, passphrase = a.keyPassphrase || undefined;
    if (a.p12 && !(cert && key)) {
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.decode64(a.p12.replace(/\s+/g, ''))), a.p12Password);
      const c = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
      const k = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key
        ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;
      if (c && k) { cert = forge.pki.certificateToPem(c); key = forge.pki.privateKeyToPem(k); passphrase = undefined; }
    }
    if (cert && key) {
      const subject = new crypto.X509Certificate(cert).subject;
      const field = (n: string) => new RegExp(`^${n}=(.+)$`, 'm').exec(subject)?.[1]?.trim() ?? '';
      const passTypeId = a.passTypeId || field('UID'), teamId = a.teamId || field('OU');
      if (passTypeId && teamId) value = { passTypeId, teamId, cert, key, passphrase };
    }
  } catch (e) {
    console.error('[wallet] Apple certificate could not be read:', (e as Error).message);
  }
  credsCache = { sig, value };
  return value;
}

export const appleWalletReady = () => appleCreds() !== null;

/** Apple's WWDR G4 intermediate: from APPLE_WWDR_CERT, or downloaded from Apple once. */
let wwdrCache: string | null = null;
async function wwdrPem() {
  if (config.appleWallet.wwdr) return config.appleWallet.wwdr;
  if (wwdrCache) return wwdrCache;
  const res = await fetch('https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer', { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Apple WWDR download: ${res.status}`);
  wwdrCache = new crypto.X509Certificate(Buffer.from(await res.arrayBuffer())).toString();
  return wwdrCache;
}

/** Where the guest downloads the .pkpass (same link in emails and on the pass page). */
export const appleWalletLink = (qrToken: string) => `${app()}/api/public/pass/${qrToken}/apple.pkpass`;
/** A short link that always opens Google Wallet with the latest pass details. */
export const googleWalletLink = (qrToken: string) => `${app()}/api/public/pass/${qrToken}/google`;

/** For the pass page: where the guest downloads the .pkpass, when Apple Wallet is set up. */
export function applePass(p: Pick<PassInfo, 'qrToken'>): { configured: false } | { configured: true; url: string } {
  if (!appleWalletReady()) return { configured: false };
  return { configured: true, url: appleWalletLink(p.qrToken) };
}

/** The secret an iPhone sends back to our web service for one pass. */
export const appleAuthToken = (serial: string) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`apple-pass:${serial}`).digest('base64url').slice(0, 32);

/** Apple only calls web services on https. */
export const appleWebServiceUrl = () => (app().startsWith('https://') ? `${app()}/api/wallet/apple` : null);

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/wallet');
let images: Record<string, Buffer> | null = null;
const defaultImages = () => images ??= Object.fromEntries(
  ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png'].map((f) => [f, readFileSync(path.join(ASSETS, f))]),
);

const rgb = (hex: string) => {
  const n = parseInt(brand(hex).slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** Labels: white mixed 30% into the background, softer than the values. */
const labelOn = (hex: string) => {
  const n = parseInt(brand(hex).slice(1), 16);
  const mix = (c: number) => Math.round(255 * 0.7 + c * 0.3);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};

/** Who issues the pass and where guests send questions or complaints (from the env). */
export function issuerContact() {
  const e = process.env;
  const lines = [
    `${e.LEGAL_COMPANY_NAME || 'XTRA'}, on behalf of the venue.`,
    e.LEGAL_ADDRESS, e.SUPPORT_PHONE && `Phone: ${e.SUPPORT_PHONE}`, e.SUPPORT_EMAIL && `Email: ${e.SUPPORT_EMAIL}`,
    `Terms: ${app()}/terms`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Images made from the venue logo and event poster (PNG, already sized). */
export type AppleImages = { logo?: Buffer; logo2x?: Buffer; strip?: Buffer; strip2x?: Buffer };

/** Builds and signs the .pkpass file. Throws when Apple Wallet is not set up. */
export async function applePkpass(p: PassInfo, img: AppleImages = {}): Promise<Buffer> {
  const a = appleCreds();
  if (!a) throw new Error('Apple Wallet is not configured');
  const service = appleWebServiceUrl();
  const files: Record<string, Buffer> = { ...defaultImages() };
  if (img.logo) { files['logo.png'] = img.logo; files['logo@2x.png'] = img.logo2x ?? img.logo; }
  if (img.strip) { files['strip.png'] = img.strip; files['strip@2x.png'] = img.strip2x ?? img.strip; }
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: a.passTypeId,
    teamIdentifier: a.teamId,
    // Apple's pass terms: passes go out under our own brand (XTRA); the venue's name
    // and logo are referenced content we have the venue's permission to show.
    organizationName: 'XTRA',
    description: p.kind === 'ticket' ? `Ticket: ${p.title} at ${p.venueName}, by XTRA` : `Booking at ${p.venueName}, by XTRA`,
    serialNumber: p.qrToken,
    // The venue logo already shows the name; the text is for venues without one.
    ...(img.logo ? {} : { logoText: p.venueName }),
    backgroundColor: rgb(p.color || '#12153f'),
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: labelOn(p.color || '#12153f'),
    relevantDate: p.startsAt.toISOString(),
    expirationDate: new Date((p.endsAt ?? p.startsAt).getTime() + 12 * 3600_000).toISOString(),
    ...(p.voided ? { voided: true } : {}),
    ...(service ? { webServiceURL: service, authenticationToken: appleAuthToken(p.qrToken) } : {}),
    ...(p.lat != null && p.lng != null ? { locations: [{ latitude: p.lat, longitude: p.lng, relevantText: `Show this at the door of ${p.venueName}` }] } : {}),
    eventTicket: {},
  };
  const pass = new PKPass(
    { ...files, 'pass.json': Buffer.from(JSON.stringify(passJson)) },
    { wwdr: await wwdrPem(), signerCert: a.cert, signerKey: a.key, signerKeyPassphrase: a.passphrase },
  );
  pass.headerFields.push({ key: 'date', label: p.voided ? 'CANCELLED' : dayShort(p.startsAt), value: timeOnly(p.startsAt) });
  pass.primaryFields.push({ key: 'event', label: p.kind === 'ticket' ? p.ticketType.toUpperCase() : 'BOOKING', value: p.title });
  // Section / Row / Seat, or Area / Table: the most useful line at the door.
  const place = p.place.slice(0, 4);
  if (place.length) pass.secondaryFields.push(...place.map((f) => ({ key: f.key, label: f.label.toUpperCase(), value: f.value })));
  else pass.secondaryFields.push({ key: 'entry', label: 'ENTRY', value: p.ticketType });
  pass.auxiliaryFields.push({ key: 'holder', label: 'GUEST', value: p.holder }, { key: 'when', label: 'WHEN', value: whenLong(p.startsAt), changeMessage: 'New time: %@' });
  if (p.code) pass.auxiliaryFields.push({ key: 'code', label: p.kind === 'ticket' ? 'ORDER' : 'CODE', value: p.code });
  pass.backFields.push(
    ...(p.voided ? [{ key: 'status', label: 'Status', value: 'This pass was cancelled and no longer works at the door.' }] : []),
    { key: 'venue', label: 'Venue', value: [p.venueName, p.address].filter(Boolean).join(', ') },
    { key: 'place', label: 'Your place', value: p.subtitle, changeMessage: 'Your place changed: %@' },
    { key: 'link', label: 'Your pass online', value: p.passUrl, attributedValue: `<a href="${p.passUrl}">Open my pass</a>` },
    { key: 'help', label: 'At the door', value: 'Show this QR. Each guest needs their own pass.' },
    // Apple requires the issuer's name, address, phone and email for questions and complaints.
    { key: 'issuer', label: 'Issued by', value: issuerContact() },
  );
  pass.setBarcodes({ message: p.qrToken, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1', altText: p.qrToken.slice(0, 8).toUpperCase() });
  return pass.getAsBuffer();
}

/**
 * Tells iPhones that a pass changed (an empty push on the pass's topic). The
 * phone then asks our web service for the new pass. Returns the push tokens
 * Apple says are gone, so they can be removed.
 */
export async function applePush(pushTokens: string[]): Promise<string[]> {
  const a = appleCreds();
  if (!a || !pushTokens.length) return [];
  const gone: string[] = [];
  const client = http2.connect('https://api.push.apple.com', { cert: a.cert, key: a.key, passphrase: a.passphrase });
  client.on('error', (e) => console.error('[wallet] apns', e.message));
  try {
    await Promise.all(pushTokens.map((t) => new Promise<void>((resolve) => {
      const req = client.request({ ':method': 'POST', ':path': `/3/device/${t}`, 'apns-topic': a.passTypeId, 'content-type': 'application/json' });
      req.on('response', (h) => { if (h[':status'] === 410 || h[':status'] === 400) gone.push(t); });
      req.on('error', () => resolve());
      req.on('close', () => resolve());
      req.setTimeout(10_000, () => req.close());
      req.end('{}');
    })));
  } finally {
    client.close();
  }
  return gone;
}

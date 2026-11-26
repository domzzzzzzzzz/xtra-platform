/**
 * Wallet passes for tickets and booking passes.
 *
 * Google Wallet: a signed "Save to Google Wallet" link. The JWT carries the
 * pass class too, so nothing has to be created in the Google console first
 * beyond the issuer account and a service account key.
 *
 * Apple Wallet: a signed .pkpass built here. It needs a Pass Type ID
 * certificate from an Apple Developer account (see README, "Wallet passes").
 * Until the env has it, Apple passes report "not configured" and guests get
 * their QR by WhatsApp/email and on the pass page.
 */
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PKPass } from 'passkit-generator';
import { config } from '../config.js';

export type PassInfo = {
  id: string; // ticket or reservation guest id
  qrToken: string;
  kind: 'ticket' | 'booking';
  /** Event id for tickets, venue id for bookings: one wallet class each. */
  groupId: string;
  title: string; // event or venue name
  subtitle: string; // zone / seat / party
  holder: string;
  startsAt: Date;
  venueName: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  color?: string | null;
};

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const lang = (value: string) => ({ defaultValue: { language: 'en', value } });
const cairo = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export const googleWalletReady = () => {
  const g = config.googleWallet;
  return Boolean(g.issuerId && g.serviceAccountEmail && g.privateKey);
};

/** The "Save to Google Wallet" link, or null when Google Wallet is not set up. */
export function googleWalletUrl(p: PassInfo): string | null {
  if (!googleWalletReady()) return null;
  const g = config.googleWallet;
  const classId = `${g.issuerId}.xtra_${p.kind}_${p.groupId.replace(/-/g, '')}`;
  const objectId = `${g.issuerId}.${p.qrToken.replace(/[^A-Za-z0-9_.-]/g, '')}`;
  const venue = { name: lang(p.venueName), address: lang(p.address || p.venueName) };
  const payload = {
    iss: g.serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [config.publicAppUrl],
    payload: {
      eventTicketClasses: [{
        id: classId,
        issuerName: 'XTRA',
        reviewStatus: 'UNDER_REVIEW',
        eventName: lang(p.title),
        venue,
        dateTime: { start: p.startsAt.toISOString() },
        hexBackgroundColor: p.color || '#12153f',
        ...(p.lat != null && p.lng != null ? { locations: [{ latitude: p.lat, longitude: p.lng }] } : {}),
      }],
      eventTicketObjects: [{
        id: objectId,
        classId,
        state: 'ACTIVE',
        ticketHolderName: p.holder,
        barcode: { type: 'QR_CODE', value: p.qrToken, alternateText: p.qrToken.slice(0, 8).toUpperCase() },
        ticketType: lang(p.subtitle),
      }],
    },
  };
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${body}`).sign(g.privateKey);
  return `https://pay.google.com/gp/v/save/${header}.${body}.${b64url(sig)}`;
}

export const appleWalletReady = () => {
  const a = config.appleWallet;
  return Boolean(a.passTypeId && a.teamId && a.cert && a.key && a.wwdr);
};

/** For the pass page: where the guest downloads the .pkpass, when Apple Wallet is set up. */
export function applePass(p: PassInfo): { configured: false } | { configured: true; url: string } {
  if (!appleWalletReady()) return { configured: false };
  return { configured: true, url: `${config.publicAppUrl}/api/public/pass/${p.qrToken}/apple.pkpass` };
}

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/wallet');
let images: Record<string, Buffer> | null = null;
const walletImages = () => images ??= Object.fromEntries(
  ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png'].map((f) => [f, readFileSync(path.join(ASSETS, f))]),
);

const rgb = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x12153f;
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** Builds and signs the .pkpass file. Throws when Apple Wallet is not set up. */
export async function applePkpass(p: PassInfo): Promise<Buffer> {
  if (!appleWalletReady()) throw new Error('Apple Wallet is not configured');
  const a = config.appleWallet;
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: a.passTypeId,
    teamIdentifier: a.teamId,
    organizationName: 'XTRA',
    description: p.kind === 'ticket' ? `Ticket: ${p.title}` : `Booking at ${p.venueName}`,
    serialNumber: p.id,
    logoText: p.venueName,
    backgroundColor: rgb(p.color || '#12153f'),
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(191, 234, 255)',
    relevantDate: p.startsAt.toISOString(),
    ...(p.lat != null && p.lng != null ? { locations: [{ latitude: p.lat, longitude: p.lng, relevantText: `Show this at the door of ${p.venueName}` }] } : {}),
    eventTicket: {},
  };
  const pass = new PKPass(
    { ...walletImages(), 'pass.json': Buffer.from(JSON.stringify(passJson)) },
    { wwdr: a.wwdr, signerCert: a.cert, signerKey: a.key, signerKeyPassphrase: a.keyPassphrase || undefined },
  );
  pass.primaryFields.push({ key: 'event', label: p.kind === 'ticket' ? 'EVENT' : 'VENUE', value: p.title });
  pass.secondaryFields.push({ key: 'holder', label: 'GUEST', value: p.holder }, { key: 'type', label: p.kind === 'ticket' ? 'TICKET' : 'BOOKING', value: p.subtitle });
  pass.auxiliaryFields.push({ key: 'when', label: 'WHEN', value: cairo(p.startsAt) });
  pass.backFields.push({ key: 'venue', label: 'Venue', value: [p.venueName, p.address].filter(Boolean).join(', ') }, { key: 'help', label: 'At the door', value: 'Show this QR. Each guest needs their own pass.' });
  pass.setBarcodes({ message: p.qrToken, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1', altText: p.qrToken.slice(0, 8).toUpperCase() });
  return pass.getAsBuffer();
}

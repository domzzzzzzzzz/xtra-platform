/**
 * Wallet passes for tickets and booking passes.
 *
 * Google Wallet: a signed "Save to Google Wallet" link (works once an issuer
 * account + service account are set in the env).
 * Apple Wallet: a .pkpass must be signed with an Apple Pass Type ID
 * certificate. Until that certificate exists, applePass() reports it is not
 * configured and the guest gets the QR by WhatsApp/email only.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

export type PassInfo = {
  id: string; // ticket or reservation guest id
  qrToken: string;
  title: string; // event or venue name
  subtitle: string; // zone / party
  holder: string;
  startsAt: Date;
  venueName: string;
};

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function googleWalletUrl(p: PassInfo): string | null {
  const g = config.googleWallet;
  if (!g.issuerId || !g.serviceAccountEmail || !g.privateKey) return null;
  const classId = `${g.issuerId}.xtra_event`;
  const payload = {
    iss: g.serviceAccountEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    payload: {
      eventTicketObjects: [{
        id: `${g.issuerId}.${p.id.replace(/-/g, '')}`,
        classId,
        state: 'ACTIVE',
        ticketHolderName: p.holder,
        barcode: { type: 'QR_CODE', value: p.qrToken },
        ticketType: { defaultValue: { language: 'en', value: p.subtitle } },
        eventName: { defaultValue: { language: 'en', value: p.title } },
      }],
    },
  };
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${body}`).sign(g.privateKey);
  return `https://pay.google.com/gp/v/save/${header}.${body}.${b64url(sig)}`;
}

export function applePass(_p: PassInfo): { configured: false } {
  return { configured: false };
}

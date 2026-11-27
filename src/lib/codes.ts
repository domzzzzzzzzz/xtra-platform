import { customAlphabet } from 'nanoid';
import crypto from 'node:crypto';

// No 0/O/1/I/L so codes can be read out at the door.
const readable = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const shortCode = customAlphabet(readable, 6);
export const promoCode = customAlphabet(readable, 8);
export const referral = customAlphabet(readable, 7);
/** Unguessable token printed inside QR codes. */
export const qrToken = () => crypto.randomBytes(18).toString('base64url');

export const otpCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function slugify(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'venue';
}

/**
 * Phone numbers to one international format. Egyptian local numbers
 * (01X…) become +201X…; numbers with a country code are kept, and a
 * leading 0 typed after +20 ("+20 010…") is dropped.
 */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/[^\d+]/g, '');
  const intl = d.startsWith('+') || d.startsWith('00');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  if (intl) {
    if (d.startsWith('200')) d = '20' + d.slice(3);
    return '+' + d;
  }
  if (d.startsWith('0')) d = '20' + d.slice(1);
  if (!d.startsWith('20') && d.length === 10 && d.startsWith('1')) d = '20' + d;
  return '+' + d;
}

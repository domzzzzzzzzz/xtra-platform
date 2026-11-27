/**
 * Branded HTML emails. One layout for every guest email: the venue's logo
 * and colour on top, a card with the details, one clear button, an optional
 * QR, and a footer with the address, directions and policies.
 *
 * Built with tables and inline styles so it looks the same in Gmail,
 * Outlook and Apple Mail, in light and dark mode.
 */
import { config } from '../config.js';

export type EmailVenue = {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  phone?: string | null;
  color?: string | null;
};

/** "Add to Apple Wallet" / "Add to Google Wallet" links under a QR, when the wallets are set up. */
export type WalletLinks = { apple?: string | null; google?: string | null };

export type EmailDoc = {
  venue: EmailVenue;
  /** Grey line shown next to the subject in the inbox. */
  preheader: string;
  title: string;
  intro?: string;
  rows?: [label: string, value: string][];
  button?: { label: string; url: string };
  /** QR images, each with a caption (one per ticket or pass). */
  qrs?: { token: string; caption: string; url?: string; wallet?: WalletLinks }[];
  /** Receipt lines under the details; the last one is shown bold as the total. */
  receipt?: [label: string, value: string][];
  note?: string;
  /** Marketing emails carry an unsubscribe link. */
  unsubscribeUrl?: string;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Images in email need a full https link; inline data: images are blocked by Gmail. */
const absolute = (u?: string | null) => {
  if (!u || u.startsWith('data:')) return null;
  return /^https?:\/\//.test(u) ? u : `${config.publicAppUrl}${u.startsWith('/') ? '' : '/'}${u}`;
};

const brand = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#12153f');

/** Two black wallet buttons, side by side (stacked on narrow screens by the client). */
function walletButtons(w?: WalletLinks) {
  const links = [w?.apple && ['Add to Apple Wallet', w.apple], w?.google && ['Add to Google Wallet', w.google]].filter(Boolean) as [string, string][];
  if (!links.length) return '';
  const cell = ([label, url]: [string, string]) => `<td style="padding:4px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#000000;border-radius:9px">
            <a href="${esc(url)}" style="display:inline-block;padding:10px 16px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap">${esc(label)}</a></td></tr></table></td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px"><tr>${links.map(cell).join('')}</tr></table>`;
}

export function renderEmail(d: EmailDoc): string {
  const color = brand(d.venue.color);
  const logo = absolute(d.venue.logoUrl);
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const rows = (d.rows ?? []).map(([k, v]) => `
          <tr><td style="padding:9px 0;border-bottom:1px solid #eceef3;color:#6b7190;font-size:14px;width:40%">${esc(k)}</td>
          <td style="padding:9px 0;border-bottom:1px solid #eceef3;color:#12153f;font-size:14px;font-weight:600;text-align:right">${esc(v)}</td></tr>`).join('');
  const receipt = (d.receipt ?? []).map(([k, v], i, all) => {
    const last = i === all.length - 1;
    const s = last ? 'padding:10px 0 0;color:#12153f;font-size:15px;font-weight:700;border-top:1px solid #d9dce6' : 'padding:4px 0;color:#6b7190;font-size:14px';
    return `<tr><td style="${s}">${esc(k)}</td><td style="${s};text-align:right">${esc(v)}</td></tr>`;
  }).join('');
  const qrs = (d.qrs ?? []).map((q) => `
        <tr><td align="center" style="padding:18px 0 4px">
          <a href="${esc(q.url ?? '#')}" style="text-decoration:none"><img src="${config.publicAppUrl}/api/public/qr/${encodeURIComponent(q.token)}.png" width="180" height="180" alt="QR code" style="display:block;border:0;width:180px;height:180px;border-radius:8px;background:#ffffff"></a>
          <div style="padding-top:8px;color:#12153f;font-size:14px;font-weight:600">${esc(q.caption)}</div>
          <div style="color:#8a90ab;font-size:12px;letter-spacing:1px">${esc(q.token.slice(0, 8).toUpperCase())}</div>
          ${walletButtons(q.wallet)}
        </td></tr>`).join('');
  const directions = d.venue.mapUrl ? ` · <a href="${esc(d.venue.mapUrl)}" style="color:#6b7190">Directions</a>` : '';
  const app = config.publicAppUrl;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(d.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:${font}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(d.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="background:${color};border-radius:14px 14px 0 0;padding:22px 28px" align="left">
      ${logo
        ? `<img src="${esc(logo)}" alt="${esc(d.venue.name)}" height="40" style="display:block;height:40px;max-width:200px;border:0">`
        : `<div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-.3px">${esc(d.venue.name)}</div>`}
    </td></tr>
    <tr><td style="background:#ffffff;padding:30px 28px 26px;border-radius:0 0 14px 14px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="color:#12153f;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-.4px;padding-bottom:10px">${esc(d.title)}</td></tr>
        ${d.intro ? `<tr><td style="color:#3b4163;font-size:15px;line-height:1.6;padding-bottom:16px">${esc(d.intro)}</td></tr>` : ''}
        ${rows ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : ''}
        ${receipt ? `<tr><td style="padding-top:18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fb;border-radius:10px;padding:12px 16px">${receipt}</table></td></tr>` : ''}
        ${d.button ? `<tr><td style="padding-top:24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${color};border-radius:10px">
          <a href="${esc(d.button.url)}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none">${esc(d.button.label)}</a></td></tr></table></td></tr>` : ''}
        ${qrs}
        ${d.note ? `<tr><td style="padding-top:20px;color:#6b7190;font-size:13px;line-height:1.6">${esc(d.note)}</td></tr>` : ''}
      </table>
    </td></tr>
    <tr><td style="padding:20px 28px;color:#8a90ab;font-size:12px;line-height:1.7" align="center">
      <div style="color:#5b6280;font-weight:600">${esc(d.venue.name)}</div>
      ${d.venue.address ? `<div>${esc(d.venue.address)}${directions}</div>` : directions ? `<div>${directions.slice(3)}</div>` : ''}
      <div><a href="${app}/terms" style="color:#8a90ab">Terms</a> · <a href="${app}/privacy" style="color:#8a90ab">Privacy</a> · <a href="${app}/refunds" style="color:#8a90ab">Refunds</a></div>
      ${d.unsubscribeUrl ? `<div style="padding-top:6px"><a href="${esc(d.unsubscribeUrl)}" style="color:#8a90ab">Unsubscribe from offers</a></div>` : ''}
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:16px auto 0"><tr>
        <td style="color:#a2a7bd;font-size:11px;padding-right:6px;vertical-align:middle">Powered by</td>
        <td style="vertical-align:middle"><a href="https://xtratickets.com" style="text-decoration:none"><img src="${app}/web/brand/xtra-gray.png" alt="XTRA" width="50" height="11" style="display:block;border:0;width:50px;height:11px"></a></td>
      </tr></table>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** The same email as plain text, for clients that do not show HTML. */
export function renderText(d: EmailDoc): string {
  const out = [d.title, ''];
  if (d.intro) out.push(d.intro, '');
  for (const [k, v] of d.rows ?? []) out.push(`${k}: ${v}`);
  if (d.receipt?.length) { out.push(''); for (const [k, v] of d.receipt) out.push(`${k}: ${v}`); }
  if (d.button) out.push('', `${d.button.label}: ${d.button.url}`);
  for (const q of d.qrs ?? []) {
    if (q.url) out.push(`${q.caption}: ${q.url}`);
    if (q.wallet?.apple) out.push(`  Add to Apple Wallet: ${q.wallet.apple}`);
    if (q.wallet?.google) out.push(`  Add to Google Wallet: ${q.wallet.google}`);
  }
  if (d.note) out.push('', d.note);
  out.push('', `${d.venue.name}${d.venue.address ? `, ${d.venue.address}` : ''}`);
  if (d.unsubscribeUrl) out.push(`Unsubscribe: ${d.unsubscribeUrl}`);
  return out.join('\n');
}

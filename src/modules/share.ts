import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';

/**
 * Sharing a venue: where a booking came from (?src=instagram), link previews
 * on WhatsApp / Instagram / Google, and a "Book a table" button for the venue's
 * own website (/embed.js).
 */

export const SOURCES: Record<string, string> = {
  instagram: 'Instagram', google: 'Google', whatsapp: 'WhatsApp', website: 'Website', tiktok: 'TikTok', facebook: 'Facebook', qr: 'QR code',
};
/** The booking source for a ?src= value; anything unknown is plain "online". */
export const sourceOf = (src?: string | null) => (src && SOURCES[src.toLowerCase()]) || 'online';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const abs = (u?: string | null) => (!u || u.startsWith('data:') ? null : /^https?:\/\//.test(u) ? u : `${config.publicAppUrl}${u.startsWith('/') ? '' : '/'}${u}`);

type Meta = { title: string; description: string; image: string | null; url: string; jsonld?: object };

/** Title, preview text and picture for a guest link, so it looks right when shared. */
export async function metaFor(kind: 'book' | 'event', id: string): Promise<Meta | null> {
  if (kind === 'book') {
    const [v] = await db.select().from(schema.venues).where(and(eq(schema.venues.slug, id), eq(schema.venues.active, true)));
    if (!v) return null;
    const url = `${config.publicAppUrl}/book/${v.slug}`;
    const where = v.settings.where || v.address || '';
    return {
      title: `Book a table · ${v.name}`,
      description: `Reserve your table at ${v.name}${where ? `, ${where}` : ''}. Pick your night, time and area, and get your pass on WhatsApp.`,
      image: abs(v.photoUrl) ?? abs(v.logoUrl), url,
      jsonld: {
        '@context': 'https://schema.org', '@type': 'Restaurant', name: v.name, url,
        ...(v.address ? { address: v.address } : {}), ...(v.phone ? { telephone: v.phone } : {}),
        ...(abs(v.photoUrl) ? { image: abs(v.photoUrl) } : {}), acceptsReservations: true,
        potentialAction: { '@type': 'ReserveAction', target: { '@type': 'EntryPoint', urlTemplate: url, actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'] } },
      },
    };
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db.select({ e: schema.events, v: schema.venues }).from(schema.events)
    .innerJoin(schema.venues, eq(schema.venues.id, schema.events.venueId)).where(eq(schema.events.id, id));
  if (!row || row.e.status === 'draft') return null;
  const when = row.e.startsAt.toLocaleString('en-GB', { timeZone: row.v.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const url = `${config.publicAppUrl}/e/${row.e.id}`;
  return {
    title: `${row.e.title} · ${row.v.name}`,
    description: `${when} at ${row.v.name}. Get your tickets.`,
    image: abs(row.e.posterUrl) ?? abs(row.v.photoUrl), url,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'Event', name: row.e.title, startDate: row.e.startsAt.toISOString(), url,
      location: { '@type': 'Place', name: row.v.name, ...(row.v.address ? { address: row.v.address } : {}) },
      ...(abs(row.e.posterUrl) ? { image: abs(row.e.posterUrl) } : {}),
    },
  };
}

/** Put the meta tags into the page's <head>. */
export function withMeta(html: string, m: Meta) {
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.url)}">`,
    ...(m.image ? [`<meta property="og:image" content="${esc(m.image)}">`, `<meta name="twitter:card" content="summary_large_image">`] : []),
    `<link rel="canonical" href="${esc(m.url)}">`,
    ...(m.jsonld ? [`<script type="application/ld+json">${JSON.stringify(m.jsonld).replace(/</g, '\\u003c')}</script>`] : []),
  ].join('\n');
  return html.replace(/<title>[^<]*<\/title>/, tags);
}

/** A "Book a table" button for the venue's website. Paste: <script src=".../embed.js" data-venue="slug"></script> */
export function embedScript() {
  const base = config.publicAppUrl;
  return `(function(){var s=document.currentScript;if(!s)return;var slug=s.getAttribute('data-venue');if(!slug)return;
var label=s.getAttribute('data-label')||'Book a table',color=s.getAttribute('data-color')||'#12153f',inline=s.hasAttribute('data-inline');
var b=document.createElement('button');b.type='button';b.textContent=label;
b.style.cssText='font:600 16px/1 system-ui,sans-serif;background:'+color+';color:#fff;border:0;border-radius:12px;padding:15px 22px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.18);'+(inline?'':'position:fixed;right:20px;bottom:20px;z-index:2147483000;');
b.onclick=function(){var w=document.createElement('div');w.style.cssText='position:fixed;inset:0;z-index:2147483001;background:rgba(10,12,40,.55);display:flex;align-items:center;justify-content:center;padding:12px';
var f=document.createElement('iframe');f.src='${base}/book/'+encodeURIComponent(slug)+'?src=website';f.title=label;f.allow='payment';f.style.cssText='width:100%;max-width:460px;height:min(860px,100%);border:0;border-radius:18px;background:#fff';
var x=document.createElement('button');x.type='button';x.setAttribute('aria-label','Close');x.textContent='\\u00d7';x.style.cssText='position:absolute;top:12px;right:16px;width:44px;height:44px;border-radius:50%;border:0;background:#fff;font-size:26px;cursor:pointer';
x.onclick=function(){w.remove()};w.onclick=function(e){if(e.target===w)w.remove()};w.appendChild(f);w.appendChild(x);document.body.appendChild(w)};
s.parentNode.insertBefore(b,s.nextSibling)})();`;
}

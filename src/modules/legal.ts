/**
 * Guest-facing policies: Terms, Privacy and Refunds, at /terms, /privacy, /refunds.
 * Written for Egypt: Personal Data Protection Law No. 151 of 2020 and
 * Consumer Protection Law No. 181 of 2018. Company details come from the env
 * (LEGAL_COMPANY_NAME, LEGAL_ADDRESS, SUPPORT_EMAIL, SUPPORT_PHONE).
 * Have a lawyer read these before going fully live.
 */
import type { FastifyInstance } from 'fastify';

const env = process.env;
const UPDATED = '26 November 2026';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function company() {
  const name = env.LEGAL_COMPANY_NAME || 'XTRA';
  const email = env.SUPPORT_EMAIL || '';
  const phone = env.SUPPORT_PHONE || '';
  const address = env.LEGAL_ADDRESS || '';
  const contact = [email && `email <a href="mailto:${esc(email)}">${esc(email)}</a>`, phone && `WhatsApp or call ${esc(phone)}`].filter(Boolean).join(', or ')
    || 'reply to the email or WhatsApp message we sent you';
  return { name: esc(name), address: esc(address), contact };
}

const PAGES: Record<string, { title: string; body: (c: ReturnType<typeof company>) => string }> = {
  terms: {
    title: 'Terms of use',
    body: (c) => `
<p>These terms apply when you book a table, buy a ticket, order or pay through a venue's page on XTRA. XTRA is run by ${c.name}${c.address ? `, ${c.address}` : ''} ("XTRA", "we"). The venue you book with ("the venue") runs the night itself.</p>
<h2>Who does what</h2>
<ul><li>The venue sets its prices, minimum spends, deposits, events, door rules and age limits, and is responsible for the night, the service and the safety of its guests.</li>
<li>XTRA runs the booking pages, ticketing and payments for the venue. Card payments are processed by Paymob, a licensed payment provider in Egypt. XTRA never sees or keeps your full card number.</li></ul>
<h2>Bookings</h2>
<ul><li>A booking request is not confirmed until the venue accepts it. If the venue asks for a deposit, the booking is confirmed only after the deposit is paid.</li>
<li>A deposit is taken off your bill on the night. If your bill is below the area's minimum spend, the difference is added to your bill.</li>
<li>Arrive in your booked time slot. The venue may give your table away if you are more than 30 minutes late without telling them.</li>
<li>Service charge and VAT are added to bills as shown by the venue at the table.</li></ul>
<h2>Tickets</h2>
<ul><li>Seats and tickets are held for 10 minutes while you pay. If payment is not finished in time, they are released.</li>
<li>Each ticket has its own QR code and lets one person in once. Do not share or resell it. Screenshots work, but the first scan is the only one that counts.</li>
<li>The venue may refuse entry to anyone who breaks its door rules, is under the age limit or cannot show a valid ID, without a refund.</li>
<li>Ticket prices are set by the venue. A booking fee and VAT on that fee are added at checkout and shown before you pay.</li></ul>
<h2>Your account</h2>
<p>You sign in with a code sent to your phone. Keep your phone safe; anyone with it can see your bookings and tickets.</p>
<h2>Liability</h2>
<p>XTRA is responsible for the booking and ticketing service working as described. The venue is responsible for the event, the food and drinks, and what happens at the venue. Nothing in these terms limits your rights under Egyptian Consumer Protection Law No. 181 of 2018.</p>
<h2>Changes and law</h2>
<p>We may update these terms; the date at the top shows the latest version. Egyptian law applies and the courts of Cairo have jurisdiction.</p>
<h2>Contact</h2><p>Questions or complaints: ${c.contact}.</p>`,
  },
  privacy: {
    title: 'Privacy policy',
    body: (c) => `
<p>This policy explains what XTRA (${c.name}) and the venue you book with do with your personal data, under Egypt's Personal Data Protection Law No. 151 of 2020.</p>
<h2>What we collect</h2>
<ul><li>What you give us: name, mobile number, email, Instagram handle, gender, birth date if you add it, and the names and contacts of guests you book for.</li>
<li>What happens when you use XTRA: bookings, tickets, check-ins at the door, orders and bill totals, points and membership tier.</li>
<li>Payments: Paymob processes your card. We keep the payment result and amount, never your card number.</li></ul>
<h2>Why we use it</h2>
<ul><li>To run your booking or ticket: send confirmations, payment links, QR passes and reminders by WhatsApp and email, and check you in at the door (needed to give you the service).</li>
<li>So the venue can know its guests: visits, spend, notes and VIP status (the venue's legitimate interest in running its place).</li>
<li>To send you offers and events, only if you ticked the box to agree. Every offer has a way to stop them, and you can withdraw at any time.</li>
<li>To keep records the law requires, such as invoices and tax records.</li></ul>
<h2>Who sees it</h2>
<ul><li>The venue you booked with sees your details and history at that venue. Other venues on XTRA do not see your history with this venue.</li>
<li>Service providers who work for us: Paymob (payments), Meta (WhatsApp messages), our email provider, Google and Apple if you add a pass to your wallet, and our hosting provider. They only use your data to provide that service.</li>
<li>Authorities, when the law requires it.</li></ul>
<p>We do not sell your data.</p>
<h2>How long we keep it</h2>
<p>We keep your account and history while you use XTRA and for 3 years after your last booking or ticket, then delete or anonymise it. Payment and tax records are kept for as long as Egyptian law requires.</p>
<h2>Your rights</h2>
<p>You can ask to see your data, correct it, get a copy, stop marketing, or have it deleted (unless we must keep it by law). Contact us and we will answer within 30 days. You can also complain to the Personal Data Protection Center.</p>
<h2>Security</h2>
<p>Data is sent over HTTPS, passwords are hashed, staff only see the venues they work at, and the database is backed up daily.</p>
<h2>Contact</h2><p>${c.contact}.</p>`,
  },
  refunds: {
    title: 'Refund and cancellation policy',
    body: (c) => `
<p>This policy covers money you pay through XTRA: ticket orders and booking deposits. Bills paid at the table are handled by the venue.</p>
<h2>Tickets</h2>
<ul><li>Tickets cannot be refunded or exchanged once bought, unless the event is cancelled, moved to another date, or changed in a big way (for example the main artist does not perform).</li>
<li>If the event is cancelled, you get the full ticket price back, booking fee included, to the card you paid with.</li>
<li>If the event is moved, your ticket is valid for the new date. If you cannot go, ask for a refund within 7 days of the announcement.</li>
<li>Free tickets from promo codes have no cash value.</li></ul>
<h2>Booking deposits</h2>
<ul><li>Your deposit is taken off your bill on the night.</li>
<li>Cancel at least 24 hours before your booking and you get the deposit back.</li>
<li>Cancel later than that, or not show up, and the venue keeps the deposit.</li>
<li>If the venue cancels or cannot give you your table, you get the full deposit back.</li></ul>
<h2>How refunds are paid</h2>
<p>Refunds go back to the card or wallet you paid with, through Paymob. They are sent within 7 days of being approved; your bank may take up to 14 more days to show them.</p>
<h2>How to ask</h2>
<p>${c.contact[0].toUpperCase() + c.contact.slice(1)}, with your order or booking code (it is in your confirmation message). Your rights under Egyptian Consumer Protection Law No. 181 of 2018 are not affected.</p>`,
  },
};

function page(key: string) {
  const p = PAGES[key], c = company();
  const links = Object.entries(PAGES).map(([k, v]) => k === key ? `<b>${v.title}</b>` : `<a href="/${k}">${v.title}</a>`).join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.title} · XTRA</title><link rel="icon" href="/web/favicon.svg" type="image/svg+xml">
<style>:root{color-scheme:light dark;--bg:light-dark(#fff,#0c0e26);--ink:light-dark(#12153f,#eef1ff);--mute:light-dark(#5b6280,#9aa2cc);--line:light-dark(#d7dde3,#2a2e5c)}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Archivo,system-ui,sans-serif}main{max-width:720px;margin:0 auto;padding:40px 20px 64px}
h1{font-size:clamp(28px,5vw,38px);font-weight:800;letter-spacing:-.02em;line-height:1.1;margin:0 0 6px}h2{font-size:19px;margin:30px 0 8px}
.upd{color:var(--mute);font-size:14px;margin:0 0 24px}ul{padding-left:20px}li{margin:6px 0}a{color:inherit;font-weight:600}
nav{font-size:14px;color:var(--mute);border-top:1px solid var(--line);margin-top:40px;padding-top:16px}</style></head>
<body><main><h1>${p.title}</h1><p class="upd">Last updated ${UPDATED}</p>${p.body(c)}<nav>${links}</nav></main></body></html>`;
}

export default async function legal(app: FastifyInstance) {
  for (const key of Object.keys(PAGES)) {
    app.get(`/${key}`, async (_req, reply) => reply.type('text/html').header('Cache-Control', 'public, max-age=3600').send(page(key)));
  }
}

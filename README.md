# XTRA platform

The backend and web app for XTRA, a hospitality system sold to venues in Egypt: reservations
with a seat map, door check-in, ordering and bills, white-label ticketing, promo
codes, payments, guest accounts, community tiers and WhatsApp/email marketing.

Stack: Node.js 22, TypeScript, Fastify, PostgreSQL (Drizzle ORM), Zod, Vitest.

## Run it

```bash
cp .env.example .env
docker compose up -d        # or any Postgres 16
npm install
npm run seed                # creates the XTRA admin and a demo venue "lumen-rooftop"
npm run dev                 # http://localhost:3000
```

Open http://localhost:3000 and sign in with the XTRA admin (`SUPER_ADMIN_EMAIL` /
`SUPER_ADMIN_PASSWORD`, `admin@xtra.eg` / `admin1234` by default).

## The web app (`web/`)

One page, no build step, served by the same server:

| Address | Who | What |
| --- | --- | --- |
| `/` | Staff | Floor, bookings, door scanner, orders and bills, kitchen and bar screen, menu, events, marketing, guests, community, booking page, floor map, venue setup |
| `/book/:slug` | Guests | Booking page of a venue |
| `/b/:code` | Guests | Booking status, deposit payment, QR pass |
| `/e/:eventId` | Guests | Ticket page: seat map (theatre rows, standing, tables or a mix), 10-minute hold from the first pick, promo code, Paymob checkout |
| `/o/:code` | Guests | Ticket order: payment status and every ticket |
| `/t/:token`, `/p/:token` | Guests | One ticket or booking pass with its QR |
| `/me` | Guests | Account, signed in with a WhatsApp code |

Staff screens show what each role may use. Built-in roles: owner and manager
(everything), door (floor, bookings, door), waiter (floor, orders). A venue can
also make its own roles and pick exactly which screens they open.

**XTRA admin** (super admins only, in the staff app): create venues with their
owner account, switch modules on or off per venue (reservations, ordering,
tickets, marketing, guest list, community), build roles and add accounts.
Every `/venues/:id/...` route is checked against `src/lib/access.ts` (screen
permission + venue module), and guest pages of a module that is off return 404. The QR libraries are vendored in
`web/vendor` (MIT).

Tests need a database called `xtra_test` (`createdb xtra_test`), then `npm test`.

Without Paymob / WhatsApp / email keys everything still works: payments open a
built-in test checkout at `/dev/pay/:id`, and messages are saved to the
`messages` table instead of being sent. Add keys in `.env` to go live.

## Rules the code follows

- Money is integer piastres (EGP 1 = 100). Percentages are basis points (5% = 500).
- Each venue is a tenant; staff only see venues they belong to. Roles: owner, manager, door, waiter. XTRA admins see everything.
- Guests are one profile per phone number across the platform. What a venue knows about them (tags, visits, spend, points) is per venue.
- **Table bill**: items, plus a top-up to the area's minimum spend, plus service (12% default) on that, plus VAT (14%) on base + service, minus the paid deposit.
- **Tickets**: promo % comes off the ticket price, the booking fee (platform default 5%, editable by XTRA admins, can be overridden per venue or event) is on the discounted price, and 14% VAT is on the fee only. A 100% code makes the order free.
- **Holds**: the first seat a guest taps holds it for 10 minutes; adding or dropping seats keeps the same clock. Other guests see held seats as "on hold". Expired holds free the seats and the promo use (a sweeper runs every 20 seconds).
- **Corporate / private events**: switch an event to *Invitation only* and nothing is sold. Sections can be *free seating* (sit anywhere in the section) or own seats. Invite one person to a zone or a seat picked on the map, or paste a list: own-seat sections hand out the next free seats row by row (`POST /venues/:id/events/:eventId/invites/bulk`).
- **Passes**: every ticket QR is tied to its seat, table or standing zone. Opening the pass shows the map with a walking route from the entrance.
- **Kitchen and bar**: each menu item goes to the kitchen or the bar. One *Send* from a waiter is one ticket number; the Kitchen screen shows it once per station, oldest first, turning yellow after 10 minutes and red after 20. *Ready* shows on the waiter's order. A device can print every new ticket (80 mm); Chrome started with `--kiosk-printing` prints without a dialog. Every venue gets a ready-made *Kitchen* role that only opens this screen.
- **Extras**: a menu item can have sets of extras (pick one, must pick one, or pick any), each choice with its own price. The price is added to the line and copied onto the bill.
- **Marketing** only reaches guests who opted in on that channel (Law 151/2020).

## API map

All under `/api`. Staff send `Authorization: Bearer <token>` from `/auth/login`.

| Area | Endpoints |
| --- | --- |
| Sign in | `POST /auth/login`, `GET /auth/me`, guest: `POST /guest/otp`, `POST /guest/verify`, `GET/PATCH /guest/me` |
| XTRA admin | `GET/PUT /admin/settings` (booking fee, VAT on fees), `GET/POST /admin/venues` (onboard venue + owner) |
| Venue setup | `GET/PATCH /venues/:id`, staff `GET/POST/DELETE /venues/:id/staff`, time slots `GET/PUT /venues/:id/slots` |
| Floor map | `GET/PUT /venues/:id/floor` (whole map: zones, tables, sofas, chairs, bar, DJ...), `PATCH /venues/:id/floor/:itemId` (switch a chair on/off) |
| Bookings | `GET/POST /venues/:id/reservations`, `.../:rid/accept`, `/decline`, `/table`, `/cancel`, `/no-show`, `/complete`, live map `GET /venues/:id/tonight` |
| Door | `POST /venues/:id/checkin` with the QR token (booking passes and tickets) |
| Ordering | menu `GET/POST/PATCH /venues/:id/menu` (station kitchen/bar, extras), bills `GET/POST /venues/:id/tabs`, `.../:tabId/items` (with extras and a note), `/send` (one ticket number), `/remove`, `/items/:itemId/void`, `/pay` |
| Kitchen and bar | `GET /venues/:id/kitchen?station=kitchen\|bar\|all` (open tickets + ready in the last 20 min), `POST .../kitchen/:ticketNo/ready` `{station, ready}` |
| Events | `GET/POST/PATCH /venues/:id/events`, seat map `PUT .../:eventId/map`, `GET .../sales`, `GET .../tickets` |
| Promo codes | `GET/POST /venues/:id/promos`, `POST /venues/:id/promos/batch` (unique single-use codes, optionally locked to phones), `PATCH .../:promoId` |
| Guests | `GET /venues/:id/guests?q=&tag=`, `GET/PATCH .../:guestId`, `POST .../:guestId/points`, tiers `GET/PUT /venues/:id/tiers` |
| Campaigns | `GET/POST/PATCH /venues/:id/campaigns`, `POST .../audience` (count), `POST .../:cid/send` |
| Guest pages | `GET /public/venues/:slug`, `/slots?date=`, `POST /public/venues/:slug/bookings`, status `GET /public/bookings/:code`, deposit `POST .../pay`, pass `GET /public/pass/:token`, QR image `GET /public/qr/:token.png` |
| Guest tickets | `GET /public/venues/:slug/events`, `GET /public/events/:id`, `POST .../hold`, `GET /public/orders/:code`, `POST .../promo`, `POST .../checkout` |
| Webhooks | `POST /webhooks/paymob` (HMAC checked) |

## Accounts needed to go live

| Service | Used for | Env vars |
| --- | --- | --- |
| Paymob | Deposits, tickets, bill links (card, wallets, InstaPay, valU...) | `PAYMOB_*` |
| WhatsApp Business (Meta Cloud API) | Booking updates, passes, tickets, campaigns | `WHATSAPP_*` |
| Resend (or any email API) | Emails | `RESEND_API_KEY`, `EMAIL_FROM` |
| Google Wallet issuer | "Add to Google Wallet" | `GOOGLE_WALLET_*` |
| Apple Developer (Pass Type ID) | "Add to Apple Wallet" | `APPLE_PASS_P12`, `APPLE_PASS_P12_PASSWORD` |

## Next

- Paymob split payouts to each venue's sub-account.
- Hosting (e.g. Railway / Render / AWS Bahrain) and a real domain for guest links.

## Images and location

- Venues upload images from the staff app (event cover on the event screen, venue photo in Venue setup). The browser shrinks them, then `POST /api/venues/:venueId/media` stores them in Postgres (`media` table, 3 MB max, JPG/PNG/WebP). They are served at `/media/:id` with a long cache.
- Paste a Google Maps link in Venue setup → Location. The server reads the pin from it (short `maps.app.goo.gl` links are followed) and guest pages show a map with a Directions button.
- Guest pages are phone first; on tablet and desktop the ticket page and booking page switch to a wide layout.

## Wallet passes

Booking passes, tickets and invitations can be added to Apple Wallet and Google Wallet. Each wallet switches on by itself once its env vars are set (step by step: `docs/wallet-setup.md`). Until then guests get their QR by WhatsApp/email and on the pass page.

- The pass carries the venue's name, logo and colour, the event poster (Apple strip / Google hero), date and time, the QR, and the place: Section / Row / Seat, Section / Table, Free seating, or Area / Table / Party for bookings.
- Buttons: on the pass page (`/p/:token`, `/t/:token`) and under every QR in pass, reminder, ticket and invitation emails. Links: `GET /api/public/pass/:token/apple.pkpass` and `GET /api/public/pass/:token/google` (redirects to a freshly signed Save link).
- Updates: when a booking's table changes, a booking is cancelled or marked no-show, an invitation is cancelled, an event's name/time/poster/colour/status changes, a seat map edit renames a sold seat's section or label, or the venue's name/logo/colour/address changes, saved passes update. Apple: phones register at `/api/wallet/apple/v1/...` (Apple's pass web service, needs https) and get an APNs push; Google: the saved pass is patched through the Wallet REST API. Cancelled passes show as void / inactive.
- **Apple**: `APPLE_PASS_P12` (the .p12 exported from Keychain, base64) and `APPLE_PASS_P12_PASSWORD`. The Pass Type ID and Team ID are read from the certificate (`APPLE_PASS_TYPE_ID` / `APPLE_TEAM_ID` override). PEM instead of .p12 also works: `APPLE_PASS_CERT`, `APPLE_PASS_KEY`, `APPLE_PASS_KEY_PASSPHRASE`. The Apple WWDR G4 certificate is downloaded from Apple on first use (`APPLE_WWDR_CERT` overrides).
- **Google**: `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY` (from the service account JSON key; `\n` escapes allowed). The Save link carries the pass class, so nothing else needs creating in the console.

## Reports

`GET /api/venues/:venueId/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` (default: last 30 nights; a night runs until 6 AM Cairo time). Needs the `reports` permission (owners and managers have it). Money in per night, payment methods, deposits, bookings and no-shows, covers, top guests, best sellers and ticket sales per event. The staff app's Reports screen also downloads a CSV.

## Policies

`/terms`, `/privacy` and `/refunds` are linked from the booking, ticket and checkout pages. Set `LEGAL_COMPANY_NAME`, `LEGAL_ADDRESS`, `SUPPORT_EMAIL` and `SUPPORT_PHONE` so they show your company and contact details. Have a lawyer review them.

## WhatsApp templates and inbox

WhatsApp only lets a business start a chat with a Meta-approved template, so every guest message names one. The list, texts and samples are in `docs/whatsapp-templates.md`; the code that fills them is `src/modules/guest-messages.ts`. `WHATSAPP_TEMPLATE_LANGUAGE` (default `en`) sets the language code.

Guest replies come in on `/webhooks/whatsapp` (set `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`). A reply goes to the venue that last wrote to that number, shows in **Messages → WhatsApp chats**, and staff with the Messages permission can answer while the chat is open (24 hours after the guest's last message). Delivery and read receipts update each message. "STOP" turns off WhatsApp offers for that guest.

Emails are branded HTML (`src/integrations/email-html.ts`) sent as "<Venue> via XTRA", with replies going to the venue's email. Offer emails carry a signed unsubscribe link (`/unsubscribe`). Email goes by SMTP when `MAIL_HOST`, `MAIL_USERNAME` and `MAIL_PASSWORD` are set (also `MAIL_PORT`, default 465, `MAIL_FROM`, `MAIL_SSL_ENABLE`, default true, `MAIL_STARTTLS_ENABLE`, default false). Otherwise it goes through Resend (`RESEND_API_KEY`, `EMAIL_FROM`), and with neither it is only logged.

XTRA admins can check a channel with `POST /api/admin/test-message {channel, to}`.

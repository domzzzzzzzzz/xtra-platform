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
| `/` | Staff | Floor, bookings, door scanner, orders and bills, events, marketing, guests, community, booking page, floor map, venue setup |
| `/book/:slug` | Guests | Booking page of a venue |
| `/b/:code` | Guests | Booking status, deposit payment, QR pass |
| `/e/:eventId` | Guests | Ticket page: seat map, 15-minute hold, promo code, Paymob checkout |
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
- **Holds**: picking seats holds them for 15 minutes. Expired holds free the seats and the promo use.
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
| Ordering | menu `GET/POST/PATCH /venues/:id/menu`, bills `GET/POST /venues/:id/tabs`, `.../:tabId/items`, `/send`, `/items/:itemId/void`, `/pay` |
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
| Apple Developer (Pass Type ID) | "Add to Apple Wallet" (.pkpass signing, not built yet) | later |

## Next

- Apple Wallet `.pkpass` signing once the Apple certificate exists.
- Paymob split payouts to each venue's sub-account.
- Hosting (e.g. Railway / Render / AWS Bahrain) and a real domain for guest links.

## Images and location

- Venues upload images from the staff app (event cover on the event screen, venue photo in Venue setup). The browser shrinks them, then `POST /api/venues/:venueId/media` stores them in Postgres (`media` table, 3 MB max, JPG/PNG/WebP). They are served at `/media/:id` with a long cache.
- Paste a Google Maps link in Venue setup → Location. The server reads the pin from it (short `maps.app.goo.gl` links are followed) and guest pages show a map with a Directions button.
- Guest pages are phone first; on tablet and desktop the ticket page and booking page switch to a wide layout.

## Wallet passes

Both wallets are built and switch on by themselves once their env vars are set. Until then guests get their QR by WhatsApp/email and on the pass page.

- **Apple Wallet** (needs an Apple Developer account, 99 USD a year): create a Pass Type ID (e.g. `pass.com.xtratickets.hospitality`), make its certificate, export it, and set
  `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT` (PEM), `APPLE_PASS_KEY` (PEM), `APPLE_PASS_KEY_PASSPHRASE` (if any) and `APPLE_WWDR_CERT` (Apple WWDR G4, PEM). PEM values can use `\n` for new lines.
  Guests download `GET /api/public/pass/:token/apple.pkpass`.
- **Google Wallet**: in the Google Pay & Wallet Console get an Issuer ID, create a Google Cloud service account with the Wallet API enabled, add it as a user of the issuer, and set
  `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY`. The save link carries the pass class, so nothing else needs creating.

## Reports

`GET /api/venues/:venueId/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` (default: last 30 nights; a night runs until 6 AM Cairo time). Needs the `reports` permission (owners and managers have it). Money in per night, payment methods, deposits, bookings and no-shows, covers, top guests, best sellers and ticket sales per event. The staff app's Reports screen also downloads a CSV.

## Policies

`/terms`, `/privacy` and `/refunds` are linked from the booking, ticket and checkout pages. Set `LEGAL_COMPANY_NAME`, `LEGAL_ADDRESS`, `SUPPORT_EMAIL` and `SUPPORT_PHONE` so they show your company and contact details. Have a lawyer review them.

## WhatsApp templates

WhatsApp only lets a business start a chat with a Meta-approved template, so every guest message names one (`src/integrations/notify.ts`, `WaTemplate`). Create these in WhatsApp Manager, language English, each with a dynamic "Visit website" button `https://<PUBLIC_APP_URL host>/{{1}}` (the code fills in the path, like `b/AB12CD`):

| Template | Category | Body values |
|---|---|---|
| `xtra_login_code` | Authentication (copy code) | code |
| `xtra_booking_received` | Utility | name, venue, date, time |
| `xtra_booking_accepted` | Utility | name, venue, date, time |
| `xtra_booking_deposit` | Utility | name, venue, date, deposit |
| `xtra_booking_declined` | Utility | name, venue, date |
| `xtra_booking_pass` | Utility | name, venue, date and time |
| `xtra_booking_reminder` | Utility | name, venue, time |
| `xtra_ticket` | Utility | name, event, venue, when |
| `xtra_visit_thanks`, `xtra_birthday`, `xtra_winback` | Marketing | name, venue |

`WHATSAPP_TEMPLATE_LANGUAGE` (default `en`) sets the language code. XTRA admins can check a channel with `POST /api/admin/test-message {channel, to}`; WhatsApp uses Meta's `hello_world` template unless `template` is given. Email goes by SMTP when `MAIL_HOST`, `MAIL_USERNAME` and `MAIL_PASSWORD` are set (also `MAIL_PORT`, default 465, `MAIL_FROM`, `MAIL_SSL_ENABLE`, default true, `MAIL_STARTTLS_ENABLE`, default false), for example a Hostinger mailbox. Otherwise it goes through Resend (`RESEND_API_KEY`, `EMAIL_FROM`), and with neither it is only logged.

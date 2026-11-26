# XTRA platform API

The backend for XTRA, a hospitality system sold to venues in Egypt: reservations
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

- Connect the front-end prototype to this API.
- Apple Wallet `.pkpass` signing once the Apple certificate exists.
- Paymob split payouts to each venue's sub-account.
- Hosting (e.g. Railway / Render / AWS Bahrain) and a real domain for guest links.

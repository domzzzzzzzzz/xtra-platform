# WhatsApp templates

Create these in WhatsApp Manager → Message templates. For all of them:

- **Language:** English
- **Header:** Text, `{{1}}` (the venue name, sample `Lumen Rooftop`). Not for `xtra_login_code`.
- **Button:** Visit website, Dynamic, URL `https://hospitality.xtratickets.com/{{1}}`, with the sample path shown.
- **Marketing templates:** add the footer `Reply STOP to opt out`.

| Name | Category | Body | Body samples | Button text | Button sample |
|---|---|---|---|---|---|
| `xtra_login_code` | Authentication | (Meta writes it; pick "Copy code", expiry 10 minutes) | 123456 | Copy code | |
| `xtra_booking_received` | Utility | Hi {{1}}, we received your booking request for {{2}} at {{3}}, {{4}} guests. We will confirm it shortly. | Nour · Sat 5 Dec · 10:00 PM · 4 | Track booking | b/AB12CD |
| `xtra_booking_accepted` | Utility | Hi {{1}}, your booking is confirmed for {{2}} at {{3}}, {{4}} guests. Please arrive within 30 minutes of your time. | Nour · Sat 5 Dec · 10:00 PM · 4 | View booking | b/AB12CD |
| `xtra_booking_deposit` | Utility | Hi {{1}}, your booking for {{2}} is accepted. Pay the {{3}} deposit to confirm your table. It comes off your bill on the night. | Nour · Sat 5 Dec · EGP 1,000 | Pay deposit | b/AB12CD |
| `xtra_deposit_paid` | Utility | Hi {{1}}, we received your {{2}} deposit. Your booking for {{3}} is confirmed and your booking code is {{4}}. Your passes are on the way. | Nour · EGP 1,000 · Sat 5 Dec · AB12CD | View booking | b/AB12CD |
| `xtra_booking_declined` | Utility | Hi {{1}}, we are sorry, we cannot take your booking for {{2}}. We would love to host you another night. | Nour · Sat 5 Dec | Book another night | book/lumen-rooftop |
| `xtra_booking_cancelled` | Utility | Hi {{1}}, your booking for {{2}} has been cancelled. {{3}} If you have any questions, reply to this message. | Nour · Sat 5 Dec · Your EGP 1,000 deposit will be refunded to your card within 7 days. | Book another night | book/lumen-rooftop |
| `xtra_booking_pass` | Utility | Hi {{1}}, you are on the guest list for {{2}} at {{3}}. Show your pass at the door. It is yours only and works once. | Nour · Sat 5 Dec · 10:00 PM | Open pass | p/abc123 |
| `xtra_booking_reminder` | Utility | Hi {{1}}, see you tonight at {{2}}. Have your pass ready at the door. | Nour · 10:00 PM | Open pass | p/abc123 |
| `xtra_ticket` | Utility | Hi {{1}}, your ticket for {{2}} on {{3}} is ready ({{4}}). Show the QR at the door. It lets one person in once. | Nour · Afro Night · Sat 5 Dec, 10:00 pm · VIP | Open ticket | t/abc123 |
| `xtra_ticket_order` | Utility | Hi {{1}}, your {{2}} tickets for {{3}} on {{4}} are ready. Open them and share each one with its guest. | Nour · 4 · Afro Night · Sat 5 Dec, 10:00 pm | Open tickets | o/6JVFCS |
| `xtra_visit_thanks` | Marketing | Hi {{1}}, thank you for spending the night with us. We hope to see you again soon. | Nour | Book again | book/lumen-rooftop |
| `xtra_birthday` | Marketing | Hi {{1}}, your birthday is coming up and we would love to celebrate with you. Book your table now. | Nour | Book a table | book/lumen-rooftop |
| `xtra_winback` | Marketing | Hi {{1}}, it has been a while and we miss you. Come back this week, your table is waiting. | Nour | Book a table | book/lumen-rooftop |

The code that fills them is in `src/modules/guest-messages.ts`. A changed text must match there.

## Webhook (replies and read receipts)

In the Meta app: WhatsApp → Configuration → Webhook → Edit.

- Callback URL: `https://hospitality.xtratickets.com/webhooks/whatsapp`
- Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
- Then subscribe to the `messages` field.

`WHATSAPP_APP_SECRET` (App settings → Basic → App secret) must be set, or the webhook refuses every call.

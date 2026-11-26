# WhatsApp templates

Create these in WhatsApp Manager → Message templates. For all of them:

- **Language:** English
- **Header:** Text, `{{1}}` (the venue name, sample `Lumen Rooftop`). Not for `xtra_login_code`.
- **Button:** Visit website, Dynamic, URL `https://hospitality.xtratickets.com/{{1}}`, with the sample path shown.
- **Marketing templates:** add the footer `Reply STOP to opt out`.

| Name | Category | Body | Body samples | Button text | Button sample |
|---|---|---|---|---|---|
| `xtra_login_code` | Authentication | (Meta writes it; "Copy code", security line, expiry 10 minutes) | 123456 | Copy code | |
| `xtra_booking_received` | Utility | Hi {{1}}, we received your booking request for {{2}} at {{3}}, {{4}} guests. We will confirm it shortly. | Nour · Sat 5 Dec · 10:00 PM · 4 | Track booking | b/AB12CD |
| `xtra_booking_accepted` | Utility | Hi {{1}}, your booking is confirmed for {{2}} at {{3}}, {{4}} guests. Please arrive within 30 minutes of your time. | Nour · Sat 5 Dec · 10:00 PM · 4 | View booking | b/AB12CD |
| `xtra_booking_deposit` | Utility | Hi {{1}}, your booking for {{2}} is accepted. Pay the {{3}} deposit to confirm your table. It comes off your bill on the night. | Nour · Sat 5 Dec · EGP 1,000 | Pay deposit | b/AB12CD |
| `xtra_deposit_paid` | Utility | Hi {{1}}, we received your {{2}} deposit. Your booking for {{3}} is confirmed and your booking code is {{4}}. Your passes are on the way. | Nour · EGP 1,000 · Sat 5 Dec · AB12CD | View booking | b/AB12CD |
| `xtra_booking_declined` | Utility | Hi {{1}}, we are sorry, we cannot take your booking for {{2}}. You can choose another date using the link below. | Nour · Sat 5 Dec | Choose another date | book/lumen-rooftop |
| `xtra_booking_cancelled` | Utility | Hi {{1}}, your booking for {{2}} has been cancelled. {{3}} If you have any questions, reply to this message. | Nour · Sat 5 Dec · Your EGP 1,000 deposit will be refunded to your card within 7 days. | Choose another date | book/lumen-rooftop |
| `xtra_booking_pass` | Utility | Hi {{1}}, you are on the guest list for {{2}} at {{3}}. Your entry pass is ready, please show it at the door when you arrive. | Nour · Sat 5 Dec · 10:00 PM | Open pass | p/abc123 |
| `xtra_booking_reminder` | Utility | Hi {{1}}, this is a reminder of your booking tonight at {{2}}. Please have your entry pass ready at the door. | Nour · 10:00 PM | Open pass | p/abc123 |
| `xtra_ticket` | Utility | Hi {{1}}, your {{4}} ticket for {{2}} on {{3}} is ready. Please show the QR code at the door when you arrive. | Nour · Afro Night · Sat 5 Dec, 10:00 pm · VIP | Open ticket | t/abc123 |
| `xtra_ticket_order` | Utility | Hi {{1}}, your {{2}} tickets for {{3}} on {{4}} are ready. Open them and share each one with its guest. | Nour · 4 · Afro Night · Sat 5 Dec, 10:00 pm | Open tickets | o/6JVFCS |
| `xtra_visit_thanks` | Marketing | Hi {{1}}, thank you for spending the night with us. We hope to see you again soon. | Nour | Book again | book/lumen-rooftop |
| `xtra_birthday` | Marketing | Hi {{1}}, your birthday is coming up and we would love to celebrate with you. Book your table now. | Nour | Book a table | book/lumen-rooftop |
| `xtra_winback` | Marketing | Hi {{1}}, it has been a while and we miss you. Come back this week, your table is waiting. | Nour | Book a table | book/lumen-rooftop |

The code that fills them is in `src/modules/guest-messages.ts`. A changed text must match there.

The declined, cancelled, pass, reminder and ticket texts were reworded when they were submitted, because Meta's category check read the first versions as marketing or as a login code. The parameters did not change.

The WhatsApp account also holds other brands' numbers, so the webhook only takes events whose `metadata.phone_number_id` is `WHATSAPP_PHONE_NUMBER_ID`.

## Webhook (replies and read receipts)

The Meta app and the WhatsApp account are shared with other brands, so do not change the app's webhook in the developer dashboard. Point only our number at this system instead:

1. In Dokploy set `WHATSAPP_VERIFY_TOKEN` (any word) and `WHATSAPP_APP_SECRET` (the Meta app's App secret, from the app admin: App settings, Basic). Redeploy.
2. As super admin, `POST /api/admin/whatsapp-webhook`. It sets the phone number's `webhook_configuration.override_callback_uri` to `https://hospitality.xtratickets.com/webhooks/whatsapp`. Meta checks the verify token first. `GET` on the same path shows the current setting.

Without `WHATSAPP_APP_SECRET` the webhook refuses every call.

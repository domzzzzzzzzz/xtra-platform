# Wallet passes: setup

Both wallets are already built. Each one turns on by itself once its env vars are set in Dokploy (XTRA Hospitality → Environment) and the app is redeployed. The admin Integrations card then shows them as Live.

## Apple Wallet

Needs an Apple Developer account (99 USD a year). An organization account (shows "XTRA" as the seller) needs a D-U-N-S number; an individual account also works.

1. developer.apple.com → Account → **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → **Pass Type IDs**.
   Description `XTRA Passes`, identifier `pass.com.xtratickets.hospitality`. Register.
2. On a Mac: **Keychain Access** → menu **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**. Your email, name `XTRA`, choose **Saved to disk**. You get `CertificateSigningRequest.certSigningRequest`.
3. Back on Apple: open the Pass Type ID → **Create Certificate** → upload that file → **Download** (`pass.cer`). Double-click it so it goes into Keychain.
4. Keychain Access → **My Certificates** → right-click **Pass Type ID: pass.com.xtratickets.hospitality** → **Export** → save as `xtra-pass.p12` with a password.
5. Terminal: `base64 -i xtra-pass.p12 | pbcopy` (copies it).
6. Dokploy env:
   ```
   APPLE_PASS_P12=<paste>
   APPLE_PASS_P12_PASSWORD=<the password from step 4>
   ```
   Redeploy. The Pass Type ID and Team ID are read from the certificate, and Apple's WWDR certificate is downloaded automatically.

No Mac? Any computer with OpenSSL:
```
openssl req -new -newkey rsa:2048 -nodes -keyout pass.key -out pass.csr -subj "/CN=XTRA/emailAddress=you@example.com"
# upload pass.csr in step 3, download pass.cer, then:
openssl x509 -inform der -in pass.cer -out pass.pem
```
and set `APPLE_PASS_CERT` (contents of pass.pem) and `APPLE_PASS_KEY` (contents of pass.key) instead of the .p12.

The certificate is valid for about a year. Renew it the same way before it expires, otherwise new passes cannot be signed (saved passes keep working).

## Google Wallet

1. pay.google.com/business/console → **Google Wallet API** → create the issuer account (business name `XTRA`). Copy the **Issuer ID**.
2. console.cloud.google.com → create a project (e.g. `xtra-wallet`) → **APIs & Services → Library** → enable **Google Wallet API**.
3. **IAM & Admin → Service Accounts → Create** (`xtra-wallet`) → open it → **Keys → Add key → JSON**. A .json file downloads.
4. Back in the Wallet console → **Users → Invite a user** → the service account email (`...@...iam.gserviceaccount.com`) → role **Developer**.
5. Dokploy env, from the .json file:
   ```
   GOOGLE_WALLET_ISSUER_ID=<Issuer ID>
   GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL=<client_email>
   GOOGLE_WALLET_PRIVATE_KEY=<private_key, pasted as is, with the \n>
   ```
   Redeploy.
6. Until Google approves the account, only test users can save passes: add your Gmail under **Test users**, try a pass, then press **Request publishing access** in the console (Google reviews it, usually a few days).

## What guests see

- Pass page and emails: "Add to Apple Wallet" and "Add to Google Wallet" under each QR.
- The pass: venue name, logo and colour, event poster, date and time, the QR, and Section / Row / Seat, Table, or Area / Table / Party.
- Changes (table moved, event time changed, booking or invitation cancelled, venue logo changed) reach saved passes on their own. Cancelled passes show as no longer valid.

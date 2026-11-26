import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/xtra',
  jwtSecret: env.JWT_SECRET ?? 'dev-secret-change-me',
  publicAppUrl: (env.PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  superAdmin: { email: env.SUPER_ADMIN_EMAIL ?? 'admin@xtra.eg', password: env.SUPER_ADMIN_PASSWORD ?? 'admin1234' },
  paymob: {
    secretKey: env.PAYMOB_SECRET_KEY ?? '',
    publicKey: env.PAYMOB_PUBLIC_KEY ?? '',
    hmacSecret: env.PAYMOB_HMAC_SECRET ?? '',
    integrationIds: (env.PAYMOB_INTEGRATION_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(Number),
  },
  whatsapp: { token: env.WHATSAPP_TOKEN ?? '', phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '' },
  email: { resendKey: env.RESEND_API_KEY ?? '', from: env.EMAIL_FROM ?? 'XTRA <no-reply@xtra.eg>' },
  googleWallet: {
    issuerId: env.GOOGLE_WALLET_ISSUER_ID ?? '',
    serviceAccountEmail: env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL ?? '',
    privateKey: (env.GOOGLE_WALLET_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
  /** Apple Wallet: Pass Type ID certificate (PEM text; "\n" escapes allowed). */
  appleWallet: {
    passTypeId: env.APPLE_PASS_TYPE_ID ?? '',
    teamId: env.APPLE_TEAM_ID ?? '',
    cert: (env.APPLE_PASS_CERT ?? '').replace(/\\n/g, '\n'),
    key: (env.APPLE_PASS_KEY ?? '').replace(/\\n/g, '\n'),
    keyPassphrase: env.APPLE_PASS_KEY_PASSPHRASE ?? '',
    wwdr: (env.APPLE_WWDR_CERT ?? '').replace(/\\n/g, '\n'),
  },
  holdMinutes: 15,
};

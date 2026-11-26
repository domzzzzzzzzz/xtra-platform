import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/xtra_test',
      JWT_SECRET: 'test-secret',
      PUBLIC_APP_URL: 'http://test.local',
      PAYMOB_SECRET_KEY: '',
      PAYMOB_HMAC_SECRET: 'test-hmac',
      WHATSAPP_TOKEN: '',
      RESEND_API_KEY: '',
    },
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});

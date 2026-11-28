import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { AppError } from './lib/errors.js';
import auth from './modules/auth.js';
import admin from './modules/admin.js';
import venues from './modules/venues.js';
import reservations from './modules/reservations.js';
import tabs from './modules/tabs.js';
import ticketing from './modules/ticketing.js';
import publicRoutes from './modules/public.js';
import passRoutes from './modules/passes.js';
import crm from './modules/crm.js';
import payments from './modules/payments.js';
import automations from './modules/automations.js';
import media, { mediaFiles } from './modules/media.js';
import reports from './modules/reports.js';
import refunds from './modules/refunds.js';
import waitlist from './modules/waitlist.js';
import dailyReport from './modules/daily-report.js';
import kitchen from './modules/kitchen.js';
import shift from './modules/shift.js';
import promoters from './modules/promoters.js';
import accounts from './modules/accounts.js';
import legal from './modules/legal.js';
import inbox, { unsubscribePage, whatsappWebhook } from './modules/inbox.js';

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({ trustProxy: true, ...opts });
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.jwtSecret });

  // HTML forms (test checkout) post urlencoded.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    const e = err as { statusCode?: number; message: string; code?: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: 'bad_request', message: e.message });
    // Postgres: invalid uuid in a path
    if (e.code === '22P02') return reply.code(404).send({ error: 'not_found', message: 'Not found' });
    req.log.error(err);
    return reply.code(500).send({ error: 'server_error', message: 'Something went wrong. Please try again.' });
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(async (api) => {
    for (const m of [auth, admin, venues, reservations, tabs, ticketing, publicRoutes, passRoutes, crm, automations, media, reports, inbox, refunds, waitlist, dailyReport, accounts, kitchen, shift, promoters]) await api.register(m);
  }, { prefix: '/api' });
  await app.register(payments);
  await app.register(mediaFiles);
  await app.register(legal);
  await app.register(whatsappWebhook);
  await app.register(unsubscribePage);

  // The web app: one page for staff and guests. Guest links open guest screens.
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
  await app.register(fastifyStatic, { root: webRoot, prefix: '/web/', wildcard: false, index: false });
  // Each start gets a new asset version, so browsers and Cloudflare pick up new CSS/JS after a deploy.
  const version = Date.now().toString(36);
  const html = (await readFile(path.join(webRoot, 'index.html'), 'utf8')).replace(/(\/web\/[\w./-]+\.(?:css|js))"/g, `$1?v=${version}"`);
  const page = async (_req: unknown, reply: any) => reply.header('Cache-Control', 'no-cache').type('text/html').send(html);
  for (const route of ['/', '/book/:slug', '/b/:code', '/p/:token', '/t/:token', '/e/:eventId', '/o/:code', '/me', '/paid', '/pl/:token']) app.get(route, page);
  return app;
}

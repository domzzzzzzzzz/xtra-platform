import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db, runMigrations, schema } from '../src/db/index.js';

export async function freshApp() {
  await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations();
  const app = await buildApp();
  await db.insert(schema.users).values({ email: 'admin@xtra.eg', name: 'Admin', isSuperAdmin: true, passwordHash: await bcrypt.hash('admin1234', 4) });
  return app;
}

export function client(app: FastifyInstance) {
  let token = '';
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await app.inject({ method: method as any, url, payload: body as any, headers: token ? { authorization: `Bearer ${token}` } : {} });
    return { status: res.statusCode, body: res.headers['content-type']?.toString().includes('json') ? res.json() : res.body };
  };
  return {
    setToken: (t: string) => { token = t; },
    get: (u: string) => call('GET', u),
    post: (u: string, b?: unknown) => call('POST', u, b ?? {}),
    put: (u: string, b: unknown) => call('PUT', u, b),
    patch: (u: string, b: unknown) => call('PATCH', u, b),
    login: async (email: string, password: string) => {
      const r = await call('POST', '/api/auth/login', { email, password });
      token = r.body.token;
      return r;
    },
  };
}

export const tomorrow = () => new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);

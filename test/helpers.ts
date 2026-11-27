import forge from 'node-forge';
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
    del: (u: string) => call('DELETE', u),
    login: async (email: string, password: string) => {
      const r = await call('POST', '/api/auth/login', { email, password });
      token = r.body.token;
      return r;
    },
  };
}

export const tomorrow = () => new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10);

/** A throwaway CA + signer, standing in for Apple's WWDR and a Pass Type ID certificate. */
export function fakeAppleCerts() {
  const mk = (cn: string, issuer?: { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey }) => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey; cert.serialNumber = String(Date.now());
    cert.validity.notBefore = new Date(Date.now() - 864e5); cert.validity.notAfter = new Date(Date.now() + 864e5 * 365);
    cert.setSubject([{ name: 'commonName', value: cn }]);
    cert.setIssuer(issuer ? issuer.cert.subject.attributes : [{ name: 'commonName', value: cn }]);
    cert.sign(issuer ? issuer.key : keys.privateKey, forge.md.sha256.create());
    return { cert, key: keys.privateKey };
  };
  const ca = mk('Fake WWDR'), signer = mk('Pass Type ID: pass.eg.xtra.test', ca);
  return { wwdr: forge.pki.certificateToPem(ca.cert), cert: forge.pki.certificateToPem(signer.cert), key: forge.pki.privateKeyToPem(signer.key) };
}

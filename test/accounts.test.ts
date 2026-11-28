import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { client, freshApp } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await freshApp(); });
afterAll(async () => { await app.close(); });

describe('Admin accounts', () => {
  it('changes my email and password, and signs out other devices', async () => {
    const a = client(app), other = client(app);
    await a.login('admin@xtra.eg', 'admin1234');
    await other.login('admin@xtra.eg', 'admin1234');
    expect((await a.put('/api/auth/account', { currentPassword: 'nope', newPassword: 'longer-pass' })).status).toBe(400);
    expect((await a.put('/api/auth/account', { currentPassword: 'admin1234', newPassword: 'short' })).status).toBe(400);
    await new Promise((r) => setTimeout(r, 1100)); // the other device signed in a moment before the change
    const r = await a.put('/api/auth/account', { currentPassword: 'admin1234', email: 'Boss@XTRA.eg', name: 'Boss', newPassword: 'new-pass-123' });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email: 'boss@xtra.eg', name: 'Boss', isSuperAdmin: true });
    a.setToken(r.body.token);
    expect((await a.get('/api/admin/admins')).status).toBe(200);
    expect((await other.get('/api/admin/admins')).status).toBe(401);
    expect((await client(app).login('admin@xtra.eg', 'admin1234')).status).toBe(401);
    expect((await client(app).login('boss@xtra.eg', 'new-pass-123')).status).toBe(200);
  });

  it('adds and removes admins, never yourself or the last one', async () => {
    const a = client(app);
    await a.login('boss@xtra.eg', 'new-pass-123');
    const add = await a.post('/api/admin/admins', { name: 'Sara', email: 'sara@xtra.eg', password: 'sara-pass-1' });
    expect(add.status).toBe(200);
    expect((await a.post('/api/admin/admins', { name: 'Sara', email: 'sara@xtra.eg', password: 'sara-pass-1' })).status).toBe(409);
    const list = await a.get('/api/admin/admins');
    expect(list.body.map((x: any) => x.email)).toEqual(['boss@xtra.eg', 'sara@xtra.eg']);
    const me = list.body.find((x: any) => x.me);
    expect((await a.del(`/api/admin/admins/${me.id}`)).status).toBe(400);

    const sara = client(app);
    await sara.login('sara@xtra.eg', 'sara-pass-1');
    expect((await sara.get('/api/admin/admins')).status).toBe(200);
    expect((await a.del(`/api/admin/admins/${add.body.id}`)).status).toBe(200);
    // Her old sign-in loses admin rights at once.
    expect((await sara.get('/api/admin/admins')).status).toBe(401);
    expect((await a.get('/api/admin/admins')).body).toHaveLength(1);
  });
});

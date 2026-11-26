import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createCheckout, verifyPaymobHmac, paymobEnabled, type CheckoutRequest } from '../integrations/paymob.js';
import { parse } from '../lib/http.js';
import { AppError, notFound } from '../lib/errors.js';
import { onDepositPaid } from './reservations.js';
import { onTicketsPaid } from './ticketing-service.js';
import { onTabPaid } from './tabs.js';

type Purpose = (typeof schema.paymentPurpose.enumValues)[number];

export async function startPayment(p: {
  venueId: string; purpose: Purpose; refId: string; amount: number;
  description: string; customer: CheckoutRequest['customer']; redirectUrl: string;
}) {
  const [pay] = await db.insert(schema.payments).values({
    venueId: p.venueId, purpose: p.purpose, refId: p.refId, amount: p.amount, provider: paymobEnabled() ? 'paymob' : 'test',
  }).returning();
  const c = await createCheckout({ paymentId: pay.id, amount: p.amount, description: p.description, customer: p.customer, redirectUrl: p.redirectUrl });
  await db.update(schema.payments).set({ providerRef: c.providerRef, checkoutUrl: c.checkoutUrl, provider: c.provider }).where(eq(schema.payments.id, pay.id));
  return { paymentId: pay.id, checkoutUrl: c.checkoutUrl };
}

/** Mark a payment paid exactly once and run what follows (pass, tickets, bill). */
export async function markPaid(paymentId: string, txnId: string | null, raw: unknown) {
  const done = await db.transaction(async (tx) => {
    const [pay] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).for('update');
    if (!pay) throw notFound('Payment not found');
    if (pay.status === 'paid') return null;
    await tx.update(schema.payments).set({ status: 'paid', providerTxnId: txnId, raw: raw as object, paidAt: new Date() }).where(eq(schema.payments.id, pay.id));
    return pay;
  });
  if (!done) return false;
  if (done.purpose === 'deposit') await onDepositPaid(done.refId);
  if (done.purpose === 'tickets') await onTicketsPaid(done.refId);
  if (done.purpose === 'tab') await onTabPaid(done.refId, 'paymob');
  return true;
}

export async function markFailed(paymentId: string, raw: unknown) {
  await db.update(schema.payments).set({ status: 'failed', raw: raw as object }).where(eq(schema.payments.id, paymentId));
}

export default async function payments(app: FastifyInstance) {
  /* Paymob "transaction processed" callback. */
  app.post<{ Querystring: { hmac?: string } }>('/webhooks/paymob', async (req) => {
    const body = req.body as { type?: string; obj?: Record<string, any> };
    const txn = body?.obj;
    if (!txn || !verifyPaymobHmac(txn, req.query.hmac ?? '')) throw new AppError(401, 'bad_signature', 'Bad signature');
    const paymentId = txn.order?.merchant_order_id ?? txn.special_reference ?? txn.payment_key_claims?.extra?.special_reference;
    if (!paymentId || !z.string().uuid().safeParse(paymentId).success) return { ignored: true };
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
    if (!pay) return { ignored: true };
    if (Number(txn.amount_cents) !== pay.amount) return { ignored: true, reason: 'amount_mismatch' };
    if (txn.success === true && !txn.pending) await markPaid(pay.id, String(txn.id), txn);
    else if (txn.success === false && !txn.pending) await markFailed(pay.id, txn);
    return { ok: true };
  });

  /* Built-in test checkout, only when Paymob keys are not set. */
  app.get<{ Params: { paymentId: string } }>('/dev/pay/:paymentId', async (req, reply) => {
    if (paymobEnabled()) throw notFound();
    const id = parse(z.string().uuid(), req.params.paymentId);
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.id, id));
    if (!pay) throw notFound();
    reply.type('text/html').send(`<!doctype html><meta name=viewport content="width=device-width"><title>Test checkout</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">
<h2>Test checkout</h2><p>Amount: EGP ${(pay.amount / 100).toFixed(2)}</p><p>Status: ${pay.status}</p>
<form method=post><button name=result value=paid style="padding:12px 20px">Pay</button> <button name=result value=failed style="padding:12px 20px">Fail</button></form></body>`);
  });

  app.post<{ Params: { paymentId: string } }>('/dev/pay/:paymentId', async (req) => {
    if (paymobEnabled()) throw notFound();
    const id = parse(z.string().uuid(), req.params.paymentId);
    const result = (req.body as any)?.result ?? 'paid';
    if (result === 'paid') await markPaid(id, `test_${Date.now()}`, { test: true });
    else await markFailed(id, { test: true });
    return { ok: true, result };
  });
}

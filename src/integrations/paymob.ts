/**
 * Paymob (accept.paymob.com) using the Intention API + Unified Checkout.
 * With no PAYMOB_SECRET_KEY set, a built-in test checkout is used so the
 * whole flow can be tried without an account.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

export type CheckoutRequest = {
  paymentId: string;
  amount: number; // piastres
  description: string;
  customer: { firstName: string; lastName: string; email?: string | null; phone: string };
  redirectUrl: string;
};

export type CheckoutResult = { provider: 'paymob' | 'test'; providerRef: string; checkoutUrl: string };

export const paymobEnabled = () => Boolean(config.paymob.secretKey && config.paymob.publicKey);

export async function createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  if (!paymobEnabled()) {
    return { provider: 'test', providerRef: `test_${req.paymentId}`, checkoutUrl: `${config.publicAppUrl}/dev/pay/${req.paymentId}` };
  }
  const res = await fetch('https://accept.paymob.com/v1/intention/', {
    method: 'POST',
    headers: { Authorization: `Token ${config.paymob.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: req.amount,
      currency: 'EGP',
      payment_methods: config.paymob.integrationIds,
      items: [{ name: req.description.slice(0, 50), amount: req.amount, quantity: 1 }],
      billing_data: {
        first_name: req.customer.firstName || 'Guest',
        last_name: req.customer.lastName || 'Guest',
        email: req.customer.email || 'guest@xtra.eg',
        phone_number: req.customer.phone,
        country: 'EG',
      },
      special_reference: req.paymentId,
      notification_url: `${config.publicAppUrl}/webhooks/paymob`,
      redirection_url: req.redirectUrl,
    }),
  });
  if (!res.ok) throw new Error(`Paymob intention failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string; client_secret: string };
  return {
    provider: 'paymob',
    providerRef: String(data.id),
    checkoutUrl: `https://accept.paymob.com/unifiedcheckout/?publicKey=${encodeURIComponent(config.paymob.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}`,
  };
}

/** Field order Paymob uses for the transaction-processed callback HMAC. */
const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id',
  'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id',
  'owner', 'pending', 'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
];

const pick = (obj: any, p: string) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function paymobHmac(txn: Record<string, unknown>, secret = config.paymob.hmacSecret) {
  const concat = HMAC_FIELDS.map((f) => {
    const v = pick(txn, f);
    return v === undefined || v === null ? '' : String(v);
  }).join('');
  return crypto.createHmac('sha512', secret).update(concat).digest('hex');
}

export function verifyPaymobHmac(txn: Record<string, unknown>, hmac: string, secret = config.paymob.hmacSecret) {
  if (!secret || !hmac) return false;
  const expected = Buffer.from(paymobHmac(txn, secret));
  const given = Buffer.from(hmac.toLowerCase());
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/**
 * Give money back on a paid Paymob transaction (whole or part). With no keys
 * set (test checkout), nothing is sent and a test reference comes back.
 */
export async function refundTransaction(transactionId: string, amount: number): Promise<{ ref: string }> {
  if (!paymobEnabled() || transactionId.startsWith('test_')) return { ref: `test_refund_${Date.now()}` };
  const res = await fetch('https://accept.paymob.com/api/acceptance/void_refund/refund', {
    method: 'POST',
    headers: { Authorization: `Token ${config.paymob.secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction_id: transactionId, amount_cents: amount }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Paymob refund failed: ${res.status} ${text.slice(0, 200)}`);
  let data: { id?: number | string; success?: boolean; data?: { message?: string } } = {};
  try { data = JSON.parse(text); } catch { /* keep empty */ }
  if (data.success === false) throw new Error(`Paymob refused the refund: ${data.data?.message ?? 'no reason given'}`);
  return { ref: String(data.id ?? '') };
}

import { describe, it, expect } from 'vitest';
import { computeBill, computeTicketTotals, pointsFor } from '../src/lib/pricing.js';
import { paymobHmac, verifyPaymobHmac } from '../src/integrations/paymob.js';
import { normalizePhone } from '../src/lib/codes.js';

describe('table bill', () => {
  it('tops up to the minimum spend, then service, VAT and deposit', () => {
    // Ordered EGP 4,000, area minimum EGP 6,000, deposit EGP 1,000 paid.
    const b = computeBill({ items: [{ unitPrice: 200000, qty: 2 }], minSpend: 600000, serviceBps: 1200, vatBps: 1400, depositPaid: 100000 });
    expect(b.subtotal).toBe(400000);
    expect(b.minSpendTopUp).toBe(200000);
    expect(b.service).toBe(72000); // 12% of 6,000
    expect(b.vat).toBe(94080); // 14% of 6,720
    expect(b.depositCredit).toBe(100000);
    expect(b.total).toBe(600000 + 72000 + 94080 - 100000);
  });

  it('has no top-up when the table spent more than the minimum', () => {
    const b = computeBill({ items: [{ unitPrice: 700000, qty: 1 }], minSpend: 600000, serviceBps: 1200, vatBps: 1400, depositPaid: 0 });
    expect(b.minSpendTopUp).toBe(0);
  });

  it('never goes below zero when the deposit is larger', () => {
    const b = computeBill({ items: [{ unitPrice: 1000, qty: 1 }], minSpend: 0, serviceBps: 0, vatBps: 0, depositPaid: 50000 });
    expect(b.total).toBe(0);
    expect(b.depositCredit).toBe(1000);
  });
});

describe('ticket totals', () => {
  it('adds a 5% fee and 14% VAT on the fee only', () => {
    const t = computeTicketTotals({ lines: [{ unitPrice: 100000, qty: 1 }], percentOff: 0, feeBps: 500, feeVatBps: 1400 });
    expect(t).toEqual({ subtotal: 100000, discount: 0, fee: 5000, feeVat: 700, total: 105700 });
  });

  it('takes the promo off the ticket price before the fee', () => {
    const t = computeTicketTotals({ lines: [{ unitPrice: 100000, qty: 2 }], percentOff: 25, feeBps: 500, feeVatBps: 1400 });
    expect(t.discount).toBe(50000);
    expect(t.fee).toBe(7500);
    expect(t.feeVat).toBe(1050);
    expect(t.total).toBe(150000 + 7500 + 1050);
  });

  it('makes a 100% code fully free', () => {
    const t = computeTicketTotals({ lines: [{ unitPrice: 100000, qty: 3 }], percentOff: 100, feeBps: 500, feeVatBps: 1400 });
    expect(t.total).toBe(0);
  });
});

it('gives 1 point per EGP 100', () => {
  expect(pointsFor(1_234_500, 10000)).toBe(123);
});

it('normalises Egyptian phone numbers', () => {
  for (const p of ['01012345678', '+201012345678', '00201012345678', '+20 101 234 5678', '1012345678', '+20 010 1234 5678']) expect(normalizePhone(p)).toBe('+201012345678');
  expect(normalizePhone('+971 50 123 4567')).toBe('+971501234567');
  expect(normalizePhone('00966501234567')).toBe('+966501234567');
});

it('verifies the Paymob HMAC', () => {
  const txn = { amount_cents: 1000, created_at: '2026-01-01', currency: 'EGP', error_occured: false, has_parent_transaction: false, id: 9, integration_id: 1, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 5 }, owner: 2, pending: false, source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, success: true };
  const h = paymobHmac(txn, 'secret');
  expect(verifyPaymobHmac(txn, h, 'secret')).toBe(true);
  expect(verifyPaymobHmac({ ...txn, amount_cents: 1 }, h, 'secret')).toBe(false);
});

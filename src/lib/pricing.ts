/**
 * All money maths in one place. Amounts are integer piastres, rates are
 * basis points. Rounding is half-up to the nearest piastre at each step,
 * the same way a printed bill is read.
 */

export const pct = (amount: number, bps: number) => Math.round((amount * bps) / 10000);

export type BillInput = {
  items: { unitPrice: number; qty: number }[];
  minSpend: number;
  serviceBps: number;
  vatBps: number;
  depositPaid: number;
};

export type Bill = {
  subtotal: number;
  minSpend: number;
  minSpendTopUp: number;
  service: number;
  vat: number;
  depositCredit: number;
  total: number;
};

/**
 * Table bill. If the table ordered less than the area's minimum spend the
 * difference is added as a top-up. Service is charged on that base, VAT on
 * base + service, and a paid deposit is taken off the end.
 */
export function computeBill(i: BillInput): Bill {
  const subtotal = i.items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const minSpendTopUp = Math.max(0, i.minSpend - subtotal);
  const base = subtotal + minSpendTopUp;
  const service = pct(base, i.serviceBps);
  const vat = pct(base + service, i.vatBps);
  const gross = base + service + vat;
  const depositCredit = Math.min(i.depositPaid, gross);
  return { subtotal, minSpend: i.minSpend, minSpendTopUp, service, vat, depositCredit, total: gross - depositCredit };
}

export type TicketTotalsInput = {
  lines: { unitPrice: number; qty: number }[];
  percentOff: number; // 0..100
  feeBps: number;
  feeVatBps: number;
};

export type TicketTotals = {
  subtotal: number;
  discount: number;
  fee: number;
  feeVat: number;
  total: number;
};

/**
 * Ticket checkout. The promo discount applies to the ticket price. The
 * booking fee is a % of the discounted price, and VAT is charged on the fee
 * only. A 100% code makes the whole order free (no fee either).
 */
export function computeTicketTotals(i: TicketTotalsInput): TicketTotals {
  const subtotal = i.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discount = pct(subtotal, Math.max(0, Math.min(100, i.percentOff)) * 100);
  const net = subtotal - discount;
  const fee = pct(net, i.feeBps);
  const feeVat = pct(fee, i.feeVatBps);
  return { subtotal, discount, fee, feeVat, total: net + fee + feeVat };
}

/** Points earned for a spend, e.g. 1 point per EGP 100 (10000 piastres). */
export const pointsFor = (spend: number, pointsPerAmount: number) =>
  pointsPerAmount > 0 ? Math.floor(spend / pointsPerAmount) : 0;

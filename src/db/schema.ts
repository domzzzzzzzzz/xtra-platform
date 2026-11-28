/**
 * XTRA platform database schema.
 *
 * Conventions
 * - Every amount of money is an integer in piastres (1 EGP = 100 piastres).
 * - Every percentage is an integer in basis points (5% = 500 bps).
 * - Each venue is a tenant. Rows that belong to a venue carry venue_id.
 * - Guests are shared across the platform (one person, one phone number);
 *   what a venue knows about a guest lives in venue_guests.
 */
import {
  customType,
  doublePrecision,
  pgTable, pgEnum, uuid, text, integer, boolean, timestamp, jsonb, date, real,
  uniqueIndex, index, primaryKey,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const venueRef = () => uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' });

/* ---------------------------------------------------------------- platform */

export const platformSettings = pgTable('platform_settings', {
  id: integer('id').primaryKey().default(1),
  bookingFeeBps: integer('booking_fee_bps').notNull().default(500),
  feeVatBps: integer('fee_vat_bps').notNull().default(1400),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  /** Sign-ins made before this (a password change) stop working. */
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);

export type VenueSettings = {
  where?: string;
  color?: string;
  firstSlot?: number; // minutes from midnight, may pass 24h
  lastSlot?: number;
  slotStep?: number;
  maxPerSlot?: number;
  approval?: 'manual' | 'auto';
  askNames?: boolean;
  mapPick?: boolean;
  socials?: Record<string, string>;
  connections?: Record<string, boolean>;
  automations?: Record<string, boolean>;
  /** Morning summary of last night for the owner. Off unless switched on. */
  dailyReport?: { on: boolean; channel?: 'email' | 'whatsapp' | 'both'; emails: string[]; phones: string[] };
};

export const notifyChannel = pgEnum('notify_channel', ['email', 'whatsapp', 'both']);

export const venues = pgTable('venues', {
  id: id(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  mapUrl: text('map_url'),
  /** Pin read from mapUrl, used for the map on guest pages. */
  mapLat: doublePrecision('map_lat'),
  mapLng: doublePrecision('map_lng'),
  /** Photo shown on the Location card of guest pages. */
  photoUrl: text('photo_url'),
  instagram: text('instagram'),
  tiktok: text('tiktok'),
  timezone: text('timezone').notNull().default('Africa/Cairo'),
  notifyChannel: notifyChannel('notify_channel').notNull().default('both'),
  serviceBps: integer('service_bps').notNull().default(1200),
  vatBps: integer('vat_bps').notNull().default(1400),
  /** Per-person deposit asked when a booking is accepted. 0 = no deposit. */
  depositPerPerson: integer('deposit_per_person').notNull().default(0),
  /** Overrides the platform booking fee for this venue's tickets. */
  bookingFeeBps: integer('booking_fee_bps'),
  /** 1 community point for every `pointsPerAmount` piastres spent. Default: 1 point per EGP 100. */
  pointsPerAmount: integer('points_per_amount').notNull().default(10000),
  paymobSubaccount: text('paymob_subaccount'),
  /** Screen settings the venue edits in Venue setup (slots grid, toggles, socials, automations). */
  settings: jsonb('settings').$type<VenueSettings>().notNull().default({}),
  /** Modules XTRA switched on for this venue (see lib/access.ts FEATURES). */
  features: jsonb('features').$type<string[]>().notNull().default(['reservations', 'ordering', 'ticketing', 'marketing', 'guests', 'community']),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('venues_slug_uq').on(t.slug)]);

export const staffRole = pgEnum('staff_role', ['owner', 'manager', 'door', 'waiter']);

/** A venue's own role: a name and exactly which screens it may use (see lib/access.ts PERMS). */
export const venueRoles = pgTable('venue_roles', {
  id: id(),
  venueId: venueRef(),
  name: text('name').notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('venue_roles_name_uq').on(t.venueId, t.name)]);

export const venueStaff = pgTable('venue_staff', {
  venueId: venueRef(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Built-in role. Ignored for permissions when roleId is set. */
  role: staffRole('role').notNull(),
  /** A custom role of this venue; it cannot be deleted while staff use it. */
  roleId: uuid('role_id').references(() => venueRoles.id, { onDelete: 'restrict' }),
}, (t) => [primaryKey({ columns: [t.venueId, t.userId] })]);

/* ---------------------------------------------------------------- floor map */

export const floorItemKind = pgEnum('floor_item_kind', [
  'zone', 'table', 'sofa', 'chair', 'bar', 'dj', 'stage', 'entrance',
]);

/**
 * Everything drawn on a venue's floor map. Zones are areas (Terrace, VIP)
 * that hold tables; chairs belong to a table or sofa via parentId and can be
 * switched off without deleting them.
 */
export const floorItems = pgTable('floor_items', {
  id: id(),
  venueId: venueRef(),
  kind: floorItemKind('kind').notNull(),
  label: text('label').notNull().default(''),
  /** round | square | long | u-sofa | sofa-armchairs ... free text the editor understands */
  shape: text('shape'),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
  w: real('w').notNull().default(1),
  h: real('h').notNull().default(1),
  rotation: real('rotation').notNull().default(0),
  seats: integer('seats').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
  parentId: uuid('parent_id'),
  zoneId: uuid('zone_id'),
  /** For zones: the minimum spend for a table in this area. */
  minSpend: integer('min_spend').notNull().default(0),
  /** For zones: deposit asked per booking in this area. */
  deposit: integer('deposit').notNull().default(0),
  color: text('color'),
  sort: integer('sort').notNull().default(0),
}, (t) => [index('floor_items_venue_idx').on(t.venueId)]);

export const timeSlots = pgTable('time_slots', {
  id: id(),
  venueId: venueRef(),
  /** 0 = Sunday ... 6 = Saturday. null = every day. */
  weekday: integer('weekday'),
  startsAt: text('starts_at').notNull(), // "21:00"
  endsAt: text('ends_at').notNull(), // "23:30"
  /** Max people for this slot. 0 = no limit. */
  capacity: integer('capacity').notNull().default(0),
  /** Max bookings in this slot. 0 = no limit. */
  maxBookings: integer('max_bookings').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

/* ---------------------------------------------------------------- guests */

export const gender = pgEnum('gender', ['male', 'female', 'other']);

export const guests = pgTable('guests', {
  id: id(),
  phone: text('phone').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull().default(''),
  email: text('email'),
  instagram: text('instagram'),
  gender: gender('gender'),
  birthDate: date('birth_date'),
  whatsappOptIn: boolean('whatsapp_opt_in').notNull().default(false),
  emailOptIn: boolean('email_opt_in').notNull().default(false),
  referralCode: text('referral_code').notNull(),
  referredBy: uuid('referred_by'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('guests_phone_uq').on(t.phone), uniqueIndex('guests_ref_uq').on(t.referralCode)]);

export const guestOtps = pgTable('guest_otps', {
  id: id(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const communityTiers = pgTable('community_tiers', {
  id: id(),
  venueId: venueRef(),
  name: text('name').notNull(),
  /** Lifetime spend at the venue needed to reach this tier. */
  minSpend: integer('min_spend').notNull().default(0),
  perks: jsonb('perks').$type<string[]>().notNull().default([]),
  color: text('color'),
  sort: integer('sort').notNull().default(0),
});

/** What one venue knows about one guest (its CRM row). */
export const venueGuests = pgTable('venue_guests', {
  venueId: venueRef(),
  guestId: uuid('guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  notes: text('notes').notNull().default(''),
  visits: integer('visits').notNull().default(0),
  totalSpend: integer('total_spend').notNull().default(0),
  points: integer('points').notNull().default(0),
  blocked: boolean('blocked').notNull().default(false),
  lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.venueId, t.guestId] })]);

export const pointsLedger = pgTable('points_ledger', {
  id: id(),
  venueId: venueRef(),
  guestId: uuid('guest_id').notNull().references(() => guests.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  refId: uuid('ref_id'),
  createdAt: createdAt(),
});

/* ---------------------------------------------------------------- reservations */

export const reservationStatus = pgEnum('reservation_status', [
  'in_review', 'accepted', 'declined', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show',
]);

export const reservations = pgTable('reservations', {
  id: id(),
  code: text('code').notNull(),
  venueId: venueRef(),
  guestId: uuid('guest_id').notNull().references(() => guests.id),
  date: date('date').notNull(),
  slotId: uuid('slot_id').references(() => timeSlots.id, { onDelete: 'set null' }),
  slotLabel: text('slot_label').notNull().default(''),
  /** Came through a promoter's link. */
  promoterId: uuid('promoter_id'),
  zoneId: uuid('zone_id'),
  tableId: uuid('table_id'),
  partySize: integer('party_size').notNull(),
  status: reservationStatus('status').notNull().default('in_review'),
  /** Deposit due once accepted. 0 = none, the booking is confirmed on accept. */
  depositAmount: integer('deposit_amount').notNull().default(0),
  depositPaidAt: timestamp('deposit_paid_at', { withTimezone: true }),
  /** The deposit went back to the guest: it no longer comes off the bill. */
  depositRefundedAt: timestamp('deposit_refunded_at', { withTimezone: true }),
  minSpend: integer('min_spend').notNull().default(0),
  guestNote: text('guest_note').notNull().default(''),
  declineReason: text('decline_reason'),
  decidedBy: uuid('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }),
  qrToken: text('qr_token').notNull(),
  source: text('source').notNull().default('online'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('reservations_code_uq').on(t.code),
  uniqueIndex('reservations_qr_uq').on(t.qrToken),
  index('reservations_venue_date_idx').on(t.venueId, t.date),
]);

/** Everyone in the party, the booker first. Each person has their own QR. */
export const reservationGuests = pgTable('reservation_guests', {
  id: id(),
  reservationId: uuid('reservation_id').notNull().references(() => reservations.id, { onDelete: 'cascade' }),
  guestId: uuid('guest_id').references(() => guests.id),
  isBooker: boolean('is_booker').notNull().default(false),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  instagram: text('instagram'),
  gender: gender('gender'),
  qrToken: text('qr_token').notNull(),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
}, (t) => [uniqueIndex('reservation_guests_qr_uq').on(t.qrToken)]);

/* ---------------------------------------------------------------- ordering */

export const menuItems = pgTable('menu_items', {
  id: id(),
  venueId: venueRef(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
  /** Where the ticket prints: the kitchen or the bar. */
  station: text('station').$type<Station>().notNull().default('bar'),
  /** Extras the waiter picks when ordering (size, sauce, "no ice"). Prices add to the item. */
  options: jsonb('options').$type<MenuOptionGroup[]>().notNull().default([]),
});

export const STATIONS = ['kitchen', 'bar'] as const;
export type Station = (typeof STATIONS)[number];
export type MenuOptionGroup = { name: string; required: boolean; multi: boolean; choices: { name: string; price: number }[] };
/** An extra picked on one order line, copied so later menu edits never change a bill. */
export type PickedOption = { group: string; name: string; price: number };

export const tabStatus = pgEnum('tab_status', ['open', 'paid', 'void']);
export const payMethod = pgEnum('pay_method', ['card', 'cash', 'instapay', 'wallet', 'paymob', 'free', 'mixed']);

/** A running bill for a table. Totals are frozen when the tab is paid. */
export const tabs = pgTable('tabs', {
  id: id(),
  venueId: venueRef(),
  reservationId: uuid('reservation_id').references(() => reservations.id, { onDelete: 'set null' }),
  tableId: uuid('table_id'),
  guestId: uuid('guest_id').references(() => guests.id),
  /** Walk-ins without a booking. */
  guestName: text('guest_name'),
  partySize: integer('party_size').notNull().default(0),
  billRequestedAt: timestamp('bill_requested_at', { withTimezone: true }),
  status: tabStatus('status').notNull().default('open'),
  openedBy: uuid('opened_by'),
  subtotal: integer('subtotal').notNull().default(0),
  minSpendTopUp: integer('min_spend_top_up').notNull().default(0),
  service: integer('service').notNull().default(0),
  vat: integer('vat').notNull().default(0),
  depositCredit: integer('deposit_credit').notNull().default(0),
  total: integer('total').notNull().default(0),
  payMethod: payMethod('pay_method'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('tabs_venue_status_idx').on(t.venueId, t.status)]);

export const tabItemStatus = pgEnum('tab_item_status', ['new', 'sent', 'served', 'void']);

export const tabItems = pgTable('tab_items', {
  id: id(),
  tabId: uuid('tab_id').notNull().references(() => tabs.id, { onDelete: 'cascade' }),
  menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  unitPrice: integer('unit_price').notNull(),
  qty: integer('qty').notNull(),
  note: text('note').notNull().default(''),
  /** unitPrice already includes these. */
  options: jsonb('options').$type<PickedOption[]>().notNull().default([]),
  station: text('station').$type<Station>().notNull().default('bar'),
  /** status: new (not sent), sent (on the kitchen/bar screen), served (marked ready there), void. */
  status: tabItemStatus('status').notNull().default('new'),
  /** One number per "Send": what the kitchen and bar call the ticket. */
  ticketNo: integer('ticket_no'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  addedBy: uuid('added_by'),
  createdAt: createdAt(),
}, (t) => [index('tab_items_tab_idx').on(t.tabId)]);

/**
 * Money taken on a bill. A bill can be paid in parts (split between friends,
 * part cash part card); it closes when the parts reach the total.
 */
export const tabPayments = pgTable('tab_payments', {
  id: id(),
  venueId: venueRef(),
  tabId: uuid('tab_id').notNull().references(() => tabs.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  method: payMethod('method').notNull(),
  /** Who paid this part, if staff typed it ("Omar"). */
  label: text('label').notNull().default(''),
  takenBy: uuid('taken_by'),
  createdAt: createdAt(),
}, (t) => [index('tab_payments_tab_idx').on(t.tabId), index('tab_payments_venue_idx').on(t.venueId, t.createdAt)]);

/** End of night: what the till should hold against what was counted. */
export const shiftCloses = pgTable('shift_closes', {
  id: id(),
  venueId: venueRef(),
  night: date('night').notNull(),
  /** Expected money by method, in piastres, as it was when closed. */
  expected: jsonb('expected').$type<Record<string, number>>().notNull(),
  bills: integer('bills').notNull().default(0),
  countedCash: integer('counted_cash').notNull(),
  note: text('note').notNull().default(''),
  closedBy: uuid('closed_by'),
  createdAt: createdAt(),
}, (t) => [index('shift_closes_venue_idx').on(t.venueId, t.night)]);

/* ---------------------------------------------------------------- promoters */

/**
 * A promoter brings guests: through their own booking/ticket link (?ref=CODE)
 * or names they put on the guest list from their private page (/pl/TOKEN).
 */
export const promoters = pgTable('promoters', {
  id: id(),
  venueId: venueRef(),
  name: text('name').notNull(),
  phone: text('phone'),
  /** In links: /book/venue?ref=KARIM */
  code: text('code').notNull(),
  /** Their private guest list page. */
  token: text('token').notNull(),
  /** guest: `commission` piastres per guest who came in. percent: `commission` bps of what their guests spent. */
  commissionKind: text('commission_kind').$type<'guest' | 'percent'>().notNull().default('guest'),
  commission: integer('commission').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('promoters_code_uq').on(t.venueId, t.code), uniqueIndex('promoters_token_uq').on(t.token)]);

/** Names on the door for one night, without a table. */
export const guestList = pgTable('guest_list', {
  id: id(),
  venueId: venueRef(),
  promoterId: uuid('promoter_id').references(() => promoters.id, { onDelete: 'set null' }),
  night: date('night').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  /** Friends coming with them. */
  plus: integer('plus').notNull().default(0),
  note: text('note').notNull().default(''),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
  addedBy: uuid('added_by'),
  createdAt: createdAt(),
}, (t) => [index('guest_list_night_idx').on(t.venueId, t.night)]);

/* ---------------------------------------------------------------- ticketing */

export const eventStatus = pgEnum('event_status', ['draft', 'published', 'ended', 'cancelled']);

export const events = pgTable('events', {
  id: id(),
  venueId: venueRef(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  posterUrl: text('poster_url'),
  description: text('description').notNull().default(''),
  lineup: text('lineup').notNull().default(''),
  color: text('color'),
  /** Off: guests pick from a simple ticket list (standing types only). */
  seatMap: boolean('seat_map').notNull().default(true),
  rules: jsonb('rules').$type<string[]>().notNull().default([]),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  status: eventStatus('status').notNull().default('draft'),
  /** Overrides venue/platform booking fee for this event. */
  bookingFeeBps: integer('booking_fee_bps'),
  /** Max tickets in one order. */
  maxPerOrder: integer('max_per_order').notNull().default(10),
  /** Corporate / private events: nothing is sold, guests only get in with an invitation. */
  inviteOnly: boolean('invite_only').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('events_venue_slug_uq').on(t.venueId, t.slug)]);

export const zoneKind = pgEnum('zone_kind', ['standing', 'seated', 'table', 'decor']);

/**
 * A ticket type and its place on the event's own seat map.
 * standing: sold by quantity up to capacity.
 * table: sold one whole table at a time (price is per table, seatsPerTable tickets issued).
 * seated: sold per seat from event_seats.
 * decor: drawn on the map only (stage, bar).
 */
export const eventZones = pgTable('event_zones', {
  id: id(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: zoneKind('kind').notNull(),
  price: integer('price').notNull().default(0),
  capacity: integer('capacity').notNull().default(0),
  seatsPerTable: integer('seats_per_table').notNull().default(1),
  /** For decor: stage | bar | dj | entrance. */
  shape: text('shape'),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
  w: real('w').notNull().default(1),
  h: real('h').notNull().default(1),
  color: text('color'),
  sort: integer('sort').notNull().default(0),
  /** Staff closed this ticket type by hand: guests see it as sold out. Invites still work. */
  soldOut: boolean('sold_out').notNull().default(false),
  /** Seated blocks: how the editor builds the rows (rows, seats per row, curve, angle, first row letter...). */
  meta: jsonb('meta'),
});

/** Individual seats or tables inside a seated/table zone. */
export const eventSeats = pgTable('event_seats', {
  id: id(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  zoneId: uuid('zone_id').notNull().references(() => eventZones.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  /** People at this table. A table sells all its seats at once. */
  seats: integer('seats').notNull().default(1),
  shape: text('shape'),
  rotation: real('rotation').notNull().default(0),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
}, (t) => [uniqueIndex('event_seats_label_uq').on(t.zoneId, t.label)]);

export const promoCodes = pgTable('promo_codes', {
  id: id(),
  venueId: venueRef(),
  /** null = valid for every event of the venue. */
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  percentOff: integer('percent_off').notNull(),
  /** null = unlimited. */
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  /** Only this phone number may use it. */
  lockedPhone: text('locked_phone'),
  batchId: uuid('batch_id'),
  label: text('label'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('promo_codes_venue_code_uq').on(t.venueId, t.code)]);

export const ticketOrderStatus = pgEnum('ticket_order_status', ['held', 'paid', 'expired', 'cancelled', 'refunded']);

export const ticketOrders = pgTable('ticket_orders', {
  id: id(),
  code: text('code').notNull(),
  venueId: venueRef(),
  eventId: uuid('event_id').notNull().references(() => events.id),
  guestId: uuid('guest_id').references(() => guests.id),
  promoterId: uuid('promoter_id'),
  status: ticketOrderStatus('status').notNull().default('held'),
  holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }).notNull(),
  promoCodeId: uuid('promo_code_id').references(() => promoCodes.id),
  subtotal: integer('subtotal').notNull().default(0),
  discount: integer('discount').notNull().default(0),
  fee: integer('fee').notNull().default(0),
  feeVat: integer('fee_vat').notNull().default(0),
  total: integer('total').notNull().default(0),
  feeBps: integer('fee_bps').notNull().default(0),
  feeVatBps: integer('fee_vat_bps').notNull().default(0),
  buyerEmail: text('buyer_email'),
  buyerPhone: text('buyer_phone'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  /** sale = bought on the ticket page, invite = free ticket sent by staff. */
  kind: text('kind').notNull().default('sale'),
  invitedBy: uuid('invited_by').references(() => users.id),
  note: text('note'),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  refundedAmount: integer('refunded_amount').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('ticket_orders_code_uq').on(t.code), index('ticket_orders_event_idx').on(t.eventId, t.status)]);

export const ticketOrderLines = pgTable('ticket_order_lines', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => ticketOrders.id, { onDelete: 'cascade' }),
  zoneId: uuid('zone_id').notNull().references(() => eventZones.id),
  seatId: uuid('seat_id').references(() => eventSeats.id),
  qty: integer('qty').notNull(),
  unitPrice: integer('unit_price').notNull(),
});

export const tickets = pgTable('tickets', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => ticketOrders.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id),
  zoneId: uuid('zone_id').notNull().references(() => eventZones.id),
  seatId: uuid('seat_id'),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  email: text('email'),
  phone: text('phone'),
  birthDate: date('birth_date'),
  gender: gender('gender'),
  qrToken: text('qr_token').notNull(),
  checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
}, (t) => [uniqueIndex('tickets_qr_uq').on(t.qrToken), index('tickets_event_idx').on(t.eventId)]);

/* ---------------------------------------------------------------- payments */

export const paymentPurpose = pgEnum('payment_purpose', ['deposit', 'tickets', 'tab']);
export const paymentStatus = pgEnum('payment_status', ['pending', 'paid', 'failed', 'refunded']);

export const payments = pgTable('payments', {
  id: id(),
  venueId: venueRef(),
  purpose: paymentPurpose('purpose').notNull(),
  refId: uuid('ref_id').notNull(),
  amount: integer('amount').notNull(),
  provider: text('provider').notNull(),
  providerRef: text('provider_ref'),
  providerTxnId: text('provider_txn_id'),
  checkoutUrl: text('checkout_url'),
  status: paymentStatus('status').notNull().default('pending'),
  raw: jsonb('raw'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('payments_ref_idx').on(t.refId)]);

/* ---------------------------------------------------------------- marketing */

export const campaignChannel = pgEnum('campaign_channel', ['whatsapp', 'email']);
export const campaignStatus = pgEnum('campaign_status', ['draft', 'scheduled', 'sending', 'sent']);

export type Segment = {
  /** Which saved audience the venue picked (for display only). */
  key?: string;
  tags?: string[];
  tierIds?: string[];
  minVisits?: number;
  lastVisitBeforeDays?: number;
  gender?: 'male' | 'female' | 'other';
  boughtTickets?: boolean;
  birthdayWithinDays?: number;
};

export const campaigns = pgTable('campaigns', {
  id: id(),
  venueId: venueRef(),
  name: text('name').notNull(),
  channel: campaignChannel('channel').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  /** WhatsApp template name approved by Meta (marketing messages must use one). */
  whatsappTemplate: text('whatsapp_template'),
  segment: jsonb('segment').$type<Segment>().notNull().default({}),
  status: campaignStatus('status').notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  sentCount: integer('sent_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  createdAt: createdAt(),
});

/** Every WhatsApp/email that left the platform. */
export const messages = pgTable('messages', {
  id: id(),
  venueId: uuid('venue_id'),
  guestId: uuid('guest_id'),
  campaignId: uuid('campaign_id'),
  channel: campaignChannel('channel').notNull(),
  to: text('to').notNull(),
  kind: text('kind').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  /** logged, sent, delivered, read, failed (outgoing); received (incoming). */
  status: text('status').notNull(),
  providerId: text('provider_id'),
  error: text('error'),
  /** out = we sent it, in = a guest wrote to us on WhatsApp. */
  direction: text('direction').notNull().default('out'),
  /** What is needed to send it again: the WhatsApp template, the email HTML, the sender. */
  payload: jsonb('payload').$type<MessagePayload>(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  /** When staff opened an incoming message in the inbox. */
  seenAt: timestamp('seen_at', { withTimezone: true }),
  /** Staff member who wrote a reply from the inbox. */
  sentBy: uuid('sent_by'),
  createdAt: createdAt(),
}, (t) => [index('messages_venue_idx').on(t.venueId), index('messages_to_idx').on(t.to, t.createdAt), index('messages_provider_idx').on(t.providerId)]);

export type MessagePayload = {
  whatsappTemplate?: { name: string; params: string[]; button?: string; header?: string; language?: string } | null;
  html?: string;
  fromName?: string;
  replyTo?: string;
};

/* ---------------------------------------------------------------- media */

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/** Images venues upload (event posters, location photos), served at /media/:id. */
export const media = pgTable('media', {
  id: id(),
  venueId: venueRef(),
  mime: text('mime').notNull(),
  bytes: bytea('bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------------------------------- wallet passes */

/**
 * Phones that added a pass to Apple Wallet. Apple calls our web service to
 * register, and we push to `pushToken` when the pass changes. `serial` is the
 * pass's QR token.
 */
export const walletDevices = pgTable('wallet_devices', {
  id: id(),
  deviceId: text('device_id').notNull(),
  pushToken: text('push_token').notNull(),
  passTypeId: text('pass_type_id').notNull(),
  serial: text('serial').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('wallet_devices_uq').on(t.deviceId, t.passTypeId, t.serial), index('wallet_devices_serial_idx').on(t.serial)]);

/** When a pass last changed (booking moved, cancelled, event edited), for wallet updates. */
export const walletPassUpdates = pgTable('wallet_pass_updates', {
  serial: text('serial').primaryKey(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------------------------------- refunds */

/** Money given back: a ticket order or a booking deposit. */
export const refunds = pgTable('refunds', {
  id: id(),
  venueId: venueRef(),
  purpose: text('purpose').notNull(), // tickets | deposit
  refId: uuid('ref_id').notNull(),
  paymentId: uuid('payment_id').references(() => payments.id),
  /** What the guest gets back. */
  amount: integer('amount').notNull(),
  /** The part that was the venue's money (ticket price or deposit). Booking fees are XTRA's. */
  venueAmount: integer('venue_amount').notNull(),
  /** paymob = sent back to the card/wallet; manual = staff give it back (cash, transfer). */
  method: text('method').notNull(),
  providerRef: text('provider_ref'),
  reason: text('reason'),
  by: uuid('by').references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index('refunds_venue_idx').on(t.venueId, t.createdAt)]);

/* ---------------------------------------------------------------- waitlist */

/** Guests waiting for a sold-out event or ticket type. */
export const waitlist = pgTable('waitlist', {
  id: id(),
  venueId: venueRef(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  /** null = any ticket type. */
  zoneId: uuid('zone_id').references(() => eventZones.id, { onDelete: 'set null' }),
  guestId: uuid('guest_id').references(() => guests.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  qty: integer('qty').notNull().default(1),
  /** waiting, notified, bought, removed */
  status: text('status').notNull().default('waiting'),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('waitlist_event_idx').on(t.eventId, t.status)]);

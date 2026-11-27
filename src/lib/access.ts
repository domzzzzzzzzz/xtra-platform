/**
 * Who may do what at a venue.
 *
 * - FEATURES are modules XTRA switches on per venue (a venue may not buy everything).
 * - PERMS are the screens a role may use. Built-in roles map to a fixed set;
 *   a venue can also make its own roles with exactly the PERMS it picks.
 *
 * Every /venues/:venueId/... route is checked here from its method and path,
 * so a new route only needs a line in RULES.
 */
export const FEATURES = ['reservations', 'ordering', 'ticketing', 'marketing', 'guests', 'community'] as const;
export type Feature = (typeof FEATURES)[number];

export const PERMS = ['floor', 'bookings', 'door', 'orders', 'events', 'marketing', 'guests', 'community', 'editor', 'setup', 'staff', 'reports', 'messages'] as const;
export type Perm = (typeof PERMS)[number];

export const PRESETS: Record<'owner' | 'manager' | 'door' | 'waiter', Perm[]> = {
  owner: [...PERMS],
  manager: [...PERMS],
  door: ['floor', 'bookings', 'door'],
  waiter: ['floor', 'orders'],
};

/** Which feature a screen belongs to (screens with none are always there). */
export const PERM_FEATURE: Partial<Record<Perm, Feature>> = {
  bookings: 'reservations', door: 'reservations', orders: 'ordering', events: 'ticketing',
  marketing: 'marketing', guests: 'guests', community: 'community',
};

type Rule = { any: Perm[] | '*'; feature?: Feature };
const ANY: Rule = { any: '*' };

/**
 * First match wins. `path` is the route after /venues/:venueId, e.g.
 * "/reservations/:id/accept". Reads that several screens need are open to
 * any staff member of the venue.
 */
const RULES: [method: string, test: RegExp, rule: Rule][] = [
  ['GET', /^$/, ANY],
  ['*', /^$/, { any: ['setup'] }],
  ['*', /^\/(staff|roles)(\/|$)/, { any: ['staff'] }],
  ['GET', /^\/reports$/, { any: ['reports'] }],
  ['*', /^\/daily-report(\/|$)/, { any: ['setup', 'reports'] }],
  ['*', /^\/(messages|inbox)(\/|$)/, { any: ['messages'] }],
  ['POST', /^\/media$/, { any: ['setup', 'events', 'editor'] }],
  ['GET', /^\/floor$/, ANY],
  ['*', /^\/floor(\/|$)/, { any: ['editor'] }],
  ['GET', /^\/slots$/, ANY],
  ['*', /^\/slots$/, { any: ['setup'] }],
  ['GET', /^\/tiers$/, ANY],
  ['*', /^\/tiers$/, { any: ['community'], feature: 'community' }],
  ['GET', /^\/menu$/, ANY],
  ['*', /^\/menu(\/|$)/, { any: ['orders', 'setup'], feature: 'ordering' }],
  ['GET', /^\/(reservations|tonight)$/, { any: ['floor', 'bookings', 'door'], feature: 'reservations' }],
  ['POST', /^\/reservations\/:id\/seat$/, { any: ['floor', 'bookings'], feature: 'reservations' }],
  ['*', /^\/reservations(\/|$)/, { any: ['bookings'], feature: 'reservations' }],
  ['*', /^\/checkin(\/|$)/, { any: ['door'] }],
  ['GET', /^\/tabs$/, { any: ['floor', 'orders'], feature: 'ordering' }],
  ['POST', /^\/tabs$/, { any: ['floor', 'orders'], feature: 'ordering' }],
  ['*', /^\/tabs(\/|$)/, { any: ['orders'], feature: 'ordering' }],
  ['GET', /^\/events(\/:eventId\/tickets)?$/, { any: ['events', 'door'], feature: 'ticketing' }],
  ['*', /^\/(events|promos)(\/|$)/, { any: ['events'], feature: 'ticketing' }],
  ['*', /^\/(campaigns|automations)(\/|$)/, { any: ['marketing'], feature: 'marketing' }],
  ['GET', /^\/guests$/, { any: ['guests', 'bookings', 'door', 'marketing', 'community'] }],
  ['*', /^\/guests\/:guestId\/points$/, { any: ['community'], feature: 'community' }],
  ['*', /^\/guests(\/|$)/, { any: ['guests'], feature: 'guests' }],
];

/** The rule for a venue route, or null when no rule covers it (then only owners pass). */
export function ruleFor(method: string, routeUrl: string): Rule | null {
  const path = routeUrl.replace(/^\/api/, '').replace(/^\/venues\/:venueId/, '');
  for (const [m, re, rule] of RULES) if ((m === '*' || m === method) && re.test(path)) return rule;
  return null;
}

export const permsOf = (row: { role: keyof typeof PRESETS }, custom?: string[] | null): Perm[] =>
  custom ? PERMS.filter((p) => custom.includes(p)) : PRESETS[row.role];

/** Screens this person may open, after the venue's features. */
export const visiblePerms = (perms: Perm[], features: string[]) =>
  perms.filter((p) => !PERM_FEATURE[p] || features.includes(PERM_FEATURE[p]!));

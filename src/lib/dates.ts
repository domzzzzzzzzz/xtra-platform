/** Date helpers in the venue's time zone (Egypt by default). */
export function localDate(d = new Date(), tz = 'Africa/Cairo') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** 0 = Sunday for a YYYY-MM-DD date. */
export const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

/**
 * The "night" a moment belongs to. Before 6 AM counts as the previous
 * night, so a 1 AM check-in still matches tonight's booking.
 */
export function nightOf(d = new Date(), tz = 'Africa/Cairo') {
  return localDate(new Date(d.getTime() - 6 * 3600_000), tz);
}

export const prettyDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

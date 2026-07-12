// 2026 NYC government holiday awareness. Dates are keyed "YYYY-MM-DD" in
// America/New_York. HARD = observed closure; SOFT = verify / weekend.

export const HARD_HOLIDAYS: Record<string, string> = {
  '2026-01-01': "New Year's Day",
  '2026-01-19': 'Martin Luther King Jr. Day',
  '2026-02-16': "Presidents' Day",
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day (observed)',
  '2026-09-07': 'Labor Day',
  '2026-10-12': 'Columbus Day',
  '2026-11-03': 'Election Day',
  '2026-11-11': 'Veterans Day',
  '2026-11-26': 'Thanksgiving Day',
  '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day",
};

export const SOFT_HOLIDAYS: Record<string, string> = {
  '2026-02-12': "Lincoln's Birthday (floating — verify office closure)",
};

export type HolidayWarning =
  | { level: 'hard'; label: string }
  | { level: 'soft'; label: string }
  | null;

/**
 * Given a "YYYY-MM-DD" date string, return a holiday/weekend warning or null.
 * Weekends are SOFT warnings.
 */
export function holidayWarning(date: string): HolidayWarning {
  if (!date) return null;

  if (HARD_HOLIDAYS[date]) {
    return { level: 'hard', label: HARD_HOLIDAYS[date] };
  }
  if (SOFT_HOLIDAYS[date]) {
    return { level: 'soft', label: SOFT_HOLIDAYS[date] };
  }

  // Weekend check — parse as a local date (noon avoids TZ edge cases).
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(y, m - 1, d, 12).getDay();
  if (dow === 0) return { level: 'soft', label: 'Sunday' };
  if (dow === 6) return { level: 'soft', label: 'Saturday' };

  return null;
}

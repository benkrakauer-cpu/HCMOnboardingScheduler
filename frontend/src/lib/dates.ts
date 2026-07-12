function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Add a whole number of days to a "YYYY-MM-DD" string (calendar-safe). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Human-friendly "Mon, Jul 13, 2026 · 9:00 AM" for display. */
export function formatWhen(date: string, startTime: string): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (startTime || '00:00').split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  const day = dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

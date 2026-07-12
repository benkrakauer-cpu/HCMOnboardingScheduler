// Build an Outlook-on-the-web / new-Outlook "compose event" deep link.
//
// New Outlook (Windows) and Outlook on the web do not open local .ics files on
// double-click, so this link is the reliable path: it opens the O365 calendar
// event compose pre-filled with subject, time, location, body, and attendees.
// The user adds a Teams link if needed and clicks Send. Times are naive local
// values, interpreted in the signed-in mailbox's timezone (America/New_York for
// NYCEM staff).

const BASE = 'https://outlook.office.com/calendar/0/deeplink/compose';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "YYYY-MM-DDTHH:MM:SS" local wall-clock, with duration applied for the end. */
function localDateTime(date: string, startTime: string, addMinutes = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = startTime.split(':').map(Number);
  const ms = Date.UTC(y, m - 1, d, hh, mm) + addMinutes * 60_000;
  const dt = new Date(ms);
  return (
    `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00`
  );
}

export interface OutlookComposeInput {
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMinutes: number;
  location: string;
  body: string;
  /** Attendee addresses to pre-fill (required + optional + new employees). */
  attendeeEmails: string[];
}

export function outlookComposeUrl(input: OutlookComposeInput): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: input.title,
    startdt: localDateTime(input.date, input.startTime),
    enddt: localDateTime(input.date, input.startTime, input.durationMinutes),
    body: input.body,
  });
  if (input.location.trim()) params.set('location', input.location);
  if (input.attendeeEmails.length > 0) {
    params.set('to', input.attendeeEmails.join(','));
  }
  return `${BASE}?${params.toString()}`;
}

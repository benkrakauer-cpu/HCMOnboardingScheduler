// RFC 5545 .ics builder tuned for Outlook / O365.
//
// Produces a single VEVENT with METHOD:REQUEST so Outlook opens it as a meeting
// the user organizes (offering "Send"), with required/optional attendees
// pre-filled and correct America/New_York local time via an embedded VTIMEZONE.

const REMINDER_LINE = 'Add your Teams link before sending, if applicable.';
const UID_DOMAIN = 'onboardingscheduler.benjaminkrakauer.com';

export interface IcsAttendee {
  displayName: string;
  email: string;
}

export interface IcsMeeting {
  title: string;
  date: string; // "YYYY-MM-DD" (America/New_York wall time)
  startTime: string; // "HH:MM"
  durationMinutes: number;
  room: string;
  notes?: string;
  organizer: IcsAttendee;
  requiredAttendees: IcsAttendee[];
  optionalAttendees: IcsAttendee[];
}

// America/New_York VTIMEZONE with US DST rules so Outlook renders local time.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Escape a text value per RFC 5545 (backslash, semicolon, comma, newline). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Quote a parameter value (e.g. CN) if it contains special characters. */
function paramValue(value: string): string {
  const safe = value.replace(/[\r\n]/g, ' ');
  return /[",;:]/.test(safe) ? `"${safe.replace(/"/g, "'")}"` : safe;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local wall-clock stamp "YYYYMMDDTHHMMSS" (no offset — TZID carries it). */
function localStamp(y: number, m: number, d: number, hh: number, mm: number): string {
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
}

/** UTC stamp "YYYYMMDDTHHMMSSZ" for DTSTAMP. */
function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Fold a content line to <=75 octets with CRLF + leading space continuation. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    chunks.push(' ' + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return chunks.join('\r\n');
}

function uid(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return `${rand}@${UID_DOMAIN}`;
}

/** Build the .ics content for a single meeting. */
export function buildIcs(meeting: IcsMeeting): string {
  const [y, m, d] = meeting.date.split('-').map(Number);
  const [hh, mm] = meeting.startTime.split(':').map(Number);

  const dtStart = localStamp(y, m, d, hh, mm);

  // Compute end wall-clock via neutral (UTC-as-calendar) arithmetic so month/day
  // rollover is correct and independent of the browser's own timezone.
  const endMs = Date.UTC(y, m - 1, d, hh, mm) + meeting.durationMinutes * 60_000;
  const end = new Date(endMs);
  const dtEnd = localStamp(
    end.getUTCFullYear(),
    end.getUTCMonth() + 1,
    end.getUTCDate(),
    end.getUTCHours(),
    end.getUTCMinutes(),
  );

  const description = meeting.notes?.trim()
    ? `${meeting.notes.trim()}\n\n${REMINDER_LINE}`
    : REMINDER_LINE;

  const organizerLine =
    `ORGANIZER;CN=${paramValue(meeting.organizer.displayName || meeting.organizer.email)}` +
    `:mailto:${meeting.organizer.email}`;

  const attendeeLines: string[] = [];
  for (const a of meeting.requiredAttendees) {
    attendeeLines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;` +
        `CN=${paramValue(a.displayName || a.email)}:mailto:${a.email}`,
    );
  }
  for (const a of meeting.optionalAttendees) {
    attendeeLines.push(
      `ATTENDEE;ROLE=OPT-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;` +
        `CN=${paramValue(a.displayName || a.email)}:mailto:${a.email}`,
    );
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NYCEM HCM//Onboarding Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    ...VTIMEZONE,
    'BEGIN:VEVENT',
    `UID:${uid()}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART;TZID=America/New_York:${dtStart}`,
    `DTEND;TZID=America/New_York:${dtEnd}`,
    `SUMMARY:${escapeText(meeting.title)}`,
    `LOCATION:${escapeText(meeting.room)}`,
    `DESCRIPTION:${escapeText(description)}`,
    organizerLine,
    ...attendeeLines,
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** A filesystem-safe .ics filename derived from title + date. */
export function icsFilename(title: string, date: string, startTime: string): string {
  const safeTitle = title
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'meeting';
  const safeTime = startTime.replace(':', '');
  return `${safeTitle}_${date}_${safeTime}.ics`;
}

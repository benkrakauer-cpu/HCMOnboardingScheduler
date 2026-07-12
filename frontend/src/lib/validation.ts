import type { PlannedMeeting } from './types';
import { holidayWarning, type HolidayWarning } from './holidays';

// Pragmatic email check — good enough to catch typos without rejecting valid
// addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Parse a chip/comma/newline-separated list of emails into unique addresses. */
export function parseEmails(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\s,;]+/)) {
    const email = raw.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export interface MeetingWarning {
  meetingKey: string;
  title: string;
  date: string;
  warning: HolidayWarning;
}

export interface ValidationResult {
  errors: string[];
  warnings: MeetingWarning[];
}

/**
 * Validate everything required before generation:
 *  - organizer email present & valid
 *  - at least one valid new-employee email
 *  - every meeting has date, start time, duration, room
 *  - surface holiday/weekend warnings for acknowledgment
 */
export function validateGeneration(
  organizerEmail: string,
  newEmployeeEmails: string[],
  meetings: PlannedMeeting[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: MeetingWarning[] = [];

  if (!organizerEmail.trim()) {
    errors.push('Organizer email is not set. Set it on the Settings screen.');
  } else if (!isValidEmail(organizerEmail)) {
    errors.push(`Organizer email "${organizerEmail}" is not a valid email address.`);
  }

  const validEmployees = newEmployeeEmails.filter(isValidEmail);
  if (newEmployeeEmails.length === 0) {
    errors.push('Add at least one new-employee email address.');
  } else if (validEmployees.length === 0) {
    errors.push('None of the new-employee email addresses are valid.');
  } else {
    const invalid = newEmployeeEmails.filter((e) => !isValidEmail(e));
    for (const e of invalid) {
      errors.push(`New-employee email "${e}" is not valid.`);
    }
  }

  if (meetings.length === 0) {
    errors.push('Add at least one meeting to generate.');
  }

  meetings.forEach((mtg, idx) => {
    const label = mtg.title?.trim() || `Meeting ${idx + 1}`;
    if (!mtg.title?.trim()) errors.push(`Meeting ${idx + 1} is missing a title.`);
    if (!mtg.date) errors.push(`"${label}" is missing a date.`);
    if (!mtg.startTime) errors.push(`"${label}" is missing a start time.`);
    if (!mtg.durationMinutes || mtg.durationMinutes <= 0)
      errors.push(`"${label}" is missing a valid duration.`);
    // Room is optional — lunch and virtual meetings need no physical room.

    if (mtg.date) {
      const warning = holidayWarning(mtg.date);
      if (warning) {
        warnings.push({ meetingKey: mtg.key, title: label, date: mtg.date, warning });
      }
    }
  });

  return { errors, warnings };
}

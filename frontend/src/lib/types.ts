export interface Person {
  id: string;
  displayName: string;
  email: string;
  type: 'person' | 'distro';
}

export interface MeetingTemplate {
  id: string;
  title: string;
  defaultDurationMinutes: number;
  defaultRoom: string;
  requiredAttendeeIds: string[];
  optionalAttendeeIds: string[];
  notes: string;
}

export interface Room {
  id: string;
  name: string;
}

export interface PatternItem {
  meetingTemplateId: string;
  dayOffset: number;
  startTime: string; // "HH:MM"
  durationMinutesOverride?: number | null;
}

export interface Pattern {
  id: string;
  name: string;
  items: PatternItem[];
}

export interface Settings {
  id?: string;
  organizerEmail: string;
}

export interface GeneratedMeetingSummary {
  title: string;
  startDateTime: string;
  room: string;
}

export interface GenerationLogEntry {
  id: string;
  timestamp: string;
  newEmployeeEmails: string[];
  patternUsed: string | null;
  meetingsGenerated: GeneratedMeetingSummary[];
}

/** An attendee resolved for ICS generation. */
export interface ResolvedAttendee {
  displayName: string;
  email: string;
  role: 'REQ' | 'OPT';
}

/** A fully-specified meeting ready to be turned into an .ics file. */
export interface PlannedMeeting {
  key: string; // stable client id for list rendering
  title: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  durationMinutes: number;
  room: string;
  requiredAttendeeIds: string[];
  optionalAttendeeIds: string[];
}

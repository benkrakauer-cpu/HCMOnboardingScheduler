// Entity partition-key names in the single DynamoDB table.
export const PK = {
  PERSON: 'PERSON',
  TEMPLATE: 'TEMPLATE',
  ROOM: 'ROOM',
  PATTERN: 'PATTERN',
  ORGANIZER: 'ORGANIZER',
  LOG: 'LOG',
  SETTINGS: 'SETTINGS',
} as const;

export type EntityPk = (typeof PK)[keyof typeof PK];

export const SETTINGS_ID = 'SINGLETON';

// ---- Domain records (as stored / returned via API) ----

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
  startTime: string; // "HH:MM" (America/New_York)
  durationMinutesOverride?: number | null;
}

export interface Pattern {
  id: string;
  name: string;
  items: PatternItem[];
}

export interface GeneratedMeetingSummary {
  title: string;
  startDateTime: string; // ISO-ish local string
  room: string;
}

export interface GenerationLogEntry {
  id: string;
  timestamp: string;
  newEmployeeEmails: string[];
  patternUsed: string | null;
  organizerUsed: string | null;
  meetingsGenerated: GeneratedMeetingSummary[];
}

// A stored organizer identity the user can select at generation time.
export interface Organizer {
  id: string;
  displayName: string;
  email: string;
}

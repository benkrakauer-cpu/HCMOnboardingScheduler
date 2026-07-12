import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';
import { RoomPicker } from '../components/RoomPicker';
import { AttendeeMultiSelect } from '../components/MultiSelect';
import { OemEmailInput } from '../components/OemEmailInput';
import { REMINDER_LINE, type IcsAttendee } from '../lib/ics';
import { outlookComposeUrl } from '../lib/outlook';
import { isValidEmail, validateGeneration } from '../lib/validation';
import { holidayWarning, type HolidayWarning } from '../lib/holidays';
import { addDays, formatWhen } from '../lib/dates';
import type { MeetingTemplate, PlannedMeeting, RepeatFreq } from '../lib/types';

let keyCounter = 0;
const nextKey = () => `m${Date.now()}-${keyCounter++}`;

/** Expand any recurring meetings into one concrete occurrence per repeat. */
function expandOccurrences(list: PlannedMeeting[]): PlannedMeeting[] {
  const out: PlannedMeeting[] = [];
  for (const m of list) {
    if (m.repeatFreq === 'none' || !m.date) {
      out.push(m);
      continue;
    }
    const count = Math.max(1, Math.floor(m.repeatCount) || 1);
    const step = m.repeatFreq === 'weekly' ? 7 : 1;
    for (let i = 0; i < count; i++) {
      out.push({
        ...m,
        key: count > 1 ? `${m.key}-occ${i + 1}` : m.key,
        date: addDays(m.date, i * step),
      });
    }
  }
  return out;
}

interface GeneratedResult {
  meeting: PlannedMeeting;
  outlookUrl: string;
  warning: HolidayWarning;
}

export function GeneratePage() {
  const { organizers, templates, people, patterns, personById } = useData();

  const [mode, setMode] = useState<'manual' | 'pattern'>('manual');

  // New-employee entries (full resolved addresses) + the in-progress add row.
  const [employeeEmails, setEmployeeEmails] = useState<string[]>([]);
  const [pendingEmail, setPendingEmail] = useState('');

  // Selected organizer (defaults to the first available).
  const [organizerId, setOrganizerId] = useState('');
  const selectedOrganizer =
    organizers.find((o) => o.id === organizerId) ?? organizers[0];
  const organizerEmail = selectedOrganizer?.email ?? '';

  const [meetings, setMeetings] = useState<PlannedMeeting[]>([]);

  // Pattern-mode controls
  const [patternId, setPatternId] = useState('');
  const [startDate, setStartDate] = useState('');

  // Validation / generation state
  const [validation, setValidation] = useState<ReturnType<typeof validateGeneration> | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [results, setResults] = useState<GeneratedResult[] | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addEmployee() {
    const email = pendingEmail.trim();
    if (!email) return;
    if (employeeEmails.some((e) => e.toLowerCase() === email.toLowerCase())) {
      setPendingEmail('');
      return;
    }
    setEmployeeEmails((list) => [...list, email]);
    setPendingEmail('');
    resetGenState();
  }
  function removeEmployee(email: string) {
    setEmployeeEmails((list) => list.filter((e) => e !== email));
    resetGenState();
  }

  function resetGenState() {
    setValidation(null);
    setAcknowledged(false);
    setResults(null);
    setGenError(null);
  }

  function meetingFromTemplate(t: MeetingTemplate | null, date = '', startTime = '09:00'): PlannedMeeting {
    return {
      key: nextKey(),
      title: t?.title ?? '',
      date,
      startTime,
      durationMinutes: t?.defaultDurationMinutes ?? 30,
      room: t?.defaultRoom ?? '',
      notes: t?.notes ?? '',
      requiredAttendeeIds: t ? [...t.requiredAttendeeIds] : [],
      optionalAttendeeIds: t ? [...t.optionalAttendeeIds] : [],
      repeatFreq: 'none',
      repeatCount: 1,
    };
  }

  function addManualMeeting() {
    setMeetings((m) => [...m, meetingFromTemplate(null)]);
    resetGenState();
  }

  function buildFromPattern() {
    const pattern = patterns.find((p) => p.id === patternId);
    if (!pattern || !startDate) return;
    const built: PlannedMeeting[] = pattern.items
      .slice()
      .sort((a, b) => a.dayOffset - b.dayOffset || a.startTime.localeCompare(b.startTime))
      .map((item) => {
        const t = templates.find((x) => x.id === item.meetingTemplateId) ?? null;
        const meeting = meetingFromTemplate(t, addDays(startDate, item.dayOffset), item.startTime);
        if (item.durationMinutesOverride) meeting.durationMinutes = item.durationMinutesOverride;
        return meeting;
      });
    setMeetings(built);
    resetGenState();
  }

  function updateMeeting(key: string, patch: Partial<PlannedMeeting>) {
    setMeetings((m) => m.map((mtg) => (mtg.key === key ? { ...mtg, ...patch } : mtg)));
    resetGenState();
  }
  function removeMeeting(key: string) {
    setMeetings((m) => m.filter((mtg) => mtg.key !== key));
    resetGenState();
  }
  function applyTemplate(key: string, templateId: string) {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    updateMeeting(key, {
      title: t.title,
      durationMinutes: t.defaultDurationMinutes,
      room: t.defaultRoom,
      notes: t.notes,
      requiredAttendeeIds: [...t.requiredAttendeeIds],
      optionalAttendeeIds: [...t.optionalAttendeeIds],
    });
  }

  function resolveAttendee(id: string): IcsAttendee | null {
    const p = personById(id);
    return p ? { displayName: p.displayName, email: p.email } : null;
  }

  function handleGenerate() {
    setGenError(null);
    // Validate the fully-expanded occurrence list so recurring dates are checked.
    const expanded = expandOccurrences(meetings);
    const result = validateGeneration(organizerEmail, employeeEmails, expanded);
    setValidation(result);
    setResults(null);
    if (result.errors.length > 0) return;
    if (result.warnings.length > 0 && !acknowledged) return; // wait for acknowledgment
    doGenerate(expanded);
  }

  async function doGenerate(expanded: PlannedMeeting[]) {
    setBusy(true);
    setGenError(null);
    try {
      const employeeAttendees: IcsAttendee[] = employeeEmails
        .filter(isValidEmail)
        .map((email) => ({ displayName: email, email }));

      const generated: GeneratedResult[] = expanded.map((mtg) => {
        const templateRequired = mtg.requiredAttendeeIds
          .map(resolveAttendee)
          .filter((a): a is IcsAttendee => a !== null);
        const optional = mtg.optionalAttendeeIds
          .map(resolveAttendee)
          .filter((a): a is IcsAttendee => a !== null);

        // New employees are added as REQUIRED attendees to every meeting.
        const requiredAttendees = [...templateRequired, ...employeeAttendees];

        // Invitation body: the template's configurable text, then the reminder.
        const body = mtg.notes?.trim()
          ? `${mtg.notes.trim()}\n\n${REMINDER_LINE}`
          : REMINDER_LINE;

        // Deep link that opens Outlook-web / new-Outlook compose pre-filled.
        // All attendees go in one field (the web compose has no optional slot).
        const attendeeEmails = [...new Set([...requiredAttendees, ...optional].map((a) => a.email))];
        const outlookUrl = outlookComposeUrl({
          title: mtg.title,
          date: mtg.date,
          startTime: mtg.startTime,
          durationMinutes: mtg.durationMinutes,
          location: mtg.room,
          body,
          attendeeEmails,
        });

        return {
          meeting: mtg,
          outlookUrl,
          warning: holidayWarning(mtg.date),
        };
      });

      setResults(generated);

      // Append a generation-log entry.
      await api.addLog({
        newEmployeeEmails: employeeEmails,
        patternUsed:
          mode === 'pattern'
            ? patterns.find((p) => p.id === patternId)?.name ?? null
            : null,
        organizerUsed: selectedOrganizer
          ? `${selectedOrganizer.displayName} <${selectedOrganizer.email}>`
          : organizerEmail || null,
        meetingsGenerated: generated.map((g) => ({
          title: g.meeting.title,
          startDateTime: formatWhen(g.meeting.date, g.meeting.startTime),
          room: g.meeting.room,
        })),
      });
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  }

  // ---- Organizer gate ----
  if (organizers.length === 0) {
    return (
      <div>
        <h1>Generate</h1>
        <div className="alert warn-hard">
          <strong>Add an organizer first.</strong> Go to the <em>Settings</em> screen and add at
          least one organizer. An organizer is required as the meeting organizer before you can
          generate invitations.
        </div>
      </div>
    );
  }

  const canGenerate =
    employeeEmails.length > 0 && meetings.length > 0 && Boolean(organizerEmail);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="mb-0">Generate Invitations</h1>
          <p>
            Build the onboarding meetings, then click <strong>Open in Outlook</strong> on each one.
            It opens the Outlook event compose with attendees and details pre-filled — you add a
            Teams link if needed and send it yourself. Nothing is sent automatically.
          </p>
        </div>
      </div>

      {/* Step 1 — new employees + organizer */}
      <div className="panel">
        <h2>1. New employee(s)</h2>
        <p className="hint">
          Type each new hire's username — <span className="mono">@oem.nyc.gov</span> is added
          automatically. Use the override for a non-standard address. Each is added as a required
          attendee on every meeting.
        </p>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <OemEmailInput
              value={pendingEmail}
              onChange={setPendingEmail}
              onEnter={addEmployee}
              placeholder="jdoe"
            />
          </div>
          <div className="field" style={{ flex: '0 0 auto', marginBottom: 0 }}>
            <button
              className="btn"
              onClick={addEmployee}
              disabled={!isValidEmail(pendingEmail)}
            >
              + Add
            </button>
          </div>
        </div>

        {employeeEmails.length > 0 && (
          <div className="chips" style={{ marginTop: 12 }}>
            {employeeEmails.map((email) => (
              <span className={`chip ${isValidEmail(email) ? '' : 'invalid'}`} key={email}>
                {email}
                {!isValidEmail(email) && ' (invalid)'}
                <button onClick={() => removeEmployee(email)} aria-label={`Remove ${email}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="field" style={{ marginTop: 18, marginBottom: 0, maxWidth: 420 }}>
          <label>Organizer (required)</label>
          <select
            value={selectedOrganizer?.id ?? ''}
            onChange={(e) => {
              setOrganizerId(e.target.value);
              resetGenState();
            }}
          >
            {organizers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName} — {o.email}
              </option>
            ))}
          </select>
          <p className="hint">
            Stamped as the invitation <span className="mono">ORGANIZER</span>. Manage the list on
            the Settings screen.
          </p>
        </div>
      </div>

      {/* Step 2 — build meetings */}
      <div className="panel">
        <h2>2. Build meetings</h2>
        <div className="btn-row" style={{ marginBottom: 14 }}>
          <button
            className={`btn ${mode === 'manual' ? '' : 'secondary'}`}
            onClick={() => setMode('manual')}
          >
            Manual
          </button>
          <button
            className={`btn ${mode === 'pattern' ? '' : 'secondary'}`}
            onClick={() => setMode('pattern')}
          >
            From a pattern
          </button>
        </div>

        {mode === 'manual' ? (
          <div className="btn-row">
            <button className="btn secondary" onClick={addManualMeeting}>
              + Add a meeting
            </button>
          </div>
        ) : (
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <label>Pattern</label>
              <select value={patternId} onChange={(e) => setPatternId(e.target.value)}>
                <option value="">— Select a pattern —</option>
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Start date (Day 0)</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <button className="btn" onClick={buildFromPattern} disabled={!patternId || !startDate}>
                Build meetings
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Meeting cards */}
      {meetings.length > 0 && (
        <div className="panel">
          <h2>Meetings ({meetings.length})</h2>
          {meetings.map((mtg) => (
            <MeetingEditor
              key={mtg.key}
              meeting={mtg}
              templates={templates}
              people={people}
              onApplyTemplate={(id) => applyTemplate(mtg.key, id)}
              onChange={(patch) => updateMeeting(mtg.key, patch)}
              onRemove={() => removeMeeting(mtg.key)}
            />
          ))}
        </div>
      )}

      {/* Step 3 — validate & generate */}
      <div className="panel">
        <h2>3. Validate &amp; generate</h2>

        {validation && validation.errors.length > 0 && (
          <div className="alert error">
            <strong>Fix these before generating:</strong>
            <ul>
              {validation.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {validation && validation.warnings.length > 0 && (
          <div className="alert warn-soft">
            <strong>Please review these date warnings:</strong>
            <ul>
              {validation.warnings.map((w, i) => (
                <li key={i}>
                  <span className={`badge ${w.warning?.level}`}>{w.warning?.level}</span>{' '}
                  {w.title} on {w.date} — {w.warning?.label}
                </li>
              ))}
            </ul>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontWeight: 500 }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              I understand and want to generate these meetings anyway.
            </label>
          </div>
        )}

        {genError && <div className="alert error">{genError}</div>}

        <button
          className="btn large"
          onClick={handleGenerate}
          disabled={!canGenerate || busy}
        >
          {busy ? 'Generating…' : 'Generate invitations'}
        </button>
        {!canGenerate && (
          <p className="hint">
            Add at least one new-employee email and at least one meeting to enable generation.
          </p>
        )}
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className="panel">
          <h2 className="mb-0">Generated {results.length} invitation(s)</h2>
          <div className="alert success" style={{ marginTop: 14 }}>
            For each meeting below, click <strong>Open in Outlook</strong>. It opens the Outlook
            event compose with the attendees and details pre-filled — add a Teams link if needed,
            then <strong>Send</strong>.
          </div>
          {results.map((r) => (
            <div
              className={`card meeting-card ${r.warning ? 'has-warning' : ''}`}
              key={r.meeting.key}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <strong>{r.meeting.title}</strong>
                  <div className="hint mt-0">
                    {formatWhen(r.meeting.date, r.meeting.startTime)} · {r.meeting.durationMinutes} min ·{' '}
                    {r.meeting.room || 'No room'}
                  </div>
                  {r.warning && (
                    <span className={`badge ${r.warning.level}`} style={{ marginTop: 4, display: 'inline-block' }}>
                      {r.warning.level === 'hard' ? 'Holiday' : 'Check'}: {r.warning.label}
                    </span>
                  )}
                </div>
                <a
                  className="btn"
                  href={r.outlookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Outlook
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-meeting editor card
// ---------------------------------------------------------------------------
function MeetingEditor({
  meeting,
  templates,
  people,
  onApplyTemplate,
  onChange,
  onRemove,
}: {
  meeting: PlannedMeeting;
  templates: MeetingTemplate[];
  people: import('../lib/types').Person[];
  onApplyTemplate: (templateId: string) => void;
  onChange: (patch: Partial<PlannedMeeting>) => void;
  onRemove: () => void;
}) {
  const [showAttendees, setShowAttendees] = useState(false);
  const warning = holidayWarning(meeting.date);

  return (
    <div className="card" style={{ borderLeft: warning ? '4px solid var(--warn-soft-text)' : undefined }}>
      <div className="field">
        <label>Start from a template (optional)</label>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onApplyTemplate(e.target.value);
          }}
        >
          <option value="">— Pre-fill from a meeting template —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Title</label>
        <input
          type="text"
          value={meeting.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Meeting title"
        />
      </div>

      <div className="row">
        <div className="field" style={{ maxWidth: 170 }}>
          <label>Date</label>
          <input
            type="date"
            value={meeting.date}
            onChange={(e) => onChange({ date: e.target.value })}
          />
        </div>
        <div className="field" style={{ maxWidth: 130 }}>
          <label>Start time</label>
          <input
            type="time"
            value={meeting.startTime}
            onChange={(e) => onChange({ startTime: e.target.value })}
          />
        </div>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>Duration (min)</label>
          <input
            type="number"
            min={5}
            step={5}
            value={meeting.durationMinutes}
            onChange={(e) => onChange({ durationMinutes: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Room</label>
          <RoomPicker value={meeting.room} onChange={(room) => onChange({ room })} />
        </div>
      </div>

      <div className="row">
        <div className="field" style={{ maxWidth: 190 }}>
          <label>Repeat</label>
          <select
            value={meeting.repeatFreq}
            onChange={(e) => onChange({ repeatFreq: e.target.value as RepeatFreq })}
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        {meeting.repeatFreq !== 'none' && (
          <div className="field" style={{ maxWidth: 150 }}>
            <label>Occurrences</label>
            <input
              type="number"
              min={1}
              max={60}
              value={meeting.repeatCount}
              onChange={(e) => onChange({ repeatCount: Math.max(1, Number(e.target.value)) })}
            />
          </div>
        )}
      </div>
      {meeting.repeatFreq !== 'none' && (
        <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
          Generates {Math.max(1, Math.floor(meeting.repeatCount) || 1)} separate invitations, one
          every {meeting.repeatFreq === 'weekly' ? 'week' : 'day'} starting{' '}
          {meeting.date || 'the chosen date'}.
        </p>
      )}

      <div className="field">
        <label>Invitation body — what it's about &amp; what to bring</label>
        <textarea
          value={meeting.notes}
          rows={3}
          placeholder="Pre-filled from the template; edit for this meeting if needed."
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>

      {warning && (
        <div className={`alert ${warning.level === 'hard' ? 'warn-hard' : 'warn-soft'}`}>
          {warning.level === 'hard' ? 'NYC holiday' : 'Heads up'}: {meeting.date} — {warning.label}
        </div>
      )}

      <div className="btn-row">
        <button className="btn secondary small" onClick={() => setShowAttendees((s) => !s)}>
          {showAttendees ? 'Hide attendees' : 'Edit attendees'} ({meeting.requiredAttendeeIds.length} req ·{' '}
          {meeting.optionalAttendeeIds.length} opt)
        </button>
        <button className="btn danger small" onClick={onRemove}>
          Remove meeting
        </button>
      </div>

      {showAttendees && (
        <div style={{ marginTop: 12 }}>
          <div className="field">
            <label>Required attendees (in addition to the new employee)</label>
            <AttendeeMultiSelect
              people={people}
              selectedIds={meeting.requiredAttendeeIds}
              onChange={(ids) => onChange({ requiredAttendeeIds: ids })}
            />
          </div>
          <div className="field">
            <label>Optional attendees</label>
            <AttendeeMultiSelect
              people={people}
              selectedIds={meeting.optionalAttendeeIds}
              onChange={(ids) => onChange({ optionalAttendeeIds: ids })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

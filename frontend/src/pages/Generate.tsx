import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';
import { RoomPicker } from '../components/RoomPicker';
import { AttendeeMultiSelect } from '../components/MultiSelect';
import { OemEmailInput } from '../components/OemEmailInput';
import { buildIcs, icsFilename, type IcsAttendee } from '../lib/ics';
import { downloadText, downloadZip } from '../lib/download';
import { isValidEmail, validateGeneration } from '../lib/validation';
import { holidayWarning, type HolidayWarning } from '../lib/holidays';
import { addDays, formatWhen } from '../lib/dates';
import type { MeetingTemplate, PlannedMeeting } from '../lib/types';

let keyCounter = 0;
const nextKey = () => `m${Date.now()}-${keyCounter++}`;

interface GeneratedResult {
  meeting: PlannedMeeting;
  filename: string;
  content: string;
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
      requiredAttendeeIds: t ? [...t.requiredAttendeeIds] : [],
      optionalAttendeeIds: t ? [...t.optionalAttendeeIds] : [],
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
    const result = validateGeneration(organizerEmail, employeeEmails, meetings);
    setValidation(result);
    setResults(null);
    if (result.errors.length > 0) return;
    if (result.warnings.length > 0 && !acknowledged) return; // wait for acknowledgment
    doGenerate();
  }

  async function doGenerate() {
    setBusy(true);
    setGenError(null);
    try {
      const employeeAttendees: IcsAttendee[] = employeeEmails
        .filter(isValidEmail)
        .map((email) => ({ displayName: email, email }));

      const generated: GeneratedResult[] = meetings.map((mtg) => {
        const templateRequired = mtg.requiredAttendeeIds
          .map(resolveAttendee)
          .filter((a): a is IcsAttendee => a !== null);
        const optional = mtg.optionalAttendeeIds
          .map(resolveAttendee)
          .filter((a): a is IcsAttendee => a !== null);

        const content = buildIcs({
          title: mtg.title,
          date: mtg.date,
          startTime: mtg.startTime,
          durationMinutes: mtg.durationMinutes,
          room: mtg.room,
          organizer: {
            displayName: selectedOrganizer?.displayName || organizerEmail,
            email: organizerEmail,
          },
          // New employees are added as REQUIRED attendees to every meeting.
          requiredAttendees: [...templateRequired, ...employeeAttendees],
          optionalAttendees: optional,
        });

        return {
          meeting: mtg,
          filename: icsFilename(mtg.title, mtg.date, mtg.startTime),
          content,
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

  async function downloadAll() {
    if (!results) return;
    await downloadZip(
      'onboarding-invitations.zip',
      results.map((r) => ({ filename: r.filename, content: r.content })),
    );
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
            Build onboarding meetings, then download an Outlook .ics for each. Nothing is sent —
            you review and send from your own Outlook.
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="mb-0">Generated {results.length} invitation(s)</h2>
            <button className="btn" onClick={downloadAll}>
              Download all (.zip)
            </button>
          </div>
          <div className="alert success" style={{ marginTop: 14 }}>
            Open each .ics in Outlook. It opens as a calendar event with the attendees and details
            filled in — add a Teams link if needed, then invite/<strong>Send</strong> from Outlook.
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
                    {r.meeting.room}
                  </div>
                  {r.warning && (
                    <span className={`badge ${r.warning.level}`} style={{ marginTop: 4, display: 'inline-block' }}>
                      {r.warning.level === 'hard' ? 'Holiday' : 'Check'}: {r.warning.label}
                    </span>
                  )}
                </div>
                <button
                  className="btn"
                  onClick={() => downloadText(r.filename, r.content)}
                >
                  Download .ics
                </button>
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

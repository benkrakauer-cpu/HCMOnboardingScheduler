import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { AttendeeMultiSelect } from '../components/MultiSelect';
import { RoomPicker } from '../components/RoomPicker';
import type { MeetingTemplate } from '../lib/types';

const BLANK: Omit<MeetingTemplate, 'id'> = {
  title: '',
  defaultDurationMinutes: 30,
  defaultRoom: '',
  requiredAttendeeIds: [],
  optionalAttendeeIds: [],
  notes: '',
};

export function MeetingsPage() {
  const { templates, reloadTemplates } = useData();
  const [editing, setEditing] = useState<MeetingTemplate | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(t: MeetingTemplate) {
    if (!confirm(`Delete meeting template "${t.title}"?`)) return;
    try {
      await api.remove('templates', t.id);
      await reloadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="mb-0">Meetings</h1>
          <p>
            Reusable meeting templates. Mark an "Optional" meeting by putting it in the title
            (e.g. "Supervisor Meet &amp; Greet - Optional").
          </p>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>
          + Add meeting template
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="panel">
        {templates.length === 0 ? (
          <div className="empty">No meeting templates yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Duration</th>
                <th>Room</th>
                <th>Attendees</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...templates]
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((t) => (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>{t.defaultDurationMinutes} min</td>
                    <td>{t.defaultRoom || <span className="text-muted">—</span>}</td>
                    <td>
                      <span className="text-muted">
                        {t.requiredAttendeeIds.length} req · {t.optionalAttendeeIds.length} opt
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn secondary small" onClick={() => setEditing(t)}>
                        Edit
                      </button>{' '}
                      <button className="btn danger small" onClick={() => remove(t)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <TemplateModal
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reloadTemplates();
          }}
        />
      )}

    </div>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: MeetingTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { people } = useData();
  const [form, setForm] = useState<Omit<MeetingTemplate, 'id'>>(
    template ? { ...template } : BLANK,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.title.trim()) return setError('Title is required.');
    if (!form.defaultDurationMinutes || form.defaultDurationMinutes <= 0)
      return setError('Duration must be a positive number of minutes.');
    setBusy(true);
    setError(null);
    try {
      if (template) await api.update('templates', template.id, form);
      else await api.create('templates', form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <Modal title={template ? 'Edit meeting template' : 'Add meeting template'} onClose={onClose}>
      {error && <div className="alert error">{error}</div>}
      <div className="field">
        <label>Title</label>
        <input
          type="text"
          value={form.title}
          autoFocus
          placeholder="e.g. IT Setup & Badging"
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>
      <div className="row">
        <div className="field">
          <label>Default duration (minutes)</label>
          <input
            type="number"
            min={5}
            step={5}
            value={form.defaultDurationMinutes}
            onChange={(e) =>
              setForm({ ...form, defaultDurationMinutes: Number(e.target.value) })
            }
          />
        </div>
        <div className="field">
          <label>Default room</label>
          <RoomPicker
            value={form.defaultRoom}
            onChange={(room) => setForm({ ...form, defaultRoom: room })}
          />
        </div>
      </div>
      <div className="field">
        <label>Required attendees</label>
        <AttendeeMultiSelect
          people={people}
          selectedIds={form.requiredAttendeeIds}
          onChange={(ids) => setForm({ ...form, requiredAttendeeIds: ids })}
        />
      </div>
      <div className="field">
        <label>Optional attendees</label>
        <AttendeeMultiSelect
          people={people}
          selectedIds={form.optionalAttendeeIds}
          onChange={(ids) => setForm({ ...form, optionalAttendeeIds: ids })}
        />
      </div>
      <div className="field">
        <label>Notes (added to invitation description)</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="btn-row">
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

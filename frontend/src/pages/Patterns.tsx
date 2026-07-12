import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import type { Pattern, PatternItem } from '../lib/types';

export function PatternsPage() {
  const { patterns, templates, reloadPatterns } = useData();
  const [editing, setEditing] = useState<Pattern | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const templateName = (id: string) =>
    templates.find((t) => t.id === id)?.title ?? '(deleted template)';

  async function remove(p: Pattern) {
    if (!confirm(`Delete pattern "${p.name}"?`)) return;
    try {
      await api.remove('patterns', p.id);
      await reloadPatterns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="mb-0">Patterns</h1>
          <p>Reusable onboarding sequences. Each item is a meeting on a day offset from the start date.</p>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>
          + New pattern
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {patterns.length === 0 ? (
        <div className="panel">
          <div className="empty">No patterns yet.</div>
        </div>
      ) : (
        patterns.map((p) => (
          <div className="card" key={p.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="mb-0">{p.name}</h2>
              <div>
                <button className="btn secondary small" onClick={() => setEditing(p)}>
                  Edit
                </button>{' '}
                <button className="btn danger small" onClick={() => remove(p)}>
                  Delete
                </button>
              </div>
            </div>
            <table style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Start</th>
                  <th>Meeting</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {[...p.items]
                  .sort((a, b) => a.dayOffset - b.dayOffset || a.startTime.localeCompare(b.startTime))
                  .map((it, i) => (
                    <tr key={i}>
                      <td>Day {it.dayOffset}</td>
                      <td>{it.startTime}</td>
                      <td>{templateName(it.meetingTemplateId)}</td>
                      <td>{it.durationMinutesOverride ? `${it.durationMinutesOverride} min` : 'default'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {editing && (
        <PatternModal
          pattern={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reloadPatterns();
          }}
        />
      )}
    </div>
  );
}

function PatternModal({
  pattern,
  onClose,
  onSaved,
}: {
  pattern: Pattern | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { templates } = useData();
  const [name, setName] = useState(pattern?.name ?? '');
  const [items, setItems] = useState<PatternItem[]>(pattern ? [...pattern.items] : []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function addItem() {
    setItems([
      ...items,
      {
        meetingTemplateId: templates[0]?.id ?? '',
        dayOffset: 0,
        startTime: '09:00',
        durationMinutesOverride: null,
      },
    ]);
  }

  function updateItem(idx: number, patch: Partial<PatternItem>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next);
  }

  async function save() {
    if (!name.trim()) return setError('Pattern name is required.');
    if (items.length === 0) return setError('Add at least one meeting to the pattern.');
    if (items.some((it) => !it.meetingTemplateId))
      return setError('Every item needs a meeting template selected.');
    setBusy(true);
    setError(null);
    const payload = { name: name.trim(), items };
    try {
      if (pattern) await api.update('patterns', pattern.id, payload);
      else await api.create('patterns', payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <Modal title={pattern ? 'Edit pattern' : 'New pattern'} onClose={onClose}>
      {error && <div className="alert error">{error}</div>}
      <div className="field">
        <label>Pattern name</label>
        <input
          type="text"
          value={name}
          autoFocus
          placeholder="e.g. Standard 5-Day Onboarding"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {templates.length === 0 && (
        <div className="alert warn-soft">
          You have no meeting templates yet. Create some on the Meetings screen first.
        </div>
      )}

      <label>Meetings in this pattern</label>
      {items.length === 0 && <p className="hint">No meetings added yet.</p>}

      {items.map((it, idx) => (
        <div className="card" key={idx} style={{ padding: 12 }}>
          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <label>Meeting</label>
              <select
                value={it.meetingTemplateId}
                onChange={(e) => updateItem(idx, { meetingTemplateId: e.target.value })}
              >
                <option value="">— Select —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ maxWidth: 90 }}>
              <label>Day offset</label>
              <input
                type="number"
                value={it.dayOffset}
                onChange={(e) => updateItem(idx, { dayOffset: Number(e.target.value) })}
              />
            </div>
            <div className="field" style={{ maxWidth: 120 }}>
              <label>Start time</label>
              <input
                type="time"
                value={it.startTime}
                onChange={(e) => updateItem(idx, { startTime: e.target.value })}
              />
            </div>
            <div className="field" style={{ maxWidth: 130 }}>
              <label>Duration override</label>
              <input
                type="number"
                placeholder="default"
                value={it.durationMinutesOverride ?? ''}
                onChange={(e) =>
                  updateItem(idx, {
                    durationMinutesOverride: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>
          <div className="btn-row">
            <button className="btn secondary small" onClick={() => move(idx, -1)} disabled={idx === 0}>
              ↑
            </button>
            <button
              className="btn secondary small"
              onClick={() => move(idx, 1)}
              disabled={idx === items.length - 1}
            >
              ↓
            </button>
            <button className="btn danger small" onClick={() => removeItem(idx)}>
              Remove
            </button>
          </div>
        </div>
      ))}

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn secondary" onClick={addItem} disabled={templates.length === 0}>
          + Add meeting
        </button>
      </div>

      <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
      <div className="btn-row">
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save pattern'}
        </button>
        <button className="btn secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

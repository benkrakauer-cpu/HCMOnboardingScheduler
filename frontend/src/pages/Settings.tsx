import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { OemEmailInput } from '../components/OemEmailInput';
import { isValidEmail } from '../lib/validation';
import type { Organizer } from '../lib/types';

export function SettingsPage() {
  const { organizers, reloadOrganizers } = useData();
  const [editing, setEditing] = useState<Organizer | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(o: Organizer) {
    if (!confirm(`Remove organizer "${o.displayName}"?`)) return;
    try {
      await api.remove('organizers', o.id);
      await reloadOrganizers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="mb-0">Organizers</h1>
          <p>
            The people who can appear as the meeting organizer. On the Generate screen you pick one
            per batch; it is stamped as the invitation organizer.
          </p>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>
          + Add organizer
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="panel">
        {organizers.length === 0 ? (
          <div className="empty">
            No organizers yet. Add at least one — generation is blocked until you do.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {organizers.map((o) => (
                <tr key={o.id}>
                  <td>{o.displayName}</td>
                  <td>{o.email}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn secondary small" onClick={() => setEditing(o)}>
                      Edit
                    </button>{' '}
                    <button className="btn danger small" onClick={() => remove(o)}>
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
        <OrganizerModal
          organizer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reloadOrganizers();
          }}
        />
      )}
    </div>
  );
}

function OrganizerModal({
  organizer,
  onClose,
  onSaved,
}: {
  organizer: Organizer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(organizer?.displayName ?? '');
  const [email, setEmail] = useState(organizer?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!displayName.trim()) return setError('Name is required.');
    if (!isValidEmail(email)) return setError('A valid email is required.');
    setBusy(true);
    setError(null);
    const payload = { displayName: displayName.trim(), email: email.trim() };
    try {
      if (organizer) await api.update('organizers', organizer.id, payload);
      else await api.create('organizers', payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <Modal title={organizer ? 'Edit organizer' : 'Add organizer'} onClose={onClose}>
      {error && <div className="alert error">{error}</div>}
      <div className="field">
        <label>Display name</label>
        <input
          type="text"
          value={displayName}
          autoFocus
          placeholder="e.g. Jane Doe"
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Email</label>
        <OemEmailInput value={email} onChange={setEmail} onEnter={save} />
        {email && <p className="hint">Resolves to: <span className="mono">{email}</span></p>}
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

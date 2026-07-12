import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';
import { Modal } from '../components/Modal';
import { isValidEmail } from '../lib/validation';
import type { Person } from '../lib/types';

const BLANK: Omit<Person, 'id'> = { displayName: '', email: '', type: 'person' };

export function DirectoryPage() {
  const { people, reloadPeople } = useData();
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(p: Person) {
    if (!confirm(`Delete "${p.displayName}" from the directory?`)) return;
    try {
      await api.remove('directory', p.id);
      await reloadPeople();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="mb-0">Directory</h1>
          <p>People and distribution lists you can add as meeting attendees.</p>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>
          + Add person / distro
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="panel">
        {people.length === 0 ? (
          <div className="empty">No entries yet. Add your first person or distro.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...people]
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
                .map((p) => (
                  <tr key={p.id}>
                    <td>{p.displayName}</td>
                    <td>{p.email}</td>
                    <td>
                      <span className={`badge ${p.type}`}>{p.type}</span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn secondary small" onClick={() => setEditing(p)}>
                        Edit
                      </button>{' '}
                      <button className="btn danger small" onClick={() => remove(p)}>
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
        <PersonModal
          person={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reloadPeople();
          }}
        />
      )}
    </div>
  );
}

function PersonModal({
  person,
  onClose,
  onSaved,
}: {
  person: Person | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Omit<Person, 'id'>>(
    person ? { displayName: person.displayName, email: person.email, type: person.type } : BLANK,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.displayName.trim()) return setError('Name is required.');
    if (!isValidEmail(form.email)) return setError('A valid email is required.');
    setBusy(true);
    setError(null);
    try {
      if (person) await api.update('directory', person.id, form);
      else await api.create('directory', form);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <Modal title={person ? 'Edit entry' : 'Add person / distro'} onClose={onClose}>
      {error && <div className="alert error">{error}</div>}
      <div className="field">
        <label>Display name</label>
        <input
          type="text"
          value={form.displayName}
          autoFocus
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Type</label>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as Person['type'] })}
        >
          <option value="person">Person</option>
          <option value="distro">Distribution list</option>
        </select>
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

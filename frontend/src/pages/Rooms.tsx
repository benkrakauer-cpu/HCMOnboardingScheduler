import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';
import type { Room } from '../lib/types';

export function RoomsPage() {
  const { rooms, reloadRooms } = useData();
  const [newRoom, setNewRoom] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const name = newRoom.trim();
    if (!name) return;
    if (rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return setError(`"${name}" already exists.`);
    }
    setBusy(true);
    setError(null);
    try {
      await api.create('rooms', { name });
      setNewRoom('');
      await reloadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(room: Room) {
    const name = editName.trim();
    if (!name) return;
    try {
      await api.update('rooms', room.id, { ...room, name });
      setEditingId(null);
      await reloadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    }
  }

  async function remove(room: Room) {
    if (!confirm(`Delete room "${room.name}"?`)) return;
    try {
      await api.remove('rooms', room.id);
      await reloadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="mb-0">Rooms</h1>
          <p>Rooms available when building meetings. Add, rename, or remove them here.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="panel">
        <div className="field mb-0">
          <label>Add a room</label>
          <div className="inline-add">
            <input
              type="text"
              value={newRoom}
              placeholder="e.g. Conference Room 4B"
              onChange={(e) => setNewRoom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <button className="btn" onClick={add} disabled={busy || !newRoom.trim()}>
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        {rooms.length === 0 ? (
          <div className="empty">No rooms yet.</div>
        ) : (
          <table>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td>
                    {editingId === r.id ? (
                      <input
                        type="text"
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(r)}
                      />
                    ) : (
                      r.name
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {editingId === r.id ? (
                      <>
                        <button className="btn small" onClick={() => saveEdit(r)}>
                          Save
                        </button>{' '}
                        <button className="btn secondary small" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn secondary small"
                          onClick={() => {
                            setEditingId(r.id);
                            setEditName(r.name);
                          }}
                        >
                          Rename
                        </button>{' '}
                        <button className="btn danger small" onClick={() => remove(r)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

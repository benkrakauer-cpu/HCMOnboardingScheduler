import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';

// LOCATION value used for virtual meetings. The user still adds the real Teams
// link before sending; this just labels the event as virtual.
export const VIRTUAL_LOCATION = 'Microsoft Teams Meeting';

/**
 * Room dropdown with an inline "add new room" affordance, plus built-in
 * "No room" and "Virtual" options. Newly added rooms persist (they are saved
 * to the Rooms directory) and become selected.
 */
export function RoomPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (room: string) => void;
}) {
  const { rooms, reloadRooms } = useData();
  const [adding, setAdding] = useState(false);
  const [newRoom, setNewRoom] = useState('');
  const [busy, setBusy] = useState(false);

  async function addRoom() {
    const name = newRoom.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (!rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
        await api.create('rooms', { name });
        await reloadRooms();
      }
      onChange(name);
      setNewRoom('');
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  const roomNames = rooms.map((r) => r.name);
  // A custom value (e.g. a room since deleted) still needs to be selectable.
  const customRoom =
    value && value !== VIRTUAL_LOCATION && !roomNames.includes(value) ? value : null;

  if (adding) {
    return (
      <div className="inline-add">
        <input
          type="text"
          value={newRoom}
          autoFocus
          placeholder="New room name"
          onChange={(e) => setNewRoom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRoom()}
        />
        <button className="btn small" onClick={addRoom} disabled={busy || !newRoom.trim()}>
          Add
        </button>
        <button className="btn secondary small" onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— No room (e.g. Lunch) —</option>
        <option value={VIRTUAL_LOCATION}>Virtual (Microsoft Teams)</option>
        {customRoom && <option value={customRoom}>{customRoom}</option>}
        {roomNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button className="btn secondary small" type="button" onClick={() => setAdding(true)}>
        + New
      </button>
    </div>
  );
}

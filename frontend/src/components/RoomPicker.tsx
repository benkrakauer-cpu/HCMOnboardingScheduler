import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';

/**
 * Room dropdown with an inline "add new room" affordance. Newly added rooms
 * persist (they are saved to the Rooms directory) and become selected.
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

  // Ensure the current value is selectable even if it's a room no longer listed.
  const options = rooms.map((r) => r.name);
  if (value && !options.includes(value)) options.unshift(value);

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
        <option value="">— Select a room —</option>
        {options.map((name) => (
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

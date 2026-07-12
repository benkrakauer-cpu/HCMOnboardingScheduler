import type { Person } from '../lib/types';

/** Checkbox list for selecting attendees (people/distros) from the directory. */
export function AttendeeMultiSelect({
  people,
  selectedIds,
  onChange,
}: {
  people: Person[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedIds);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  if (people.length === 0) {
    return <p className="hint">No people or distros yet. Add them on the Directory screen.</p>;
  }

  return (
    <div className="multiselect">
      {people.map((p) => (
        <label className="option" key={p.id}>
          <input
            type="checkbox"
            checked={selected.has(p.id)}
            onChange={() => toggle(p.id)}
          />
          <span>{p.displayName}</span>
          <span className="email">{p.email}</span>
          <span className={`badge ${p.type}`}>{p.type}</span>
        </label>
      ))}
    </div>
  );
}

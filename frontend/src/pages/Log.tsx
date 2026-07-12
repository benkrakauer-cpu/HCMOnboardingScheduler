import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { GenerationLogEntry } from '../lib/types';

export function LogPage() {
  const [entries, setEntries] = useState<GenerationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getLog<GenerationLogEntry>()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load log'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="mb-0">Generation Log</h1>
          <p>A record of every batch of invitations you generated.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading ? (
        <div className="loading">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="panel">
          <div className="empty">Nothing generated yet.</div>
        </div>
      ) : (
        entries.map((entry) => (
          <div className="card" key={entry.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <strong>{formatTimestamp(entry.timestamp)}</strong>
              <span className="text-muted">
                {entry.patternUsed ? `Pattern: ${entry.patternUsed}` : 'Manual'}
              </span>
            </div>
            <p className="hint mt-0" style={{ marginBottom: 10 }}>
              New employee(s): {entry.newEmployeeEmails.join(', ') || '—'}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Meeting</th>
                  <th>Start</th>
                  <th>Room</th>
                </tr>
              </thead>
              <tbody>
                {entry.meetingsGenerated.map((m, i) => (
                  <tr key={i}>
                    <td>{m.title}</td>
                    <td>{m.startDateTime}</td>
                    <td>{m.room}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

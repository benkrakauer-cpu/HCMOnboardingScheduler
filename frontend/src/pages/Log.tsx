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

  function regenerateAll(entry: GenerationLogEntry) {
    const urls = entry.meetingsGenerated
      .map((m) => m.outlookUrl)
      .filter((u): u is string => Boolean(u));
    // Opened within the click gesture; the browser may ask to allow pop-ups.
    urls.forEach((u) => window.open(u, '_blank', 'noopener,noreferrer'));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="mb-0">Generation Log</h1>
          <p>A record of every batch of invitations — reopen any of them in Outlook.</p>
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
        entries.map((entry) => {
          const regenCount = entry.meetingsGenerated.filter((m) => m.outlookUrl).length;
          return (
            <div className="card" key={entry.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <strong>{formatTimestamp(entry.timestamp)}</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="text-muted">
                    {entry.patternUsed ? `Pattern: ${entry.patternUsed}` : 'Manual'}
                  </span>
                  {regenCount > 0 && (
                    <button className="btn small" onClick={() => regenerateAll(entry)}>
                      Regenerate all ({regenCount})
                    </button>
                  )}
                </div>
              </div>
              <p className="hint mt-0" style={{ marginBottom: 4 }}>
                New employee(s): {entry.newEmployeeEmails.join(', ') || '—'}
              </p>
              <p className="hint mt-0" style={{ marginBottom: 10 }}>
                Organizer: {entry.organizerUsed || '—'}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Meeting</th>
                    <th>Start</th>
                    <th>Room</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {entry.meetingsGenerated.map((m, i) => (
                    <tr key={i}>
                      <td>{m.title}</td>
                      <td>{m.startDateTime}</td>
                      <td>{m.room || <span className="text-muted">—</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {m.outlookUrl ? (
                          <a
                            className="btn secondary small"
                            href={m.outlookUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open in Outlook
                          </a>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                            not regenerable
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {regenCount > 0 && (
                <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>
                  Reopens the same pre-filled Outlook compose for each meeting. “Regenerate all” may
                  prompt your browser to allow multiple tabs.
                </p>
              )}
            </div>
          );
        })
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

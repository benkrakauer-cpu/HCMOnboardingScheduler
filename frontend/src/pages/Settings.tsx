import { useState } from 'react';
import { useData } from '../context';
import { api } from '../lib/api';
import { isValidEmail } from '../lib/validation';

export function SettingsPage() {
  const { settings, reloadSettings } = useData();
  const [email, setEmail] = useState(settings.organizerEmail);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!isValidEmail(email)) {
      return setError('Enter a valid email address.');
    }
    setError(null);
    setStatus('saving');
    try {
      await api.saveSettings(email.trim());
      await reloadSettings();
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setStatus('idle');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="mb-0">Settings</h1>
          <p>Your own email — used as the organizer on every generated invitation.</p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 520 }}>
        {error && <div className="alert error">{error}</div>}
        {status === 'saved' && <div className="alert success">Settings saved.</div>}
        <div className="field">
          <label>Organizer email</label>
          <input
            type="email"
            value={email}
            placeholder="you@nycem.nyc.gov"
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="hint">
            This appears as <span className="mono">ORGANIZER</span> in each .ics file so Outlook
            opens the invitation as a meeting you send.
          </p>
        </div>
        <button className="btn" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}

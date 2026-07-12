import { useEffect, useState } from 'react';
import { api, getToken, setToken, clearToken } from './lib/api';
import { DataProvider, useData } from './context';
import { GeneratePage } from './pages/Generate';
import { PatternsPage } from './pages/Patterns';
import { MeetingsPage } from './pages/Meetings';
import { DirectoryPage } from './pages/Directory';
import { RoomsPage } from './pages/Rooms';
import { LogPage } from './pages/Log';
import { SettingsPage } from './pages/Settings';

type PageId =
  | 'generate'
  | 'patterns'
  | 'meetings'
  | 'directory'
  | 'rooms'
  | 'log'
  | 'settings';

const NAV: { id: PageId; label: string }[] = [
  { id: 'generate', label: 'Generate' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'directory', label: 'Directory' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'log', label: 'Log' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));

  useEffect(() => {
    function onUnauthorized() {
      setAuthed(false);
    }
    window.addEventListener('hcm-unauthorized', onUnauthorized);
    return () => window.removeEventListener('hcm-unauthorized', onUnauthorized);
  }, []);

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <DataProvider>
      <Shell onSignOut={() => {
        clearToken();
        setAuthed(false);
      }} />
    </DataProvider>
  );
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token } = await api.login(password);
      setToken(token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Onboarding Scheduler</h1>
        <p className="sub">NYCEM Human Capital Management</p>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter shared password"
          />
        </div>
        <button className="btn large" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const [page, setPage] = useState<PageId>('generate');
  const data = useData();

  useEffect(() => {
    data.reloadAll().catch(() => {
      /* errors surfaced via data.error */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <button
          className="brand"
          onClick={() => setPage('generate')}
          title="Go to Generate"
        >
          Onboarding
          <br />
          Scheduler
        </button>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${page === n.id ? 'active' : ''}`}
            onClick={() => setPage(n.id)}
          >
            {n.label}
          </button>
        ))}
        <div className="spacer" />
        <button className="nav-item signout" onClick={onSignOut}>
          Sign out
        </button>
      </nav>
      <main className="main">
        {data.error && <div className="alert error">{data.error}</div>}
        {page === 'generate' && <GeneratePage />}
        {page === 'patterns' && <PatternsPage />}
        {page === 'meetings' && <MeetingsPage />}
        {page === 'directory' && <DirectoryPage />}
        {page === 'rooms' && <RoomsPage />}
        {page === 'log' && <LogPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

import { useState } from 'react';
import { OEM_DOMAIN, usernameToEmail, emailToUsername } from '../lib/email';

/**
 * Email entry with the fixed "@oem.nyc.gov" convention:
 *  - Default: the user types only the username; the suffix is shown and
 *    appended automatically.
 *  - Override: a checkbox reveals a full-address field for non-standard
 *    addresses (e.g. contractors).
 *
 * `value` is always the full resolved email; `onChange` receives the full
 * resolved email.
 */
export function OemEmailInput({
  value,
  onChange,
  onEnter,
  autoFocus,
  placeholder = 'username',
}: {
  value: string;
  onChange: (fullEmail: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  // Start in override mode if the initial value isn't an oem.nyc.gov address.
  const [override, setOverride] = useState(
    () => value.length > 0 && emailToUsername(value) === null,
  );

  function toggleOverride(checked: boolean) {
    setOverride(checked);
    if (!checked) {
      // Returning to standard mode: keep the username part if any.
      const username = emailToUsername(value);
      onChange(username ? usernameToEmail(username) : '');
    }
  }

  const username = override ? '' : emailToUsername(value) ?? '';

  return (
    <div>
      {override ? (
        <input
          type="email"
          value={value}
          autoFocus={autoFocus}
          placeholder="full.address@contractor.com"
          onChange={(e) => onChange(e.target.value.trim())}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <input
            type="text"
            value={username}
            autoFocus={autoFocus}
            placeholder={placeholder}
            style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            onChange={(e) => {
              const u = e.target.value.replace(/\s+/g, '');
              onChange(u ? usernameToEmail(u) : '');
            }}
            onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 11px',
              border: '1px solid var(--border)',
              borderLeft: 'none',
              borderTopRightRadius: 6,
              borderBottomRightRadius: 6,
              background: '#eef1f6',
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
              fontSize: '0.9rem',
            }}
          >
            @{OEM_DOMAIN}
          </span>
        </div>
      )}
      <label
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          marginTop: 6,
          fontWeight: 400,
          fontSize: '0.82rem',
          color: 'var(--muted)',
        }}
      >
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={override}
          onChange={(e) => toggleOverride(e.target.checked)}
        />
        Use a different email domain (override)
      </label>
    </div>
  );
}

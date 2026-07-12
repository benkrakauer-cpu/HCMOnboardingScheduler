// The standard NYCEM/OEM email domain. New-employee and organizer addresses
// default to <username>@oem.nyc.gov; a per-entry override allows any full
// address (e.g. contractors).
export const OEM_DOMAIN = 'oem.nyc.gov';

/** Build a full address from a bare username using the fixed OEM suffix. */
export function usernameToEmail(username: string): string {
  return `${username.trim()}@${OEM_DOMAIN}`;
}

/**
 * If the given full email uses the OEM domain, return the bare username part;
 * otherwise return null (meaning it's a custom/override address).
 */
export function emailToUsername(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 0) return email; // no domain yet — treat whole thing as username
  const domain = email.slice(at + 1).toLowerCase();
  return domain === OEM_DOMAIN ? email.slice(0, at) : null;
}

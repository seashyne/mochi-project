// Session cookie for the browser client.
//
// The API still accepts `Authorization: Bearer`, which is what native and server
// callers use. The cookie is for the web app: an httpOnly token means the session is
// not readable from JavaScript, so an XSS bug cannot exfiltrate it.
//
// Cookie auth brings CSRF with it. A cross-site form can trigger a POST with the
// cookie attached, so unsafe methods additionally require a header a form cannot
// set; see `requiresCsrfGuard` and the auth middleware.

export const SESSION_COOKIE = 'mochi_session';
export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'mochi';

const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Parses a Cookie header into name/value pairs. Malformed pairs are ignored. */
export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}

/** The session token carried by the request cookie, if any. */
export function readSessionToken(header: string | undefined | null): string | null {
  const token = parseCookieHeader(header)[SESSION_COOKIE];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export interface SessionCookieOptions {
  maxAgeSeconds?: number;
  /** Defaults to true; only a local http dev server would turn it off. */
  secure?: boolean;
}

export function buildSessionCookie(token: string, options: SessionCookieOptions = {}): string {
  const maxAge = Math.max(0, Math.floor(options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS));
  const secure = options.secure ?? true;
  // SameSite=Lax keeps the cookie off cross-site POSTs while still allowing a
  // normal top-level navigation to carry it.
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : ''
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearSessionCookie(options: SessionCookieOptions = {}): string {
  return buildSessionCookie('', { ...options, maxAgeSeconds: 0 });
}

/**
 * Methods that need the CSRF header when the session came from a cookie. GET and
 * HEAD are safe, and a Bearer request is immune because a browser does not attach
 * the header by itself.
 */
export function requiresCsrfGuard(method: string): boolean {
  const verb = String(method ?? '').toUpperCase();
  return verb !== 'GET' && verb !== 'HEAD' && verb !== 'OPTIONS';
}

/** True when the request carries the header a cross-site form cannot forge. */
export function hasCsrfHeader(header: string | undefined | null): boolean {
  return String(header ?? '').trim().toLowerCase() === CSRF_HEADER_VALUE;
}

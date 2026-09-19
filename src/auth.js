/**
 * A single shared password, exchanged for a signed cookie. This is a personal
 * tool with one user; the important thing is that nobody who finds the URL can
 * post to your accounts.
 */

const COOKIE = 'studio_session';
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

/** Constant-time compare, so the password can't be guessed a character at a time. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secretOf(env) {
  const s = env.SESSION_SECRET || env.APP_PASSWORD;
  if (!s) throw new Error('APP_PASSWORD is not set. Run: npx wrangler secret put APP_PASSWORD');
  return s;
}

export async function makeSession(env) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `v1.${exp}`;
  return `${payload}.${await hmac(secretOf(env), payload)}`;
}

export async function isValidSession(env, token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = await hmac(secretOf(env), `v1.${parts[1]}`);
  return safeEqual(expected, parts[2]);
}

export function readCookie(request, name = COOKIE) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionCookie(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function authed(request, env) {
  return isValidSession(env, readCookie(request));
}

export function checkPassword(env, given) {
  const want = env.APP_PASSWORD;
  if (!want) throw new Error('APP_PASSWORD is not set. Run: npx wrangler secret put APP_PASSWORD');
  return safeEqual(String(given || ''), String(want));
}

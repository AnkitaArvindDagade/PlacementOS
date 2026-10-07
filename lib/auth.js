import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const cookieName = 'placement_session';
const sign = (value) => createHmac('sha256', process.env.SESSION_SECRET || '').update(value).digest('hex');

export function makeSession() {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not configured');
  const payload = Buffer.from(JSON.stringify({ sub: 'owner', exp: Date.now() + 1000 * 60 * 60 * 24 * 30 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export async function isSignedIn() {
  if (!process.env.AUTH_PASSWORD || !process.env.SESSION_SECRET) return false;
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

export async function requireAuth() {
  if (!(await isSignedIn())) throw new Error('Unauthorized');
}

export async function authCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 };
}

export async function verifyPassword(input) {
  const expected = process.env.AUTH_PASSWORD || '';
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(expected);
  return !!expected && a.length === b.length && timingSafeEqual(a, b);
}

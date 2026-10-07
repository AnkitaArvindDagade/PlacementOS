import { NextResponse } from 'next/server';
import { authCookieOptions, isSignedIn, makeSession, verifyPassword } from '../../../lib/auth';

export async function GET() {
  return NextResponse.json({ signedIn: await isSignedIn(), configured: !!(process.env.AUTH_PASSWORD && process.env.SESSION_SECRET) });
}

export async function POST(req) {
  const b = await req.json();
  if (!(await verifyPassword(b.password))) return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  const response = NextResponse.json({ signedIn: true });
  response.cookies.set('placement_session', makeSession(), await authCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ signedIn: false });
  response.cookies.set('placement_session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}

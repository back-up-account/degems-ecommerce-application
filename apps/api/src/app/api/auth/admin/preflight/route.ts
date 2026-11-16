import { NextResponse } from 'next/server';
import { hasPendingStaffPasswordReset } from '@api/lib/account-actions';
import { isStaffRole } from '@api/lib/admin-permissions';
import { recordAdminLoginFailure } from '@api/lib/admin-auth-throttle';
import { authenticatePassword, createAdminMfaChallenge } from '@api/lib/admin-login';
import { instrumentHttpHandler } from '@api/lib/http-metrics';

async function postAdminLoginPreflight(request: Request) {
  if (request.headers.get('sec-fetch-site') !== 'same-origin') {
    return NextResponse.json({ message: 'Sign-in request was rejected.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ message: 'Enter your email and password.' }, { status: 400 });
  }

  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string'
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    || email.length > 254 || password.length === 0 || password.length > 128) {
    return NextResponse.json({ message: 'Enter your email and password.' }, { status: 400 });
  }

  const user = await authenticatePassword(email, password);
  if (!user || !isStaffRole(user.role)) {
    return NextResponse.json({ message: 'Email or password is incorrect.' }, { status: 401 });
  }

  if (user.staffSetupRequired) {
    if (!user.staffSetupExpiresAt || user.staffSetupExpiresAt <= new Date()) {
      return NextResponse.json({ message: 'Email or password is incorrect.' }, { status: 401 });
    }
    return NextResponse.json({ status: 'setup' });
  }

  if (await hasPendingStaffPasswordReset(user.email)) {
    return NextResponse.json({ message: 'Email or password is incorrect.' }, { status: 401 });
  }

  if (!user.mfaSecret || !user.mfaEnabledAt) {
    await recordAdminLoginFailure(user.id);
    return NextResponse.json({ message: 'Email or password is incorrect.' }, { status: 401 });
  }

  return NextResponse.json({
    status: 'mfa',
    challenge: await createAdminMfaChallenge(user),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = instrumentHttpHandler('/api/auth/admin/preflight', 'POST', postAdminLoginPreflight);

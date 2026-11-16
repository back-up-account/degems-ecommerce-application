import { UserRole } from '@prisma/client';
import { decode, encode } from 'next-auth/jwt';
import { isStaffRole } from '@api/lib/admin-permissions';
import { isAdminLoginBlocked, recordAdminLoginFailure } from '@api/lib/admin-auth-throttle';
import { prisma } from '@api/lib/prisma';
import { verifyPassword } from '@api/lib/security';

const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$AYehHnE4EyogBoigA2xB8A$zz3Zey8hYBPRVIOoWbrutdG+57HrxbpYL88LkKN6UAw';
const ADMIN_MFA_CHALLENGE_TTL_SECONDS = 5 * 60;

export async function authenticatePassword(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  if (!email || email.length > 254 || !password || password.length > 128) {
    await verifyPassword(password.slice(0, 128), DUMMY_PASSWORD_HASH);
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password || user.disabledAt || (user.role === UserRole.CUSTOMER && !user.emailVerified)) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return null;
  }

  if (isStaffRole(user.role) && await isAdminLoginBlocked(user.id)) return null;

  if (!await verifyPassword(password, user.password)) {
    if (isStaffRole(user.role)) await recordAdminLoginFailure(user.id);
    return null;
  }

  return user;
}

export async function createAdminMfaChallenge(user: { id: string; authVersion: number }) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET must be configured for administrator sign-in.');

  return encode({
    token: {
      sub: user.id,
      authVersion: user.authVersion,
      purpose: 'admin-mfa',
    },
    secret,
    maxAge: ADMIN_MFA_CHALLENGE_TTL_SECONDS,
  });
}

export async function authenticateAdminMfaChallenge(challenge: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET must be configured for administrator sign-in.');

  let token;
  try {
    token = await decode({ token: challenge, secret });
  } catch {
    return null;
  }
  if (!token || token.purpose !== 'admin-mfa' || typeof token.sub !== 'string'
    || typeof token.authVersion !== 'number' || !Number.isInteger(token.authVersion)) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: token.sub } });
  if (!user || user.authVersion !== token.authVersion || user.disabledAt
    || !isStaffRole(user.role) || user.staffSetupRequired || !user.mfaSecret || !user.mfaEnabledAt
    || await isAdminLoginBlocked(user.id)) {
    return null;
  }

  return user;
}

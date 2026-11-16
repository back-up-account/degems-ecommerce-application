import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { isStaffRole } from '@api/lib/admin-permissions';
import { hasPendingStaffPasswordReset } from '@api/lib/account-actions';
import { clearAdminLoginFailures, recordAdminLoginFailure } from '@api/lib/admin-auth-throttle';
import { authenticateAdminMfaChallenge, authenticatePassword } from '@api/lib/admin-login';
import { consumeAdminSecondFactor } from '@api/lib/admin-mfa';
import { prisma } from '@api/lib/prisma';
import { recordCheckoutOnboarding } from '@api/lib/metrics';

export const authConfig: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt' as const,
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
    Credentials({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        mfaCode: { label: 'Administrator verification code', type: 'text' },
        adminLogin: { label: 'Administration sign-in', type: 'text' },
        adminChallenge: { label: 'Administrator sign-in challenge', type: 'text' },
      },
      async authorize(credentials) {
        const adminChallenge = typeof credentials?.adminChallenge === 'string' ? credentials.adminChallenge : '';
        if (adminChallenge) {
          if (credentials?.adminLogin !== 'true') return null;
          const user = await authenticateAdminMfaChallenge(adminChallenge);
          if (!user) return null;
          return authorizeStaff(user, credentials);
        }

        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';

        const user = await authenticatePassword(email, password);
        if (!user) return null;

        if (isStaffRole(user.role)) return authorizeStaff(user, credentials);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  pages: {
    signIn: '/account',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
        select: { disabledAt: true, role: true },
      });
      if (isStaffRole(existingUser?.role) && account?.provider !== 'credentials') return false;
      return existingUser?.disabledAt === null || existingUser === null;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role ?? 'CUSTOMER';
        const accountState = await prisma.user.findUnique({
          where: { id: user.id },
          select: { authVersion: true },
        });
        token.authVersion = accountState?.authVersion ?? 0;
        if (account?.provider === 'google') recordCheckoutOnboarding('google');
        if (account?.provider === 'credentials') recordCheckoutOnboarding('native');
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const user = token.sub
          ? await prisma.user.findUnique({
            where: { id: token.sub },
            select: {
              id: true,
              role: true,
              disabledAt: true,
              emailVerified: true,
              authVersion: true,
              mfaEnabledAt: true,
              staffSetupRequired: true,
              staffSetupExpiresAt: true,
            },
          })
          : null;
        const validStaffSetup = user?.staffSetupRequired
          && user.staffSetupExpiresAt !== null
          && user.staffSetupExpiresAt > new Date();
        const accountCanSignIn = user
          && !user.disabledAt
          && (token.authVersion ?? 0) === user.authVersion
          && (user.role === 'CUSTOMER'
            ? user.emailVerified !== null
            : validStaffSetup
              || ((user.role === 'ADMIN' || user.emailVerified !== null) && user.mfaEnabledAt !== null));
        session.user.id = accountCanSignIn ? user.id : '';
        session.user.role = accountCanSignIn ? user.role : 'CUSTOMER';
      }

      return session;
    },
  },
};

async function authorizeStaff(
  user: NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>,
  credentials: Record<string, string> | undefined,
) {
  if (user.staffSetupRequired) {
    if (credentials?.adminLogin !== 'true' || !user.staffSetupExpiresAt
      || user.staffSetupExpiresAt <= new Date()) return null;
    await clearAdminLoginFailures(user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
    };
  }

  if (await hasPendingStaffPasswordReset(user.email)) return null;
  if (!user.mfaSecret || !user.mfaEnabledAt) {
    await recordAdminLoginFailure(user.id);
    return null;
  }

  const mfaCode = typeof credentials?.mfaCode === 'string' ? credentials.mfaCode.trim() : '';
  const secondFactorValid = await consumeAdminSecondFactor({
    userId: user.id,
    encryptedSecret: user.mfaSecret,
    lastUsedStep: user.mfaLastStep,
    code: mfaCode,
  });
  if (!secondFactorValid) {
    await recordAdminLoginFailure(user.id);
    return null;
  }
  await clearAdminLoginFailures(user.id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
  };
}

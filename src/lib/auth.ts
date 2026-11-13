import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { isStaffRole } from '@/lib/admin-permissions';
import { clearAdminLoginFailures, isAdminLoginBlocked, recordAdminLoginFailure } from '@/lib/admin-auth-throttle';
import { consumeAdminSecondFactor } from '@/lib/admin-mfa';
import { prisma } from '@/lib/prisma';
import { recordCheckoutOnboarding } from '@/lib/metrics';
import { verifyPassword } from '@/lib/security';

const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$AYehHnE4EyogBoigA2xB8A$zz3Zey8hYBPRVIOoWbrutdG+57HrxbpYL88LkKN6UAw';

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
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';

        if (!email || email.length > 254 || !password || password.length > 128) {
          await verifyDummyPassword(password.slice(0, 128));
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password || user.disabledAt || (user.role === 'CUSTOMER' && !user.emailVerified)) {
          await verifyDummyPassword(password);
          return null;
        }
        if (isStaffRole(user.role) && await isAdminLoginBlocked(user.id)) return null;

        const isValid = await verifyPassword(password, user.password);

        if (!isValid) {
          if (isStaffRole(user.role)) await recordAdminLoginFailure(user.id);
          return null;
        }

        if (isStaffRole(user.role)) {
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
        }

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
            },
          })
          : null;
        const accountCanSignIn = user
          && !user.disabledAt
          && (token.authVersion ?? 0) === user.authVersion
          && (user.role !== 'CUSTOMER' || user.emailVerified !== null)
          && (!isStaffRole(user.role) || user.mfaEnabledAt !== null);
        session.user.id = accountCanSignIn ? user.id : '';
        session.user.role = accountCanSignIn ? user.role : 'CUSTOMER';
      }

      return session;
    },
  },
};

async function verifyDummyPassword(password: string) {
  await verifyPassword(password.slice(0, 128), DUMMY_PASSWORD_HASH);
}

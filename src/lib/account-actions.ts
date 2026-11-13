import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { enqueueAccountNotification } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/security';
import type { AccountRegistrationInput } from '@/lib/account-validation';

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_PREFIX = 'email-verification:';
const PASSWORD_RESET_PREFIX = 'password-reset:';

export async function registerCustomer(input: AccountRegistrationInput) {
  const identifier = `${EMAIL_VERIFICATION_PREFIX}${input.email}`;
  const now = new Date();
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existingUser) return;

  const activeToken = await prisma.verificationToken.findFirst({
    where: { identifier, expires: { gt: now } },
    select: { token: true },
  });
  if (activeToken) return;

  const rawToken = createActionToken();

  try {
    await prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existingUser) return;

      const currentToken = await transaction.verificationToken.findFirst({
        where: { identifier, expires: { gt: now } },
        select: { token: true },
      });
      if (currentToken) return;

      await transaction.pendingAccount.deleteMany({ where: { expiresAt: { lte: now } } });
      await transaction.verificationToken.deleteMany({ where: { identifier, expires: { lte: now } } });
      await transaction.pendingAccount.upsert({
        where: { email: input.email },
        create: {
          name: input.name,
          email: input.email,
          expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
        },
        update: {
          name: input.name,
          expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
        },
      });
      await transaction.verificationToken.create({
        data: {
          identifier,
          token: hashActionToken(rawToken),
          expires: new Date(now.getTime() + TOKEN_LIFETIME_MS),
        },
      });
      await enqueueAccountNotification(transaction, {
        eventType: 'account_verification',
        recipient: input.email,
        token: rawToken,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isExpectedAccountRace(error)) return;
    throw error;
  }
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { email: true, password: true, emailVerified: true, disabledAt: true, role: true },
  });
  if (!user || !user.password || user.disabledAt || (user.role === 'CUSTOMER' && !user.emailVerified)) return;

  const identifier = `${PASSWORD_RESET_PREFIX}${user.email}`;
  const now = new Date();
  const activeToken = await prisma.verificationToken.findFirst({
    where: { identifier, expires: { gt: now } },
    select: { token: true },
  });
  if (activeToken) return;

  const rawToken = createActionToken();
  try {
    await prisma.$transaction(async (transaction) => {
      const currentUser = await transaction.user.findUnique({
        where: { email: user.email },
        select: { password: true, emailVerified: true, disabledAt: true, role: true },
      });
      if (!currentUser?.password
        || currentUser.disabledAt
        || (currentUser.role === 'CUSTOMER' && !currentUser.emailVerified)) return;

      const currentToken = await transaction.verificationToken.findFirst({
        where: { identifier, expires: { gt: now } },
        select: { token: true },
      });
      if (currentToken) return;

      await transaction.verificationToken.deleteMany({ where: { identifier, expires: { lte: now } } });
      await transaction.verificationToken.create({
        data: {
          identifier,
          token: hashActionToken(rawToken),
          expires: new Date(now.getTime() + TOKEN_LIFETIME_MS),
        },
      });
      await enqueueAccountNotification(transaction, {
        eventType: 'password_reset',
        recipient: user.email,
        token: rawToken,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isExpectedAccountRace(error)) return;
    throw error;
  }
}

export async function completeCustomerRegistration(rawToken: string, password: string) {
  if (!isValidActionToken(rawToken)) return false;
  const tokenHash = hashActionToken(rawToken);
  const now = new Date();
  const record = await prisma.verificationToken.findUnique({ where: { token: tokenHash } });
  if (!record || !record.identifier.startsWith(EMAIL_VERIFICATION_PREFIX) || record.expires <= now) return false;

  const email = record.identifier.slice(EMAIL_VERIFICATION_PREFIX.length);
  const pendingAccount = await prisma.pendingAccount.findUnique({ where: { email } });
  if (!pendingAccount || pendingAccount.expiresAt <= now) return false;
  const passwordHash = await hashPassword(password);

  try {
    return await prisma.$transaction(async (transaction) => {
      const currentToken = await transaction.verificationToken.findUnique({ where: { token: tokenHash } });
      if (!currentToken || currentToken.expires <= new Date() || currentToken.identifier !== record.identifier) return false;
      const currentPendingAccount = await transaction.pendingAccount.findUnique({ where: { email } });
      if (!currentPendingAccount || currentPendingAccount.expiresAt <= new Date()) return false;

      await transaction.user.create({
        data: {
          name: currentPendingAccount.name,
          email: currentPendingAccount.email,
          password: passwordHash,
          emailVerified: new Date(),
        },
      });
      await transaction.verificationToken.deleteMany({ where: { identifier: record.identifier } });
      await transaction.pendingAccount.delete({ where: { email } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isExpectedAccountRace(error)) return false;
    throw error;
  }
}

export async function updatePassword(rawToken: string, newPassword: string) {
  if (!isValidActionToken(rawToken)) return false;
  const tokenHash = hashActionToken(rawToken);
  const now = new Date();
  const record = await prisma.verificationToken.findUnique({ where: { token: tokenHash } });
  if (!record || !record.identifier.startsWith(PASSWORD_RESET_PREFIX) || record.expires <= now) return false;

  const email = record.identifier.slice(PASSWORD_RESET_PREFIX.length);
  const currentUser = await prisma.user.findUnique({
    where: { email },
    select: { emailVerified: true, password: true, disabledAt: true, role: true },
  });
  if (!currentUser?.password
    || currentUser.disabledAt
    || (currentUser.role === 'CUSTOMER' && !currentUser.emailVerified)) return false;

  const passwordHash = await hashPassword(newPassword);
  try {
    return await prisma.$transaction(async (transaction) => {
      const currentToken = await transaction.verificationToken.findUnique({ where: { token: tokenHash } });
      if (!currentToken || currentToken.expires <= new Date() || currentToken.identifier !== record.identifier) return false;

      const updated = await transaction.user.updateMany({
        where: {
          email,
          password: currentUser.password,
          disabledAt: null,
          ...(currentUser.role === 'CUSTOMER' ? { emailVerified: { not: null } } : {}),
        },
        data: { password: passwordHash, authVersion: { increment: 1 } },
      });
      if (updated.count !== 1) return false;

      await transaction.verificationToken.deleteMany({ where: { identifier: record.identifier } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isExpectedAccountRace(error)) return false;
    throw error;
  }
}

function createActionToken() {
  return randomBytes(32).toString('base64url');
}

function hashActionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function isValidActionToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

function isExpectedAccountRace(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2002' || error.code === 'P2034');
}

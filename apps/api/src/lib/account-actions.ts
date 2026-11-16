import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { enqueueAccountNotification } from '@api/lib/notifications';
import { prisma } from '@api/lib/prisma';
import { hashPassword } from '@api/lib/security';
import type { AccountRegistrationInput } from '@api/lib/account-validation';

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_PREFIX = 'email-verification:';
const PASSWORD_RESET_PREFIX = 'password-reset:';
const STAFF_PASSWORD_RESET_PREFIX = 'staff-password-reset:';

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

export class StaffPasswordResetRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'StaffPasswordResetRequestError';
  }
}

export async function hasPendingStaffPasswordReset(email: string) {
  const pendingReset = await prisma.verificationToken.findFirst({
    where: { identifier: `${STAFF_PASSWORD_RESET_PREFIX}${email}` },
    select: { identifier: true },
  });
  return pendingReset !== null;
}

export async function forceStaffPasswordReset(userId: string, actorId: string) {
  const rawToken = createActionToken();
  const now = new Date();

  try {
    return await prisma.$transaction(async (transaction) => {
      const target = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          password: true,
          emailVerified: true,
          disabledAt: true,
          authVersion: true,
        },
      });

      if (!target || target.role === 'ADMIN' || target.role === 'CUSTOMER') {
        throw new StaffPasswordResetRequestError('Only staff accounts can be forced to reset their password.', 404);
      }
      if (target.disabledAt) {
        throw new StaffPasswordResetRequestError('Enable this staff account before requesting a password reset.', 409);
      }
      if (!target.emailVerified || !target.password) {
        throw new StaffPasswordResetRequestError(
          'Staff must have a verified email and password-based account before resetting their password.',
          409,
        );
      }

      const updated = await transaction.user.updateMany({
        where: {
          id: target.id,
          email: target.email,
          role: target.role,
          password: target.password,
          emailVerified: target.emailVerified,
          disabledAt: null,
          authVersion: target.authVersion,
        },
        data: { authVersion: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new StaffPasswordResetRequestError('The staff account changed. Reload and retry.', 409);
      }

      const identifier = `${STAFF_PASSWORD_RESET_PREFIX}${target.email}`;
      await transaction.verificationToken.deleteMany({
        where: {
          identifier: {
            in: [`${PASSWORD_RESET_PREFIX}${target.email}`, identifier],
          },
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
        eventType: 'staff_password_reset',
        recipient: target.email,
        token: rawToken,
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: 'staff.password.reset.required',
          entityType: 'User',
          entityId: target.id,
          details: { role: target.role },
        },
      });

      return target.email;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof StaffPasswordResetRequestError) throw error;
    if (isExpectedAccountRace(error)) {
      throw new StaffPasswordResetRequestError('The staff account changed. Reload and retry.', 409);
    }
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
  if (!record || record.expires <= now) return false;
  const isStaffReset = record.identifier.startsWith(STAFF_PASSWORD_RESET_PREFIX);
  const identifierPrefix = isStaffReset
    ? STAFF_PASSWORD_RESET_PREFIX
    : record.identifier.startsWith(PASSWORD_RESET_PREFIX)
      ? PASSWORD_RESET_PREFIX
      : null;
  if (!identifierPrefix) return false;

  const email = record.identifier.slice(identifierPrefix.length);
  const currentUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true, password: true, disabledAt: true, role: true },
  });
  if (!currentUser?.password
    || currentUser.disabledAt
    || (isStaffReset && currentUser.role === 'CUSTOMER')
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
          role: currentUser.role,
          disabledAt: null,
          ...(currentUser.role === 'CUSTOMER' ? { emailVerified: { not: null } } : {}),
        },
        data: { password: passwordHash, authVersion: { increment: 1 } },
      });
      if (updated.count !== 1) return false;

      await transaction.verificationToken.deleteMany({
        where: {
          identifier: {
            in: [
              `${PASSWORD_RESET_PREFIX}${email}`,
              `${STAFF_PASSWORD_RESET_PREFIX}${email}`,
            ],
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'account.password.reset.completed',
          entityType: 'User',
          entityId: currentUser.id,
          details: { role: currentUser.role },
        },
      });
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

import { randomBytes } from 'node:crypto';
import { Prisma, type UserRole } from '@prisma/client';
import {
  createAdminTotpSecret,
  createTotpUri,
  decryptAdminTotpSecret,
  encryptAdminTotpSecret,
  findValidTotpStep,
  generateAdminRecoveryCodes,
  hashAdminRecoveryCode,
} from '@api/lib/admin-mfa';
import { enqueueAccountNotification } from '@api/lib/notifications';
import { prisma } from '@api/lib/prisma';
import { hashPassword } from '@api/lib/security';

const STAFF_SETUP_LIFETIME_MS = 24 * 60 * 60 * 1000;

export class StaffProvisioningError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'StaffProvisioningError';
  }
}

export function createStaffTemporaryPassword() {
  return randomBytes(32).toString('base64url');
}

export async function createStaffAccount(input: {
  name: string;
  email: string;
  role: Exclude<UserRole, 'ADMIN' | 'CUSTOMER'>;
  temporaryPassword: string;
  actorId: string;
}) {
  const passwordHash = await hashPassword(input.temporaryPassword);
  const expiresAt = new Date(Date.now() + STAFF_SETUP_LIFETIME_MS);

  try {
    return await prisma.$transaction(async (transaction) => {
      if (await transaction.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
        throw new StaffProvisioningError('An account already exists for this email address.', 409);
      }

      const staff = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          password: passwordHash,
          staffSetupRequired: true,
          staffSetupExpiresAt: expiresAt,
        },
        select: { id: true, email: true, role: true },
      });

      await enqueueAccountNotification(transaction, {
        eventType: 'staff_invitation',
        recipient: staff.email,
        token: input.temporaryPassword,
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'staff.invitation.created',
          entityType: 'User',
          entityId: staff.id,
          details: { role: staff.role },
        },
      });

      return { id: staff.id, email: staff.email, role: staff.role, expiresAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof StaffProvisioningError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new StaffProvisioningError('An account already exists for this email address.', 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new StaffProvisioningError('The account changed at the same time. Retry the invitation.', 409);
    }
    throw error;
  }
}

export async function resendStaffInvitation(userId: string, actorId: string, temporaryPassword: string) {
  const passwordHash = await hashPassword(temporaryPassword);
  const expiresAt = new Date(Date.now() + STAFF_SETUP_LIFETIME_MS);

  try {
    return await prisma.$transaction(async (transaction) => {
      const staff = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          password: true,
          disabledAt: true,
          staffSetupRequired: true,
          authVersion: true,
        },
      });
      if (!staff || staff.role === 'ADMIN' || staff.role === 'CUSTOMER' || !staff.staffSetupRequired) {
        throw new StaffProvisioningError('This account is not awaiting staff setup.', 409);
      }
      if (staff.disabledAt) {
        throw new StaffProvisioningError('Enable this staff account before resending its invitation.', 409);
      }

      const updated = await transaction.user.updateMany({
        where: {
          id: staff.id,
          role: staff.role,
          password: staff.password,
          disabledAt: null,
          staffSetupRequired: true,
          authVersion: staff.authVersion,
        },
        data: {
          password: passwordHash,
          staffSetupExpiresAt: expiresAt,
          authVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new StaffProvisioningError('The staff account changed. Reload and retry.', 409);
      }

      await transaction.notification.deleteMany({
        where: { recipient: staff.email, eventType: 'staff_invitation', status: 'queued' },
      });
      await enqueueAccountNotification(transaction, {
        eventType: 'staff_invitation',
        recipient: staff.email,
        token: temporaryPassword,
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: 'staff.invitation.resent',
          entityType: 'User',
          entityId: staff.id,
          details: { role: staff.role },
        },
      });

      return { email: staff.email, expiresAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof StaffProvisioningError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new StaffProvisioningError('The account changed at the same time. Retry the invitation.', 409);
    }
    throw error;
  }
}

export async function beginStaffMfaEnrollment(userId: string) {
  const now = new Date();
  const staff = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      disabledAt: true,
      staffSetupRequired: true,
      staffSetupExpiresAt: true,
      mfaEnabledAt: true,
      authVersion: true,
    },
  });
  if (!staff || staff.role === 'ADMIN' || staff.role === 'CUSTOMER' || !staff.staffSetupRequired) {
    throw new StaffProvisioningError('This account is not awaiting staff setup.', 409);
  }
  if (staff.disabledAt || !staff.staffSetupExpiresAt || staff.staffSetupExpiresAt <= now) {
    throw new StaffProvisioningError('This invitation has expired or the account is disabled. Contact your administrator.', 409);
  }
  if (staff.mfaEnabledAt) {
    throw new StaffProvisioningError('MFA is already enabled for this account.', 409);
  }

  const secret = createAdminTotpSecret();
  let encryptedSecret: string;
  try {
    encryptedSecret = encryptAdminTotpSecret(secret);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ADMIN_MFA_ENCRYPTION_KEY')) {
      throw new StaffProvisioningError('MFA encryption is unavailable. Contact your administrator.', 503);
    }
    throw error;
  }
  const recoveryCodes = generateAdminRecoveryCodes();
  await prisma.$transaction(async (transaction) => {
    const saved = await transaction.user.updateMany({
      where: {
        id: staff.id,
        role: staff.role,
        disabledAt: null,
        staffSetupRequired: true,
        staffSetupExpiresAt: { gt: now },
        mfaEnabledAt: null,
        authVersion: staff.authVersion,
      },
      data: { mfaSecret: encryptedSecret, mfaLastStep: null },
    });
    if (saved.count !== 1) {
      throw new StaffProvisioningError('The staff account changed. Reload and retry setup.', 409);
    }

    await transaction.adminRecoveryCode.deleteMany({ where: { userId: staff.id } });
    await transaction.adminRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        userId: staff.id,
        tokenHash: hashAdminRecoveryCode(code),
      })),
    });
  });

  return { uri: createTotpUri(staff.email, secret), recoveryCodes };
}

export async function completeStaffOnboarding(input: {
  userId: string;
  password: string;
  mfaCode: string;
}) {
  const now = new Date();
  const staff = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      role: true,
      password: true,
      disabledAt: true,
      staffSetupRequired: true,
      staffSetupExpiresAt: true,
      authVersion: true,
      mfaSecret: true,
      mfaLastStep: true,
      mfaEnabledAt: true,
    },
  });
  if (!staff || staff.role === 'ADMIN' || staff.role === 'CUSTOMER' || !staff.staffSetupRequired) {
    throw new StaffProvisioningError('This account is not awaiting staff setup.', 409);
  }
  if (staff.disabledAt || !staff.staffSetupExpiresAt || staff.staffSetupExpiresAt <= now) {
    throw new StaffProvisioningError('This invitation has expired or the account is disabled. Contact your administrator.', 409);
  }
  if (!staff.mfaSecret || staff.mfaEnabledAt) {
    throw new StaffProvisioningError('Start authenticator setup before completing staff onboarding.', 409);
  }

  let matchedStep: number | null;
  try {
    matchedStep = findValidTotpStep(
      decryptAdminTotpSecret(staff.mfaSecret),
      input.mfaCode,
      now.getTime(),
      staff.mfaLastStep,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('ADMIN_MFA_ENCRYPTION_KEY')) {
      throw new StaffProvisioningError('MFA encryption is unavailable. Contact your administrator.', 503);
    }
    throw error;
  }
  if (matchedStep === null) {
    throw new StaffProvisioningError('The authenticator code is invalid or already used.', 400);
  }

  const passwordHash = await hashPassword(input.password);
  try {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: {
          id: staff.id,
          role: staff.role,
          password: staff.password,
          disabledAt: null,
          staffSetupRequired: true,
          staffSetupExpiresAt: { gt: now },
          authVersion: staff.authVersion,
          mfaSecret: staff.mfaSecret,
          mfaEnabledAt: null,
        },
        data: {
          password: passwordHash,
          emailVerified: now,
          staffSetupRequired: false,
          staffSetupExpiresAt: null,
          mfaEnabledAt: now,
          mfaLastStep: matchedStep,
          authVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new StaffProvisioningError('The staff account changed. Retry setup.', 409);
      }

      await transaction.auditLog.create({
        data: {
          actorId: staff.id,
          action: 'staff.onboarding.completed',
          entityType: 'User',
          entityId: staff.id,
          details: { role: staff.role },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof StaffProvisioningError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new StaffProvisioningError('The staff account changed at the same time. Retry setup.', 409);
    }
    throw error;
  }
}


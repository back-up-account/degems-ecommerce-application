import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@api/lib/admin-api-auth';
import { STAFF_ROLES, getStaffRoleLabel } from '@api/lib/admin-permissions';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import {
  createAdminTotpSecret,
  createTotpUri,
  encryptAdminTotpSecret,
  generateAdminRecoveryCodes,
  hashAdminRecoveryCode,
} from '@api/lib/admin-mfa';
import { prisma } from '@api/lib/prisma';
import { createStaffAccount, createStaffTemporaryPassword, StaffProvisioningError } from '@api/lib/staff-onboarding';
import { isAccountEmailDeliveryConfigured } from '@api/lib/notifications';

const requestSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['CUSTOMER', ...STAFF_ROLES]),
  resetMfa: z.boolean().optional().default(false),
}).strict();
const createStaffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  role: z.enum(STAFF_ROLES),
}).strict();

async function getStaff() {
  const authorization = await authorizeAdminPermission('staff.manage');
  if ('response' in authorization) return authorization.response;

  const users = await prisma.user.findMany({
    where: { role: { in: ['CUSTOMER', ...STAFF_ROLES] } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified: true,
      password: true,
      disabledAt: true,
      mfaEnabledAt: true,
      staffSetupRequired: true,
      staffSetupExpiresAt: true,
    },
  });

  return NextResponse.json({
    users: users.map(({ password, ...user }) => ({
      ...user,
      roleLabel: getStaffRoleLabel(user.role),
      emailVerified: user.emailVerified !== null,
      passwordBased: Boolean(password),
    })),
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

async function postStaff(request: Request) {
  const authorization = await authorizeAdminPermission('staff.manage');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = createStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Enter a valid name, email address, and staff role.' }, { status: 400 });
  }
  if (!isAccountEmailDeliveryConfigured()) {
    return NextResponse.json({ message: 'Configure account email delivery before inviting staff.' }, { status: 503 });
  }
  try {
    encryptAdminTotpSecret(createAdminTotpSecret());
  } catch (error) {
    if (error instanceof Error && error.message.includes('ADMIN_MFA_ENCRYPTION_KEY')) {
      return NextResponse.json(
        { message: 'Staff setup cannot be enabled until MFA encryption is configured.' },
        { status: 503 },
      );
    }
    throw error;
  }

  try {
    const temporaryPassword = createStaffTemporaryPassword();
    const staff = await createStaffAccount({
      ...parsed.data,
      temporaryPassword,
      actorId: authorization.userId,
    });
    return NextResponse.json({
      message: `Invitation email queued for ${staff.email}. Staff must change the temporary password and enroll MFA before accessing admin tools.`,
    }, { status: 201, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    if (error instanceof StaffProvisioningError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}

async function patchStaffRole(request: Request) {
  const authorization = await authorizeAdminPermission('staff.manage');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Choose a valid staff account and role.' }, { status: 400 });
  }
  if (parsed.data.userId === authorization.userId) {
    return NextResponse.json({ message: 'You cannot change your own owner role.' }, { status: 409 });
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      email: true,
      role: true,
      emailVerified: true,
      disabledAt: true,
      password: true,
      mfaSecret: true,
      mfaEnabledAt: true,
      staffSetupRequired: true,
      staffSetupExpiresAt: true,
    },
  });
  if (!target || target.role === 'ADMIN') {
    return NextResponse.json({ message: 'Only customer and staff accounts can be managed here.' }, { status: 404 });
  }
  if (target.disabledAt && parsed.data.role !== 'CUSTOMER') {
    return NextResponse.json({ message: 'Enable the account before assigning a staff role.' }, { status: 409 });
  }
  if (parsed.data.role !== 'CUSTOMER'
    && (!target.emailVerified || !target.password)
    && !target.staffSetupRequired) {
    return NextResponse.json(
      { message: 'Staff must have a verified email and password-based account before role assignment.' },
      { status: 409 },
    );
  }
  if (target.role === parsed.data.role && !parsed.data.resetMfa) {
    return NextResponse.json({ unchanged: true, role: target.role });
  }
  if (parsed.data.resetMfa && parsed.data.role === 'CUSTOMER') {
    return NextResponse.json({ message: 'MFA can only be reset for a staff account.' }, { status: 400 });
  }
  if (parsed.data.resetMfa && target.staffSetupRequired) {
    return NextResponse.json({ message: 'MFA is enrolled by the staff member during first-login setup.' }, { status: 409 });
  }

  let enrollment: { encryptedSecret: string; uri: string; recoveryCodes: string[] } | null = null;
  if (parsed.data.role !== 'CUSTOMER' && !target.staffSetupRequired) {
    try {
      const secret = createAdminTotpSecret();
      enrollment = {
        encryptedSecret: encryptAdminTotpSecret(secret),
        uri: createTotpUri(target.email, secret),
        recoveryCodes: generateAdminRecoveryCodes(),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ADMIN_MFA_ENCRYPTION_KEY')) {
        return NextResponse.json(
          { message: 'Staff access cannot be assigned until MFA encryption is configured.' },
          { status: 503 },
        );
      }
      throw error;
    }
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: {
          id: target.id,
          role: target.role,
          disabledAt: target.disabledAt,
          emailVerified: target.emailVerified,
          password: target.password,
        },
        data: {
          role: parsed.data.role,
          mfaSecret: parsed.data.role === 'CUSTOMER'
            ? null
            : target.staffSetupRequired
              ? target.mfaSecret
              : enrollment?.encryptedSecret ?? null,
          mfaEnabledAt: parsed.data.role === 'CUSTOMER'
            ? null
            : target.staffSetupRequired
              ? target.mfaEnabledAt
              : enrollment
                ? new Date()
                : null,
          mfaLastStep: null,
          authVersion: { increment: 1 },
          staffSetupRequired: parsed.data.role === 'CUSTOMER' ? false : target.staffSetupRequired,
          staffSetupExpiresAt: parsed.data.role === 'CUSTOMER' ? null : target.staffSetupExpiresAt,
        },
      });
      if (updated.count !== 1) throw new StaffRoleUpdateConflictError();

      await transaction.adminRecoveryCode.deleteMany({ where: { userId: target.id } });
      await transaction.adminAuthThrottle.deleteMany({ where: { userId: target.id } });
      if (parsed.data.role === 'CUSTOMER') {
        await transaction.verificationToken.deleteMany({
          where: { identifier: `staff-password-reset:${target.email}` },
        });
        await transaction.notification.deleteMany({
          where: { recipient: target.email, eventType: 'staff_invitation', status: 'queued' },
        });
      }
      if (enrollment) {
        await transaction.adminRecoveryCode.createMany({
          data: enrollment.recoveryCodes.map((code) => ({
            userId: target.id,
            tokenHash: hashAdminRecoveryCode(code),
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          actorId: authorization.userId,
          action: parsed.data.resetMfa && target.role === parsed.data.role
            ? 'staff.mfa.reset'
            : parsed.data.role === 'CUSTOMER'
              ? 'staff.role.revoked'
              : 'staff.role.assigned',
          entityType: 'User',
          entityId: target.id,
          details: { previousRole: target.role, role: parsed.data.role, mfaReset: parsed.data.resetMfa },
        },
      });
    });
  } catch (error) {
    if (error instanceof StaffRoleUpdateConflictError
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')) {
      return NextResponse.json({ message: 'The account changed at the same time. Reload and retry.' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({
    role: parsed.data.role,
    mfaReset: parsed.data.resetMfa,
    ...(enrollment
      ? {
        mfaEnrollment: {
          uri: enrollment.uri,
          recoveryCodes: enrollment.recoveryCodes,
        },
      }
      : {}),
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

class StaffRoleUpdateConflictError extends Error {}

export const GET = instrumentHttpHandler('/api/admin/staff', 'GET', getStaff);
export const POST = instrumentHttpHandler('/api/admin/staff', 'POST', postStaff);
export const PATCH = instrumentHttpHandler('/api/admin/staff', 'PATCH', patchStaffRole);

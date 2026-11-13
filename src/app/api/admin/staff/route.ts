import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@/lib/admin-api-auth';
import { STAFF_ROLES, getStaffRoleLabel } from '@/lib/admin-permissions';
import { instrumentHttpHandler } from '@/lib/http-metrics';
import {
  createAdminTotpSecret,
  createTotpUri,
  encryptAdminTotpSecret,
  generateAdminRecoveryCodes,
  hashAdminRecoveryCode,
} from '@/lib/admin-mfa';
import { prisma } from '@/lib/prisma';

const requestSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['CUSTOMER', ...STAFF_ROLES]),
  resetMfa: z.boolean().optional().default(false),
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
      disabledAt: true,
      mfaEnabledAt: true,
    },
  });

  return NextResponse.json({
    users: users.map((user) => ({
      ...user,
      roleLabel: getStaffRoleLabel(user.role),
      emailVerified: user.emailVerified !== null,
    })),
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
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
    select: { id: true, email: true, role: true, emailVerified: true, disabledAt: true, password: true },
  });
  if (!target || target.role === 'ADMIN') {
    return NextResponse.json({ message: 'Only customer and staff accounts can be managed here.' }, { status: 404 });
  }
  if (target.disabledAt && parsed.data.role !== 'CUSTOMER') {
    return NextResponse.json({ message: 'Enable the account before assigning a staff role.' }, { status: 409 });
  }
  if (parsed.data.role !== 'CUSTOMER' && (!target.emailVerified || !target.password)) {
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

  let enrollment: { encryptedSecret: string; uri: string; recoveryCodes: string[] } | null = null;
  if (parsed.data.role !== 'CUSTOMER') {
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
          mfaSecret: enrollment?.encryptedSecret ?? null,
          mfaEnabledAt: enrollment ? new Date() : null,
          mfaLastStep: null,
          authVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaffRoleUpdateConflictError();

      await transaction.adminRecoveryCode.deleteMany({ where: { userId: target.id } });
      await transaction.adminAuthThrottle.deleteMany({ where: { userId: target.id } });
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
export const PATCH = instrumentHttpHandler('/api/admin/staff', 'PATCH', patchStaffRole);

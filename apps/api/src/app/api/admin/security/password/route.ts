import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { adminPasswordChangeSchema } from '@api/lib/account-validation';
import { authConfig } from '@api/lib/auth';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { hashPassword, verifyPassword } from '@api/lib/security';
import { prisma } from '@api/lib/prisma';

class CredentialConflictError extends Error {}

async function postAdminPasswordChange(request: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user.id) {
    return NextResponse.json({ message: 'Administrator sign-in is required.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = adminPasswordChangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Check the current password and new password fields.', errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, role: true, password: true, disabledAt: true, authVersion: true, mfaEnabledAt: true },
  });
  if (admin?.role !== 'ADMIN' || admin.disabledAt || !admin.mfaEnabledAt || !admin.password) {
    return NextResponse.json({ message: 'Administrator security settings are unavailable.' }, { status: 403 });
  }
  if (!(await verifyPassword(parsed.data.currentPassword, admin.password))) {
    return NextResponse.json({ message: 'Current password is incorrect.' }, { status: 400 });
  }
  if (await verifyPassword(parsed.data.password, admin.password)) {
    return NextResponse.json({ message: 'Choose a new password that is different from the current password.' }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: {
          id: admin.id,
          role: 'ADMIN',
          password: admin.password,
          authVersion: admin.authVersion,
          disabledAt: null,
          mfaEnabledAt: { not: null },
        },
        data: { password: passwordHash, authVersion: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new CredentialConflictError('Administrator credentials changed during password rotation.');
      }

      await transaction.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'admin.password.changed',
          entityType: 'User',
          entityId: admin.id,
        },
      });
      await transaction.verificationToken.deleteMany({
        where: { identifier: `password-reset:${admin.email}` },
      });
    });
  } catch (error) {
    if (error instanceof CredentialConflictError
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')) {
      return NextResponse.json({ message: 'Credentials changed at the same time. Sign in again and retry.' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ message: 'Password changed. Sign in again with your new password and MFA code.' });
}

export const POST = instrumentHttpHandler('/api/admin/security/password', 'POST', postAdminPasswordChange);

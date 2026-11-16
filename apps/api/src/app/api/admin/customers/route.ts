import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authConfig } from '@api/lib/auth';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { prisma } from '@api/lib/prisma';

const requestSchema = z.object({
  userId: z.string().uuid(),
  disabled: z.boolean(),
}).strict();

async function patchCustomer(request: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user.id) {
    return NextResponse.json({ message: 'Sign in is required.' }, { status: 401 });
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (admin?.role !== 'ADMIN') {
    return NextResponse.json({ message: 'Administrator access is required.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Choose a customer and a valid account status.' }, { status: 400 });
  }
  if (parsed.data.userId === session.user.id) {
    return NextResponse.json({ message: 'Administrators cannot disable their own account here.' }, { status: 409 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!existing) return NextResponse.json({ message: 'Customer not found.' }, { status: 404 });
  if (existing.role !== 'CUSTOMER') {
    return NextResponse.json({ message: 'Only customer accounts can be changed here.' }, { status: 409 });
  }

  const disabledAt = parsed.data.disabled ? (existing.disabledAt ?? new Date()) : null;
  if (existing.disabledAt?.getTime() === disabledAt?.getTime()) {
    return NextResponse.json({ disabled: Boolean(disabledAt), unchanged: true });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: { id: existing.id, role: 'CUSTOMER', disabledAt: existing.disabledAt },
        data: { disabledAt },
      });
      if (updated.count !== 1) {
        throw new CustomerStatusConflictError();
      }

      await transaction.auditLog.create({
        data: {
          actorId: session.user.id,
          action: parsed.data.disabled ? 'customer.account.disabled' : 'customer.account.enabled',
          entityType: 'User',
          entityId: existing.id,
          details: { disabled: parsed.data.disabled },
        },
      });
    });
  } catch (error) {
    if (error instanceof CustomerStatusConflictError
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')) {
      return NextResponse.json({ message: 'Customer account changed at the same time. Reload and try again.' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ disabled: Boolean(disabledAt), unchanged: false });
}

class CustomerStatusConflictError extends Error {}

export const PATCH = instrumentHttpHandler('/api/admin/customers', 'PATCH', patchCustomer);

import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth';
import { hasAdminPermission, type AdminPermission } from '@/lib/admin-permissions';
import { prisma } from '@/lib/prisma';

export async function authorizeAdminPermission(permission: AdminPermission) {
  const session = await getServerSession(authConfig);
  if (!session?.user.id) {
    return { response: NextResponse.json({ message: 'Sign in is required.' }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabledAt: true, mfaEnabledAt: true },
  });
  if (!user || user.disabledAt || !user.mfaEnabledAt || !hasAdminPermission(user.role, permission)) {
    return { response: NextResponse.json({ message: 'You do not have permission to perform this action.' }, { status: 403 }) };
  }

  return { userId: session.user.id, role: user.role };
}

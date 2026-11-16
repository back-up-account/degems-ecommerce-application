import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@api/lib/auth';
import { getAdminDashboardData } from '@api/lib/admin-dashboard-data';
import { getStaffRoleLabel, isStaffRole } from '@api/lib/admin-permissions';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { prisma } from '@api/lib/prisma';

async function getDashboard() {
  const session = await getServerSession(authConfig);
  if (!session?.user.id) {
    return NextResponse.json({ message: 'Sign in is required.' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      mfaEnabledAt: true,
      disabledAt: true,
      staffSetupRequired: true,
      staffSetupExpiresAt: true,
    },
  });

  if (!user || user.disabledAt || !isStaffRole(user.role)) {
    return NextResponse.json({ message: 'You do not have access to store administration.' }, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (user.staffSetupRequired
    && user.staffSetupExpiresAt
    && user.staffSetupExpiresAt > new Date()) {
    return NextResponse.json({ setupRequired: true }, {
      status: 428,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (user.staffSetupRequired || !user.mfaEnabledAt) {
    return NextResponse.json({ message: 'Staff setup is required before accessing administration.' }, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const dashboardData = await getAdminDashboardData(user.role);
  return NextResponse.json({
    roleLabel: user.role === 'ADMIN' ? 'Store administration' : getStaffRoleLabel(user.role),
    dashboardData,
  }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' },
  });
}

export const GET = instrumentHttpHandler('/api/admin/dashboard', 'GET', getDashboard);

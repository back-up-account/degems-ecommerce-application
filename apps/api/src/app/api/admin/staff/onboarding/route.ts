import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@api/lib/auth';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { beginStaffMfaEnrollment, StaffProvisioningError } from '@api/lib/staff-onboarding';

async function postStartStaffOnboarding() {
  const session = await getServerSession(authConfig);
  if (!session?.user.id) {
    return NextResponse.json({ message: 'Sign in with your temporary password to continue.' }, { status: 401 });
  }

  try {
    const enrollment = await beginStaffMfaEnrollment(session.user.id);
    return NextResponse.json(enrollment, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    if (error instanceof StaffProvisioningError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/admin/staff/onboarding', 'POST', postStartStaffOnboarding);

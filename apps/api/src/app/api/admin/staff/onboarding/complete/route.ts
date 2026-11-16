import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@api/lib/auth';
import { staffOnboardingSchema } from '@api/lib/account-validation';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { completeStaffOnboarding, StaffProvisioningError } from '@api/lib/staff-onboarding';

async function postCompleteStaffOnboarding(request: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user.id) {
    return NextResponse.json({ message: 'Sign in with your temporary password to continue.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }
  const parsed = staffOnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Choose a valid password and enter the current six-digit authenticator code.' },
      { status: 400 },
    );
  }

  try {
    await completeStaffOnboarding({ userId: session.user.id, ...parsed.data });
    return NextResponse.json(
      { message: 'Your password and authenticator are set. Sign in again with your new password and MFA code.' },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    if (error instanceof StaffProvisioningError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = instrumentHttpHandler(
  '/api/admin/staff/onboarding/complete',
  'POST',
  postCompleteStaffOnboarding,
);

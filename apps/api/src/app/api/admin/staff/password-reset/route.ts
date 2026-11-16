import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@api/lib/admin-api-auth';
import { forceStaffPasswordReset, StaffPasswordResetRequestError } from '@api/lib/account-actions';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { isAccountEmailDeliveryConfigured } from '@api/lib/notifications';

const requestSchema = z.object({
  userId: z.string().uuid(),
}).strict();

async function postStaffPasswordReset(request: Request) {
  const authorization = await authorizeAdminPermission('staff.manage');
  if ('response' in authorization) return authorization.response;

  if (!isAccountEmailDeliveryConfigured()) {
    return NextResponse.json({ message: 'Account email is temporarily unavailable. Please try again later.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Choose a valid staff account.' }, { status: 400 });
  }

  try {
    const email = await forceStaffPasswordReset(parsed.data.userId, authorization.userId);
    return NextResponse.json({
      message: `A one-time password reset link was queued for ${email}. Existing sessions have been invalidated.`,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    if (error instanceof StaffPasswordResetRequestError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/admin/staff/password-reset', 'POST', postStaffPasswordReset);

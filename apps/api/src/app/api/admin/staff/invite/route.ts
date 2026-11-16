import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@api/lib/admin-api-auth';
import {
  createStaffTemporaryPassword,
  resendStaffInvitation,
  StaffProvisioningError,
} from '@api/lib/staff-onboarding';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { isAccountEmailDeliveryConfigured } from '@api/lib/notifications';

const requestSchema = z.object({ userId: z.string().uuid() }).strict();

async function postStaffInvitation(request: Request) {
  const authorization = await authorizeAdminPermission('staff.manage');
  if ('response' in authorization) return authorization.response;
  if (!isAccountEmailDeliveryConfigured()) {
    return NextResponse.json({ message: 'Configure account email delivery before resending staff invitations.' }, { status: 503 });
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
    const invitation = await resendStaffInvitation(
      parsed.data.userId,
      authorization.userId,
      createStaffTemporaryPassword(),
    );
    return NextResponse.json({
      message: `A new invitation email was queued for ${invitation.email}.`,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    if (error instanceof StaffProvisioningError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/admin/staff/invite', 'POST', postStaffInvitation);

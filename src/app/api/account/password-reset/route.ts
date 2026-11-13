import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/account-actions';
import { accountEmailSchema } from '@/lib/account-validation';
import { instrumentHttpHandler } from '@/lib/http-metrics';
import { isAccountEmailDeliveryConfigured } from '@/lib/notifications';

async function postPasswordResetRequest(request: Request) {
  if (!isAccountEmailDeliveryConfigured()) {
    return NextResponse.json({ message: 'Account email is temporarily unavailable. Please try again later.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = accountEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 });
  }

  await requestPasswordReset(parsed.data.email);
  return NextResponse.json({
    message: 'If an eligible account exists, password reset instructions will be sent by email. Links expire after 30 minutes.',
  }, { status: 202 });
}

export const POST = instrumentHttpHandler('/api/account/password-reset', 'POST', postPasswordResetRequest);

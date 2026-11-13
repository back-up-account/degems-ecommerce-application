import { NextResponse } from 'next/server';
import { updatePassword } from '@/lib/account-actions';
import { passwordResetSchema } from '@/lib/account-validation';
import { instrumentHttpHandler } from '@/lib/http-metrics';

async function postPasswordResetConfirmation(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = passwordResetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Choose a valid password and check that both entries match.', errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const updated = await updatePassword(parsed.data.token, parsed.data.password);
  if (!updated) {
    return NextResponse.json({ message: 'This password reset link is invalid or expired.' }, { status: 400 });
  }

  return NextResponse.json({ message: 'Password updated. You can now sign in.' });
}

export const POST = instrumentHttpHandler(
  '/api/account/password-reset/confirm',
  'POST',
  postPasswordResetConfirmation,
);

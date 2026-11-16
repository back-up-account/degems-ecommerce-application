import { NextResponse } from 'next/server';
import { completeCustomerRegistration } from '@api/lib/account-actions';
import { accountCompletionInputSchema } from '@api/lib/account-validation';
import { instrumentHttpHandler } from '@api/lib/http-metrics';

async function postVerification(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = accountCompletionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'This verification link is invalid or expired.' }, { status: 400 });
  }

  const verified = await completeCustomerRegistration(parsed.data.token, parsed.data.password);
  if (!verified) {
    return NextResponse.json({ message: 'This verification link is invalid or expired.' }, { status: 400 });
  }

  return NextResponse.json({ message: 'Email verified and account created. You can now sign in.' });
}

export const POST = instrumentHttpHandler('/api/account/verify', 'POST', postVerification);

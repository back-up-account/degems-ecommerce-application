import { NextResponse } from 'next/server';
import { accountRegistrationSchema } from '@api/lib/account-validation';
import { registerCustomer } from '@api/lib/account-actions';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { isAccountEmailDeliveryConfigured } from '@api/lib/notifications';

async function postRegistration(request: Request) {
  if (!isAccountEmailDeliveryConfigured()) {
    return NextResponse.json({ message: 'Account email is temporarily unavailable. Please try again later.' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = accountRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Check the account details and try again.', errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  await registerCustomer(parsed.data);
  return NextResponse.json({
    message: 'If this address can be registered, verification instructions will be sent by email. Links expire after 30 minutes.',
  }, { status: 202 });
}

export const POST = instrumentHttpHandler('/api/account/register', 'POST', postRegistration);

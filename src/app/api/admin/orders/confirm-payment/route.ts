import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@/lib/admin-api-auth';
import { instrumentHttpHandler } from '@/lib/http-metrics';
import { confirmOrderPayment, PaymentRequestError } from '@/lib/payments';

const requestSchema = z.object({ orderId: z.string().uuid() });

async function postConfirmOrderPayment(request: Request) {
  const authorization = await authorizeAdminPermission('payments.confirm');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'A valid order ID is required.' }, { status: 400 });
  }

  try {
    const result = await confirmOrderPayment(parsed.data.orderId, authorization.userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PaymentRequestError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json(
        { message: 'Order changed during payment verification. Reload and verify again.' },
        { status: 409 },
      );
    }
    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/admin/orders/confirm-payment', 'POST', postConfirmOrderPayment);

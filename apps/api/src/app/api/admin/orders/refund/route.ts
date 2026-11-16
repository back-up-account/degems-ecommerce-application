import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@api/lib/admin-api-auth';
import { OrderCancellationError, recordOrderRefund } from '@api/lib/order-cancellation';
import { instrumentHttpHandler } from '@api/lib/http-metrics';

const requestSchema = z.object({
  orderId: z.string().uuid(),
  refundReference: z.string().trim().min(4).max(100)
    .regex(/^[A-Za-z0-9._/-]+$/)
    .transform((value) => value.toUpperCase()),
}).strict();

async function postOrderRefund(request: Request) {
  const authorization = await authorizeAdminPermission('payments.refund');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Enter a valid order ID and bank refund reference.' }, { status: 400 });
  }

  try {
    const result = await recordOrderRefund(
      parsed.data.orderId,
      parsed.data.refundReference,
      authorization.userId,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OrderCancellationError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ message: 'That refund reference is already recorded.' }, { status: 409 });
      }
      if (error.code === 'P2034') {
        return NextResponse.json({ message: 'Refund status changed at the same time. Reload and try again.' }, { status: 409 });
      }
    }

    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/admin/orders/refund', 'POST', postOrderRefund);

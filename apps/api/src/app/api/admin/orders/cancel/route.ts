import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@api/lib/admin-api-auth';
import { cancelOrder, OrderCancellationError } from '@api/lib/order-cancellation';
import { instrumentHttpHandler } from '@api/lib/http-metrics';

const requestSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
}).strict();

async function postCancelOrder(request: Request) {
  const authorization = await authorizeAdminPermission('orders.cancel');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'A valid order ID and cancellation reason are required.' }, { status: 400 });
  }

  try {
    const result = await cancelOrder(parsed.data.orderId, parsed.data.reason, authorization.userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof OrderCancellationError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json({ message: 'Order changed during cancellation. Reload and try again.' }, { status: 409 });
    }
    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/admin/orders/cancel', 'POST', postCancelOrder);

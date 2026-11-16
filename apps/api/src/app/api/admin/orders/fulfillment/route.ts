import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@api/lib/admin-api-auth';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { advanceOrderFulfillment, FulfillmentRequestError } from '@api/lib/order-fulfillment';

const requestSchema = z.union([
  z.object({
    orderId: z.string().uuid(),
    status: z.enum(['processing', 'ready_for_dispatch', 'delivered']),
  }).strict(),
  z.object({
    orderId: z.string().uuid(),
    status: z.literal('shipped'),
    dispatch: z.object({
      provider: z.string().trim().min(2).max(100),
      reference: z.string().trim().min(3).max(100),
    }).strict(),
  }).strict(),
]);

async function patchOrderFulfillment(request: Request) {
  const authorization = await authorizeAdminPermission('orders.fulfill');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'A valid order ID and fulfillment status are required.' }, { status: 400 });
  }

  try {
    const result = await advanceOrderFulfillment(
      parsed.data.orderId,
      parsed.data.status,
      authorization.userId,
      'dispatch' in parsed.data ? parsed.data.dispatch : undefined,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FulfillmentRequestError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json(
        { message: 'Order changed during fulfillment update. Reload and try again.' },
        { status: 409 },
      );
    }
    throw error;
  }
}

export const PATCH = instrumentHttpHandler('/api/admin/orders/fulfillment', 'PATCH', patchOrderFulfillment);

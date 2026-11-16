import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBankTransferDetails } from '@api/lib/bank-transfer';
import { getCurrentCartId } from '@api/lib/cart';
import { guestCheckoutSchema } from '@api/lib/checkout-validation';
import { DeliveryZoneUnavailableError } from '@api/lib/delivery';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { createPendingOrder, OrderRequestError } from '@api/lib/orders';

const idempotencyKeySchema = z.string().uuid();

async function postCheckoutOrder(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Product database is not configured.' }, { status: 503 });
  }

  const expirySecret = process.env.ORDER_EXPIRY_SECRET;
  if (process.env.CHECKOUT_ORDERS_ENABLED !== 'true' || !expirySecret || expirySecret.length < 32) {
    return NextResponse.json(
      { message: 'Order placement is disabled until payment and reservation-expiry operations are configured.' },
      { status: 503 },
    );
  }
  if (!getBankTransferDetails()) {
    return NextResponse.json({ message: 'Bank transfer instructions are not configured.' }, { status: 503 });
  }

  const parsed = await parseCheckoutRequest(request);
  if (parsed instanceof NextResponse) return parsed;

  const idempotencyKey = idempotencyKeySchema.safeParse(request.headers.get('idempotency-key'));
  if (!idempotencyKey.success) {
    return NextResponse.json({ message: 'A valid Idempotency-Key header is required.' }, { status: 400 });
  }

  const cartId = await getCurrentCartId();
  if (!cartId) {
    return NextResponse.json({ message: 'Your cart is empty or has expired.' }, { status: 409 });
  }

  try {
    const result = await createPendingOrder({
      cartId,
      idempotencyKey: idempotencyKey.data,
      customer: parsed,
    });
    return NextResponse.json(
      { order: result.order },
      { status: result.created ? 201 : 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof OrderRequestError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    if (error instanceof DeliveryZoneUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json(
        { message: 'Inventory changed during checkout. Retry with the same Idempotency-Key.' },
        { status: 409 },
      );
    }

    throw error;
  }
}

async function parseCheckoutRequest(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = guestCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Check your contact and delivery details.', errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  return parsed.data;
}

export const POST = instrumentHttpHandler('/api/checkout/orders', 'POST', postCheckoutOrder);

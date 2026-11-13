import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { instrumentHttpHandler } from '@/lib/http-metrics';
import { expirePendingOrders } from '@/lib/orders';

async function postExpireOrders(request: Request) {
  const secret = process.env.ORDER_EXPIRY_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ message: 'Order expiry worker is not configured.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization') ?? '';
  const suppliedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expected = Buffer.from(secret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Product database is not configured.' }, { status: 503 });
  }

  const result = await expirePendingOrders();
  return NextResponse.json(result);
}

export const POST = instrumentHttpHandler('/api/internal/orders/expire', 'POST', postExpireOrders);

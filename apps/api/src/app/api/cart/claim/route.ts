import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@api/lib/auth';
import { getOrCreateCurrentCart, readCurrentCart } from '@api/lib/cart';
import { instrumentHttpHandler } from '@api/lib/http-metrics';

async function postCartClaim() {
  const session = await getServerSession(authConfig);
  if (!session?.user.id) {
    return NextResponse.json({ message: 'Sign in is required to save this cart.' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Product database is not configured.' }, { status: 503 });
  }

  await getOrCreateCurrentCart();
  return NextResponse.json(await readCurrentCart());
}

export const POST = instrumentHttpHandler('/api/cart/claim', 'POST', postCartClaim);

import { NextResponse } from 'next/server';
import { getBankTransferDetails } from '@api/lib/bank-transfer';
import { CartNotConfiguredError, readCurrentCart } from '@api/lib/cart';
import { guestCheckoutSchema } from '@api/lib/checkout-validation';
import { DeliveryZoneUnavailableError, quoteDelivery } from '@api/lib/delivery';
import { instrumentHttpHandler } from '@api/lib/http-metrics';
import { recordCheckoutOnboarding } from '@api/lib/metrics';

async function postCheckoutQuote(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Product database is not configured.' }, { status: 503 });
  }

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

  try {
    const cart = await readCurrentCart();
    if (cart.items.length === 0) {
      return NextResponse.json({ message: 'Your cart is empty.' }, { status: 409 });
    }

    if (cart.items.some((item) => !item.available)) {
      return NextResponse.json(
        { message: 'One or more products are unavailable or have insufficient stock. Review your cart and try again.' },
        { status: 409 },
      );
    }

    const delivery = await quoteDelivery(parsed.data);
    const total = cart.subtotal + delivery.deliveryFee;
    if (!Number.isSafeInteger(total) || total > 2_147_483_647) {
      return NextResponse.json({ message: 'The cart total exceeds the supported order amount.' }, { status: 400 });
    }

    const bankDetails = getBankTransferDetails();
    const orderPlacementEnabled = process.env.CHECKOUT_ORDERS_ENABLED === 'true'
      && Boolean(process.env.ORDER_EXPIRY_SECRET && process.env.ORDER_EXPIRY_SECRET.length >= 32)
      && bankDetails !== null;

    recordCheckoutOnboarding('guest');
    return NextResponse.json({
      quote: {
        customer: parsed.data,
        deliveryMethod: delivery.deliveryMethod,
        deliveryFee: delivery.deliveryFee,
        deliveryZoneName: delivery.deliveryZoneName,
        deliveryAddress: delivery.deliveryAddress,
        items: cart.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          variantName: item.variantName,
          quantity: item.quantity,
          unitPrice: item.price,
          lineTotal: item.price * item.quantity,
        })),
        subtotal: cart.subtotal,
        total,
      },
      orderCreated: false,
      orderPlacementEnabled,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof CartNotConfiguredError) {
      return NextResponse.json({ message: 'Product database is not configured.' }, { status: 503 });
    }
    if (error instanceof DeliveryZoneUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/checkout/quote', 'POST', postCheckoutQuote);

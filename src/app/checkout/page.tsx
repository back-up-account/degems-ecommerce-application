import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CartNotConfiguredError, readCurrentCart, type CartView } from '@/lib/cart';
import { GuestCheckoutForm } from '@/components/guest-checkout-form';
import { listActiveDeliveryZones, type ActiveDeliveryZone } from '@/lib/delivery';
import { formatNairaFromKobo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  let cart: CartView | null = null;
  let deliveryZones: ActiveDeliveryZone[] = [];
  let databaseConfigured = true;

  try {
    cart = await readCurrentCart();
    if (cart.items.length > 0) {
      deliveryZones = await listActiveDeliveryZones();
    }
  } catch (error) {
    if (error instanceof CartNotConfiguredError) {
      databaseConfigured = false;
    } else {
      throw error;
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Checkout</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900">Review your order</h1>
      </div>

      {!databaseConfigured ? (
        <section role="status" className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-semibold text-stone-900">Checkout is unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">The product database is not connected. Configure PostgreSQL using the README runbook before using the cart or checkout.</p>
        </section>
      ) : cart?.items.length === 0 ? (
        <section className="rounded-3xl border border-stone-200 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold text-stone-900">Your cart is empty</h2>
          <p className="mt-2 text-sm text-stone-600">Add a product to your cart before reviewing an order.</p>
          <Link href="/products" className="mt-6 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700">
            <ArrowLeft className="h-4 w-4" />
            Browse products
          </Link>
        </section>
      ) : cart ? (
        <>
          <section aria-label="Cart items" className="divide-y divide-stone-200 rounded-3xl border border-stone-200 bg-white px-6">
            {cart.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-5">
                <div>
                  <Link href={`/products/${item.slug}`} className="font-medium text-stone-900 hover:underline">{item.name}</Link>
                  {item.variantName ? <p className="mt-1 text-sm text-stone-600">Option: {item.variantName}</p> : null}
                  <p className="mt-1 text-sm text-stone-500">Quantity: {item.quantity} · {formatNairaFromKobo(item.price)} each</p>
                  {!item.available ? <p className="mt-1 text-sm text-amber-700">Availability has changed; review your cart before checkout.</p> : null}
                </div>
                <p className="shrink-0 font-medium text-stone-900">{formatNairaFromKobo(item.price * item.quantity)}</p>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-5 font-semibold text-stone-900">
              <span>Current subtotal</span>
              <span>{formatNairaFromKobo(cart.subtotal)}</span>
            </div>
          </section>

          <section role="status" className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-semibold text-stone-900">Review before placing your order</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              No order is created by reviewing this page. After validating your details, you can create an order only when the store has configured its bank instructions and reservation operations.
            </p>
          </section>
          <GuestCheckoutForm deliveryZones={deliveryZones} />
        </>
      ) : null}

      <Link href="/cart" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-stone-700 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" />
        Return to cart
      </Link>
    </main>
  );
}

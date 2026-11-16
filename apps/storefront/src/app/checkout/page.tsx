import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { GuestCheckoutForm } from '@/components/guest-checkout-form';
import { formatNairaFromKobo } from '@api/lib/utils';
import { getActiveDeliveryZones, getCart } from '@storefront/lib/catalog-api';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const [{ configured, cart }, delivery] = await Promise.all([
    getCart(),
    getActiveDeliveryZones(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Checkout</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Review your order</h1>
      {!configured || !delivery.configured ? (
        <section role="status" className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-semibold">Checkout is unavailable</h2>
          <p className="mt-2 text-sm text-stone-600">The product database or delivery options are not connected.</p>
        </section>
      ) : cart.items.length === 0 ? (
        <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-8 text-center">
          <h2 className="text-xl font-semibold">Your cart is empty</h2>
          <Link href="/products" className="mt-6 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Browse products
          </Link>
        </section>
      ) : (
        <>
          <section aria-label="Cart items" className="mt-8 divide-y divide-stone-200 rounded-3xl border border-stone-200 bg-white px-6">
            {cart.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-4 py-5">
                <div>
                  <Link href={`/products/${item.slug}`} className="font-medium">{item.name}</Link>
                  {item.variantName ? <p className="mt-1 text-sm text-stone-600">Option: {item.variantName}</p> : null}
                  <p className="mt-1 text-sm text-stone-500">Quantity: {item.quantity} · {formatNairaFromKobo(item.price)} each</p>
                </div>
                <p className="shrink-0 font-medium">{formatNairaFromKobo(item.price * item.quantity)}</p>
              </div>
            ))}
            <div className="flex justify-between py-5 font-semibold">
              <span>Current subtotal</span>
              <span>{formatNairaFromKobo(cart.subtotal)}</span>
            </div>
          </section>
          <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-semibold">Review before placing your order</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              No order is created by reviewing this page. The backend validates current prices and stock.
            </p>
          </section>
          <GuestCheckoutForm deliveryZones={delivery.zones} />
        </>
      )}
    </main>
  );
}

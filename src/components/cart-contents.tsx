'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CartView } from '@/lib/cart';
import { formatNairaFromKobo } from '@/lib/utils';

export function CartContents({ initialCart }: { initialCart: CartView }) {
  const [cart, setCart] = useState(initialCart);
  const [message, setMessage] = useState('');
  const [busyProduct, setBusyProduct] = useState<string | null>(null);

  async function changeItem(cartItemId: string, method: 'PATCH' | 'DELETE', quantity?: number) {
    setBusyProduct(cartItemId);
    setMessage('');

    try {
      const response = await fetch('/api/cart', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'DELETE' ? { cartItemId } : { cartItemId, quantity }),
      });
      const result = (await response.json()) as CartView | { message?: string };

      if (!response.ok || !('items' in result)) {
        setMessage('message' in result ? result.message ?? 'Cart update failed.' : 'Cart update failed.');
        return;
      }

      setCart(result);
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyProduct(null);
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
        <h2 className="text-2xl font-semibold text-stone-900">Your bag is empty</h2>
        <p className="mt-2 text-sm text-stone-600">Explore the DEGEMS departments to find something useful for everyday living.</p>
        <Link href="/products" className="mt-6 inline-flex rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700">
          Browse departments
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
      <section className="space-y-4">
        {cart.items.map((item) => (
          <article key={item.id} className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row">
            <Image src={item.image} alt={item.name} width={320} height={320} unoptimized className="h-32 w-full rounded-2xl object-cover sm:w-32" />
            <div className="flex w-full flex-1 flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link href={`/products/${item.slug}`} className="text-xl font-semibold text-stone-900">{item.name}</Link>
                  {item.variantName ? <p className="mt-1 text-sm text-stone-600">Option: {item.variantName}</p> : null}
                  <p className={`mt-1 text-sm ${item.available ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {item.available ? `${item.stock} in stock` : 'Currently unavailable or stock changed'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyProduct === item.id}
                  onClick={() => changeItem(item.id, 'DELETE')}
                  aria-label={`Remove ${item.name} from cart`}
                  className="rounded-full border border-stone-200 p-2 text-stone-500 transition hover:border-stone-300 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 rounded-full border border-stone-200 px-2 py-1">
                  <button
                    type="button"
                    disabled={busyProduct === item.id || item.quantity <= 1}
                    onClick={() => changeItem(item.id, 'PATCH', item.quantity - 1)}
                    aria-label={`Decrease ${item.name} quantity`}
                    className="rounded-full p-1 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-4 text-center text-sm font-medium">{item.quantity}</span>
                  <button
                    type="button"
                    disabled={busyProduct === item.id || item.quantity >= item.stock || !item.available}
                    onClick={() => changeItem(item.id, 'PATCH', item.quantity + 1)}
                    aria-label={`Increase ${item.name} quantity`}
                    className="rounded-full p-1 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xl font-semibold text-stone-900">{formatNairaFromKobo(item.price * item.quantity)}</p>
              </div>
            </div>
          </article>
        ))}
        <p role="status" aria-live="polite" className="text-sm text-red-600">{message}</p>
      </section>

      <aside className="h-fit rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-stone-900">Order summary</h2>
        <div className="space-y-3 text-sm text-stone-600">
          <div className="flex justify-between">
            <span>Subtotal ({cart.itemCount} items)</span>
            <span>{formatNairaFromKobo(cart.subtotal)}</span>
          </div>
          <p className="border-t border-stone-200 pt-3 text-xs leading-5 text-stone-500">
            Delivery fees and final payable amounts will be calculated by the server when checkout is implemented.
          </p>
        </div>
        <Link href="/checkout" className="mt-6 block w-full rounded-full bg-stone-900 px-5 py-3 text-center text-sm font-medium text-white hover:bg-stone-700">
          Continue to checkout review
        </Link>
      </aside>
    </div>
  );
}

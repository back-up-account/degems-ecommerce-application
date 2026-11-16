'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatNairaFromKobo } from '@api/lib/utils';
import { publishCartUpdate } from '@api/lib/cart-events';

export function AddToCartButton({
  productId,
  available,
  stock,
  variants,
}: {
  productId: string;
  available: boolean;
  stock: number;
  variants: Array<{ id: string; name: string; price: number; stock: number }>;
}) {
  const [message, setMessage] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
  const maxQuantity = selectedVariant?.stock ?? (variants.length > 0 ? 0 : stock);
  const canAdd = maxQuantity > 0 && (variants.length > 0 || available);

  async function addToCart() {
    setIsAdding(true);
    setMessage('');
    setAddedToCart(false);

    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          quantity,
          ...(selectedVariant ? { variantId: selectedVariant.id } : {}),
        }),
      });
      const result = (await response.json()) as { message?: string; itemCount?: number };

      if (!response.ok) {
        setMessage(result.message ?? 'Could not add this product.');
        return;
      }

      if (typeof result.itemCount !== 'number' || !Number.isSafeInteger(result.itemCount)) {
        setMessage('The cart could not be refreshed. Open your cart to check the latest items.');
        return;
      }

      publishCartUpdate(result.itemCount);
      setAddedToCart(true);
      setMessage(`Added ${quantity} ${quantity === 1 ? 'item' : 'items'} to your cart.`);
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      {variants.length > 0 ? (
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Choose an option</span>
          <select
            value={selectedVariantId}
            onChange={(event) => {
              setSelectedVariantId(event.target.value);
              setQuantity(1);
              setMessage('');
              setAddedToCart(false);
            }}
            className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900"
          >
            <option value="">Select a variant</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id} disabled={variant.stock <= 0}>
                {`${variant.name} — ${formatNairaFromKobo(variant.price)} — ${variant.stock > 0 ? `${variant.stock} available` : 'out of stock'}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
        <div>
          <label htmlFor="product-quantity" className="mb-2 block text-sm font-medium text-stone-700">
            Quantity{maxQuantity > 0 ? ` · ${maxQuantity} available` : ''}
          </label>
          <div className="flex w-fit items-center gap-3 rounded-full border border-stone-200 px-2 py-1">
            <button
              type="button"
              disabled={!canAdd || quantity <= 1 || isAdding}
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              aria-label="Decrease quantity"
              className="rounded-full p-2 text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">−</span>
            </button>
            <input
              id="product-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxQuantity || undefined}
              value={quantity}
              disabled={!canAdd || isAdding}
              onChange={(event) => {
                const nextQuantity = Number(event.target.value);
                if (Number.isInteger(nextQuantity) && nextQuantity >= 1 && nextQuantity <= maxQuantity) {
                  setQuantity(nextQuantity);
                }
              }}
              className="w-12 bg-transparent text-center text-sm font-medium text-stone-900 outline-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={!canAdd || quantity >= maxQuantity || isAdding}
              onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
              aria-label="Increase quantity"
              className="rounded-full p-2 text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </div>
      <button
        type="button"
        disabled={!canAdd || isAdding}
        onClick={addToCart}
        className="inline-flex w-full items-center justify-center rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!canAdd ? (variants.length > 0 && !selectedVariant ? 'Choose an available option' : 'Currently unavailable') : isAdding ? 'Adding…' : `Add ${quantity} to cart`}
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-center text-sm text-stone-600">{message}</p>
      {addedToCart ? (
        <div className="flex items-center justify-center gap-5 text-sm font-medium">
          <Link href="/products" className="text-stone-700 underline underline-offset-4 hover:text-stone-900">
            Continue shopping
          </Link>
          <Link href="/cart" className="text-stone-700 underline underline-offset-4 hover:text-stone-900">
            View cart
          </Link>
        </div>
      ) : null}
    </div>
  );
}

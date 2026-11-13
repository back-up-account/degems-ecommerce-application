'use client';

import { useState } from 'react';
import { formatNairaFromKobo } from '@/lib/utils';

export function AddToCartButton({
  productId,
  available,
  variants,
}: {
  productId: string;
  available: boolean;
  variants: Array<{ id: string; name: string; price: number; stock: number }>;
}) {
  const [message, setMessage] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
  const canAdd = variants.length > 0
    ? Boolean(selectedVariant && selectedVariant.stock > 0)
    : available;

  async function addToCart() {
    setIsAdding(true);
    setMessage('');

    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          quantity: 1,
          ...(selectedVariant ? { variantId: selectedVariant.id } : {}),
        }),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage(result.message ?? 'Could not add this product.');
        return;
      }

      setMessage('Added to your cart.');
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
              setMessage('');
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
      <button
        type="button"
        disabled={!canAdd || isAdding}
        onClick={addToCart}
        className="inline-flex w-full items-center justify-center rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!canAdd ? (variants.length > 0 ? 'Choose an available option' : 'Currently unavailable') : isAdding ? 'Adding…' : 'Add to cart'}
      </button>
      <p role="status" aria-live="polite" className="min-h-5 text-center text-sm text-stone-600">{message}</p>
    </div>
  );
}

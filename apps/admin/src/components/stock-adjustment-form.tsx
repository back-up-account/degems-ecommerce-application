'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

type StockAdjustmentProps = {
  currentStock: number;
  onCancel: () => void;
} & (
  | { productId: string; variantId?: never }
  | { variantId: string; productId?: never }
);

export function StockAdjustmentForm(props: StockAdjustmentProps) {
  const { currentStock, onCancel } = props;
  const router = useRouter();
  const [adjustment, setAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const adjustmentValue = Number(adjustment);
    if (!Number.isInteger(adjustmentValue) || adjustmentValue === 0) {
      setMessage('Enter a non-zero whole-number adjustment.');
      return;
    }

    setIsSaving(true);
    setMessage('');
    try {
      const target = 'variantId' in props
        ? { action: 'adjust_variant_stock', variantId: props.variantId }
        : { action: 'adjust_stock', productId: props.productId };
      const response = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...target,
          adjustment: adjustmentValue,
          reason: reason.trim(),
        }),
      });
      const result = (await response.json()) as { message?: string; stock?: number };
      if (!response.ok) {
        setMessage(result.message ?? 'Available stock could not be adjusted.');
        return;
      }

      setMessage(`Available stock updated to ${result.stock}.`);
      setAdjustment('');
      setReason('');
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={submitAdjustment} className="space-y-4">
      <p className="text-sm text-stone-700">Current available stock: <strong>{currentStock}</strong></p>
      <label className="block space-y-2 text-sm font-medium text-stone-700">
        <span>Adjustment in units (positive to add, negative to remove)</span>
        <input
          value={adjustment}
          onChange={(event) => setAdjustment(event.target.value)}
          type="number"
          min="-1000000"
          max="1000000"
          step="1"
          required
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900"
        />
      </label>
      <label className="block space-y-2 text-sm font-medium text-stone-700">
        <span>Reason for adjustment</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={5}
          maxLength={500}
          required
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900"
          placeholder="For example, verified delivery from supplier"
        />
      </label>
      <p className="text-xs leading-5 text-stone-500">The change applies to available stock, not units reserved for existing orders. Every adjustment is recorded in the audit log.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isSaving} className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60">
          {isSaving ? 'Updating stock…' : 'Apply adjustment'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50">
          Cancel
        </button>
        <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
      </div>
    </form>
  );
}

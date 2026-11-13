'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { ReactNode } from 'react';
import {
  guestCheckoutSchema,
  type GuestCheckoutDetails,
  type GuestCheckoutInput,
} from '@/lib/checkout-validation';
import type { ActiveDeliveryZone } from '@/lib/delivery';
import { formatNairaFromKobo } from '@/lib/utils';

type CheckoutQuote = {
  customer: GuestCheckoutDetails;
  deliveryMethod: 'pickup' | 'door_delivery';
  deliveryFee: number;
  deliveryZoneName: string | null;
  deliveryAddress: string | null;
  subtotal: number;
  total: number;
};

type QuoteResponse = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
  quote?: CheckoutQuote;
  orderCreated?: false;
  orderPlacementEnabled?: boolean;
};

type CreatedOrder = {
  reference: string;
  total: number;
  expiresAt: string;
  invoiceUrl: string;
};

export function GuestCheckoutForm({ deliveryZones }: { deliveryZones: ActiveDeliveryZone[] }) {
  const [message, setMessage] = useState('');
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [orderPlacementEnabled, setOrderPlacementEnabled] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<GuestCheckoutInput, unknown, GuestCheckoutDetails>({
    resolver: zodResolver(guestCheckoutSchema),
    defaultValues: { deliveryMethod: 'pickup' },
  });
  const deliveryMethod = useWatch({ control, name: 'deliveryMethod' }) ?? 'pickup';

  function invalidateQuote() {
    setQuote(null);
    setCreatedOrder(null);
    setOrderPlacementEnabled(false);
    setIdempotencyKey(null);
  }

  async function onSubmit(details: GuestCheckoutDetails) {
    setMessage('');
    setQuote(null);
    setCreatedOrder(null);
    setOrderPlacementEnabled(false);
    setIdempotencyKey(null);

    try {
      const response = await fetch('/api/checkout/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });
      const result = (await response.json()) as QuoteResponse;

      if (!response.ok || !result.quote || result.orderCreated !== false) {
        setMessage(result.message ?? 'Checkout details could not be validated.');
        if (result.errors) {
          for (const field of ['fullName', 'email', 'phone', 'deliveryZoneId', 'deliveryAddress'] as const) {
            const firstMessage = result.errors[field]?.[0];
            if (firstMessage) setError(field, { message: firstMessage });
          }
        }
        return;
      }

      setQuote(result.quote);
      setOrderPlacementEnabled(result.orderPlacementEnabled === true);
      setMessage('Details and current cart were validated. No order was created.');
    } catch {
      setMessage('Could not reach the server. Check your connection and try again.');
    }
  }

  async function placeOrder() {
    if (!quote || isCreatingOrder) return;
    setMessage('');
    setIsCreatingOrder(true);
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    if (!idempotencyKey) setIdempotencyKey(requestKey);

    try {
      const response = await fetch('/api/checkout/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey,
        },
        body: JSON.stringify(quote.customer),
      });
      const result = (await response.json()) as { message?: string; order?: CreatedOrder };
      if (!response.ok || !result.order) {
        setMessage(result.message ?? 'Order could not be created.');
        return;
      }

      setCreatedOrder(result.order);
      setMessage('Order created. Use the invoice to review transfer instructions.');
    } catch {
      setMessage('Could not reach the server. Retry safely; the same order key will be reused.');
    } finally {
      setIsCreatingOrder(false);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 sm:p-8">
      <h2 className="text-xl font-semibold text-stone-900">Guest details</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">No account is required. These details are validated for this review only and are not saved.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
        <Field label="Full name" error={errors.fullName?.message}>
          <input {...register('fullName', { onChange: invalidateQuote })} autoComplete="name" className={inputClass} />
        </Field>
        <Field label="Email address" error={errors.email?.message}>
          <input {...register('email', { onChange: invalidateQuote })} type="email" autoComplete="email" className={inputClass} />
        </Field>
        <Field label="Nigerian mobile number" error={errors.phone?.message}>
          <input {...register('phone', { onChange: invalidateQuote })} type="tel" autoComplete="tel" placeholder="08012345678 or +2348012345678" className={inputClass} />
        </Field>

        <div className="rounded-2xl bg-stone-50 p-4">
          <p className="text-sm font-medium text-stone-900">Delivery option</p>
          <div className="mt-3 space-y-3">
            <label className="flex items-start gap-3 text-sm text-stone-700">
              <input {...register('deliveryMethod', { onChange: invalidateQuote })} type="radio" value="pickup" className="mt-1 accent-stone-900" />
              <span><span className="font-medium text-stone-900">Free pickup</span><span className="block text-stone-600">₦0</span></span>
            </label>
            {deliveryZones.length > 0 ? (
              <label className="flex items-start gap-3 text-sm text-stone-700">
                <input {...register('deliveryMethod', { onChange: invalidateQuote })} type="radio" value="door_delivery" className="mt-1 accent-stone-900" />
                <span><span className="font-medium text-stone-900">Door delivery</span><span className="block text-stone-600">Choose a configured delivery area</span></span>
              </label>
            ) : (
              <p className="text-xs leading-5 text-stone-500">Door delivery is unavailable until DEGEMS configures a delivery area.</p>
            )}
          </div>
          {deliveryMethod === 'door_delivery' ? (
            <div className="mt-4 space-y-4 border-t border-stone-200 pt-4">
              <Field label="Delivery area" error={getFieldState('deliveryZoneId').error?.message}>
                <select {...register('deliveryZoneId', { onChange: invalidateQuote })} className={inputClass} defaultValue="">
                  <option value="" disabled>Select an area</option>
                  {deliveryZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} · {formatNairaFromKobo(zone.deliveryFee)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Delivery address" error={getFieldState('deliveryAddress').error?.message}>
                <textarea {...register('deliveryAddress', { onChange: invalidateQuote })} rows={3} maxLength={500} autoComplete="street-address" className={inputClass} />
              </Field>
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Validating details…' : 'Validate details and cart'}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
      </form>

      {quote ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-semibold text-emerald-900">Validated subtotal: {formatNairaFromKobo(quote.subtotal)}</p>
          <p className="mt-1 text-emerald-800">
            {quote.deliveryMethod === 'pickup'
              ? 'Pickup'
              : `Door delivery${quote.deliveryZoneName ? ` · ${quote.deliveryZoneName}` : ''}`}
            : {formatNairaFromKobo(quote.deliveryFee)} · Total: {formatNairaFromKobo(quote.total)}
          </p>
          <p className="mt-2 text-emerald-800">This is not an order. Stock is not reserved and no payment is requested.</p>
          <button
            type="button"
            onClick={placeOrder}
            disabled={!orderPlacementEnabled || isSubmitting || isCreatingOrder || createdOrder !== null}
            className="mt-4 rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreatingOrder ? 'Creating order…' : 'Create order and invoice'}
          </button>
          {!orderPlacementEnabled ? <p className="mt-2 text-xs text-stone-600">Order placement is disabled until bank instructions and reservation expiry operations are configured.</p> : null}
          {createdOrder ? (
            <div className="mt-4 rounded-2xl bg-white p-4">
              <p className="font-semibold text-stone-900">{createdOrder.reference} · {formatNairaFromKobo(createdOrder.total)}</p>
              <p className="mt-1 text-stone-600">Reserved until {new Date(createdOrder.expiresAt).toLocaleString('en-NG')}.</p>
              <Link href={createdOrder.invoiceUrl} className="mt-3 inline-flex font-medium text-stone-900 underline">Open secure invoice</Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium text-stone-700">
      <span>{label}</span>
      {children}
      {error ? <span className="block text-xs font-normal text-red-600">{error}</span> : null}
    </label>
  );
}

const inputClass = 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900';

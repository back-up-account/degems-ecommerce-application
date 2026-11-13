'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatNairaFromKobo } from '@/lib/utils';
import { getFulfillmentAction } from '@/lib/order-fulfillment-status';

export type AdminOrder = {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  customerName: string | null;
  customerEmail: string | null;
  deliveryMethod: string | null;
  deliveryFee: number;
  deliveryZoneName: string | null;
  deliveryAddress: string | null;
  dispatchProvider: string | null;
  dispatchReference: string | null;
  cancellationReason: string | null;
  payment: {
    status: string;
    reference?: string;
    bankTransferReference?: string | null;
    refundReference?: string | null;
  } | null;
  items: Array<{ id: string; name: string; variantName: string | null; quantity: number; unitPrice: number }>;
};

export function AdminOrderPayments({
  orders,
  canFulfill = true,
  canCancel = true,
  canManagePayments = true,
  canViewOrderValues = true,
  canViewDeliveryAddress = true,
}: {
  orders: AdminOrder[];
  canFulfill?: boolean;
  canCancel?: boolean;
  canManagePayments?: boolean;
  canViewOrderValues?: boolean;
  canViewDeliveryAddress?: boolean;
}) {
  const router = useRouter();
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [cancelFormOrder, setCancelFormOrder] = useState<string | null>(null);
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [refundReferences, setRefundReferences] = useState<Record<string, string>>({});
  const [dispatchDetails, setDispatchDetails] = useState<Record<string, { provider: string; reference: string }>>({});

  async function confirmPayment(orderId: string) {
    setBusyOrder(orderId);
    setMessage('');
    try {
      const response = await fetch('/api/admin/orders/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const result = (await response.json()) as { message?: string; alreadyConfirmed?: boolean };
      if (!response.ok) {
        setMessage(result.message ?? 'Payment could not be confirmed.');
        return;
      }

      setMessage(result.alreadyConfirmed ? 'Payment was already confirmed.' : 'Payment confirmed and recorded.');
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyOrder(null);
    }
  }

  async function advanceFulfillment(orderId: string, status: string, label: string, dispatch?: { provider: string; reference: string }) {
    setBusyOrder(orderId);
    setMessage('');
    try {
      const response = await fetch('/api/admin/orders/fulfillment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status, ...(dispatch ? { dispatch } : {}) }),
      });
      const result = (await response.json()) as { message?: string; alreadyUpdated?: boolean };
      if (!response.ok) {
        setMessage(result.message ?? 'Fulfillment status could not be updated.');
        return;
      }

      setMessage(result.alreadyUpdated ? 'That fulfillment update was already applied.' : label);
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyOrder(null);
    }
  }

  async function cancelOrder(orderId: string) {
    const reason = cancelReasons[orderId]?.trim() ?? '';
    if (reason.length < 5) {
      setMessage('Enter a cancellation reason of at least five characters.');
      return;
    }

    setBusyOrder(orderId);
    setMessage('');
    try {
      const response = await fetch('/api/admin/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, reason }),
      });
      const result = await response.json() as { message?: string; paymentStatus?: string; alreadyCancelled?: boolean };
      if (!response.ok) {
        setMessage(result.message ?? 'Order could not be cancelled.');
        return;
      }

      setMessage(result.alreadyCancelled
        ? 'This order was already cancelled.'
        : result.paymentStatus === 'refund_pending'
          ? 'Order cancelled. Record the refund after the bank transfer has actually been sent.'
          : 'Order cancelled and reserved stock released.');
      setCancelFormOrder(null);
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyOrder(null);
    }
  }

  async function recordRefund(orderId: string) {
    const refundReference = refundReferences[orderId]?.trim() ?? '';
    if (refundReference.length < 4) {
      setMessage('Enter the actual bank refund reference.');
      return;
    }

    setBusyOrder(orderId);
    setMessage('');
    try {
      const response = await fetch('/api/admin/orders/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, refundReference }),
      });
      const result = await response.json() as { message?: string; alreadyRefunded?: boolean };
      if (!response.ok) {
        setMessage(result.message ?? 'Refund could not be recorded.');
        return;
      }

      setMessage(result.alreadyRefunded ? 'This refund was already recorded.' : 'Refund recorded.');
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyOrder(null);
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="mb-2 text-xs uppercase tracking-[0.24em] text-stone-500">Order operations</p>
        <h2 className="text-2xl font-semibold text-stone-900">
          {canManagePayments ? 'Orders and payments' : 'Order fulfillment'}
        </h2>
        {canManagePayments ? (
          <p className="mt-2 text-sm leading-6 text-stone-600">Confirm only after verifying the exact amount has cleared into the DEGEMS bank account. A customer-submitted reference is not proof of payment.</p>
        ) : null}
      </div>
      {orders.length === 0 ? (
        <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">No orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const fulfillmentAction = getFulfillmentAction(order.status);
            const cancellable = ['pending_payment', 'payment_under_review', 'confirmed', 'processing', 'ready_for_dispatch'].includes(order.status);
            return (
              <article key={order.id} className="rounded-2xl border border-stone-200 p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-stone-900">DG-{order.id.slice(0, 8).toUpperCase()} · {order.customerName ?? 'Guest'}</h3>
                    <p className="mt-1 text-sm text-stone-600">{order.customerEmail ?? 'No email'} · {new Date(order.createdAt).toLocaleString('en-NG')}</p>
                  </div>
                  <div className="text-right">
                    {canViewOrderValues ? (
                      <p className="font-semibold text-stone-900">{formatNairaFromKobo(order.total)}</p>
                    ) : null}
                    <p className="text-sm capitalize text-stone-500">{order.status.replaceAll('_', ' ')}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-stone-600">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} × {item.name}{item.variantName ? ` — ${item.variantName}` : ''}
                      {canViewOrderValues ? ` (${formatNairaFromKobo(item.unitPrice)} each)` : ''}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                  <p className="font-medium text-stone-900">
                    {order.deliveryMethod === 'door_delivery'
                      ? `Door delivery · ${order.deliveryZoneName ?? 'area unavailable'}`
                      : 'Free pickup'}
                    {canViewOrderValues ? ` · ${formatNairaFromKobo(order.deliveryFee)}` : ''}
                  </p>
                    {canViewDeliveryAddress && order.deliveryMethod === 'door_delivery' && order.deliveryAddress ? (
                    <p className="mt-1 whitespace-pre-line">{order.deliveryAddress}</p>
                  ) : null}
                </div>
                {canFulfill && order.payment?.status === 'confirmed' ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4 text-sm">
                    <p className="text-stone-600">Fulfillment: <span className="font-medium capitalize text-stone-900">{order.status.replaceAll('_', ' ')}</span></p>
                    {fulfillmentAction ? (
                      fulfillmentAction.next === 'shipped' ? (
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <input
                            aria-label="Carrier or delivery provider"
                            placeholder="Carrier / delivery provider"
                            value={dispatchDetails[order.id]?.provider ?? ''}
                            onChange={(event) => setDispatchDetails((current) => ({
                              ...current,
                              [order.id]: { ...current[order.id], provider: event.target.value, reference: current[order.id]?.reference ?? '' },
                            }))}
                            className={inputClass}
                          />
                          <input
                            aria-label="Tracking reference"
                            placeholder="Tracking reference"
                            value={dispatchDetails[order.id]?.reference ?? ''}
                            onChange={(event) => setDispatchDetails((current) => ({
                              ...current,
                              [order.id]: { ...current[order.id], provider: current[order.id]?.provider ?? '', reference: event.target.value },
                            }))}
                            className={inputClass}
                          />
                          <button
                            type="button"
                            disabled={busyOrder === order.id}
                            onClick={() => advanceFulfillment(
                              order.id,
                              fulfillmentAction.next,
                              fulfillmentAction.label,
                              dispatchDetails[order.id],
                            )}
                            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                          >
                            {busyOrder === order.id ? 'Updating…' : fulfillmentAction.label}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={busyOrder === order.id}
                          onClick={() => advanceFulfillment(order.id, fulfillmentAction.next, fulfillmentAction.label)}
                          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
                        >
                          {busyOrder === order.id ? 'Updating…' : fulfillmentAction.label}
                        </button>
                      )
                    ) : null}
                  </div>
                ) : null}
                {order.dispatchProvider ? (
                  <p className="mt-3 text-sm text-stone-600">
                    Dispatch: {order.dispatchProvider}{order.dispatchReference ? ` · ${order.dispatchReference}` : ''}
                  </p>
                ) : null}
                {order.cancellationReason ? (
                  <p className="mt-3 text-sm text-stone-600">Cancellation reason: {order.cancellationReason}</p>
                ) : null}
                {canCancel && cancellable ? (
                  <div className="mt-4 border-t border-stone-100 pt-4">
                    {cancelFormOrder === order.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          aria-label="Order cancellation reason"
                          minLength={5}
                          maxLength={500}
                          value={cancelReasons[order.id] ?? ''}
                          onChange={(event) => setCancelReasons((current) => ({ ...current, [order.id]: event.target.value }))}
                          placeholder="Reason for cancellation"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          disabled={busyOrder === order.id}
                          onClick={() => cancelOrder(order.id)}
                          className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                        >
                          {busyOrder === order.id ? 'Cancelling…' : 'Confirm cancellation'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancelFormOrder(null)}
                          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
                        >
                          Keep order
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busyOrder === order.id}
                        onClick={() => setCancelFormOrder(order.id)}
                        className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                      >
                        Cancel order
                      </button>
                    )}
                  </div>
                ) : null}
                {canManagePayments && order.payment ? (
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-stone-100 pt-4 text-sm">
                    <div>
                      <p className="text-stone-500">
                        Payment {order.payment.status.replaceAll('_', ' ')}
                        {order.payment.reference ? ` · DEGEMS reference ${order.payment.reference}` : ''}
                      </p>
                      {order.payment.bankTransferReference !== undefined ? (
                        <p className="mt-1 font-medium text-stone-900">
                          Customer transfer reference: {order.payment.bankTransferReference ?? 'Not submitted'}
                        </p>
                      ) : null}
                    </div>
                    {order.payment.status === 'under_review' ? (
                      <button
                        type="button"
                        disabled={busyOrder === order.id}
                        onClick={() => confirmPayment(order.id)}
                        className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
                      >
                        {busyOrder === order.id ? 'Verifying…' : 'Confirm bank credit'}
                      </button>
                    ) : null}
                    {order.payment.status === 'refund_pending' ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          aria-label="Bank refund reference"
                          minLength={4}
                          maxLength={100}
                          value={refundReferences[order.id] ?? ''}
                          onChange={(event) => setRefundReferences((current) => ({ ...current, [order.id]: event.target.value }))}
                          placeholder="Actual bank refund reference"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          disabled={busyOrder === order.id}
                          onClick={() => recordRefund(order.id)}
                          className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
                        >
                          {busyOrder === order.id ? 'Saving…' : 'Record completed refund'}
                        </button>
                      </div>
                    ) : null}
                    {order.payment.status === 'refunded' ? (
                      <p className="mt-2 text-sm text-emerald-800">Refund recorded · {order.payment.refundReference}</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-4 text-sm text-stone-600">{message}</p>
    </section>
  );
}

const inputClass = 'w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-900';

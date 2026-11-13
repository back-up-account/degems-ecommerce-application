'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export type AdminDeliveryZone = {
  id: string;
  name: string;
  deliveryFee: number;
  active: boolean;
};

export function DeliveryZoneManager({ zones }: { zones: AdminDeliveryZone[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [fees, setFees] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function createZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/delivery-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, deliveryFee: Number(deliveryFee) }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? 'Delivery area could not be saved.');
        return;
      }

      setName('');
      setDeliveryFee('');
      setMessage('Delivery area saved and available at checkout.');
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  async function setZoneActive(zone: AdminDeliveryZone, active: boolean) {
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/delivery-zones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_status', zoneId: zone.id, active }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? 'Delivery area status could not be changed.');
        return;
      }

      setMessage(`${zone.name} ${active ? 'enabled' : 'disabled'}.`);
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  async function updateZoneFee(zone: AdminDeliveryZone) {
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/delivery-zones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_fee',
          zoneId: zone.id,
          deliveryFee: Number(fees[zone.id] ?? zone.deliveryFee / 100),
        }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? 'Delivery fee could not be updated.');
        return;
      }

      setMessage(`${zone.name} delivery fee updated.`);
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="mb-2 text-xs uppercase tracking-[0.24em] text-stone-500">Logistics</p>
        <h2 className="text-2xl font-semibold text-stone-900">Delivery areas and rates</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Configure the areas you serve and their door-delivery fees. Rates are recalculated on the server and snapshotted with each order.
        </p>
      </div>

      <form onSubmit={createZone} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Delivery area name</span>
          <input
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Delivery fee (NGN)</span>
          <input
            required
            type="number"
            min="0"
            step="1"
            value={deliveryFee}
            onChange={(event) => setDeliveryFee(event.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Add area'}
        </button>
      </form>

      {zones.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
          No delivery areas are configured. Customers can still choose free pickup.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-100">
          {zones.map((zone) => {
            const enteredFee = fees[zone.id];
            const feeNaira = Number(enteredFee ?? zone.deliveryFee / 100);
            const feeValid = enteredFee === undefined
              || (enteredFee.trim().length > 0 && Number.isInteger(feeNaira) && feeNaira >= 0);

            return (
              <li key={zone.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium text-stone-900">{zone.name}</p>
                  <p className="mt-1 text-sm text-stone-600">{zone.active ? 'Available at checkout' : 'Disabled'}</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block space-y-1 text-xs font-medium text-stone-600">
                    <span>Fee (NGN)</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={enteredFee ?? zone.deliveryFee / 100}
                      onChange={(event) => setFees((current) => ({ ...current, [zone.id]: event.target.value }))}
                      className="w-32 rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-900"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !feeValid || feeNaira === zone.deliveryFee / 100}
                    onClick={() => updateZoneFee(zone)}
                    className="rounded-full border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save fee
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setZoneActive(zone, !zone.active)}
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {zone.active ? 'Disable area' : 'Enable area'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" aria-live="polite" className="mt-4 text-sm text-stone-600">{message}</p>
    </section>
  );
}

const inputClass = 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900';

'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

export type AdminCustomer = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  disabledAt: string | null;
  orderCount: number;
};

export function AdminCustomers({ customers }: { customers: AdminCustomer[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [busyCustomer, setBusyCustomer] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const visibleCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return customers;
    return customers.filter((customer) => (
      customer.email.toLowerCase().includes(normalizedQuery)
      || (customer.name ?? '').toLowerCase().includes(normalizedQuery)
    ));
  }, [customers, query]);

  async function setCustomerDisabled(customer: AdminCustomer, disabled: boolean) {
    setBusyCustomer(customer.id);
    setMessage('');
    try {
      const response = await fetch('/api/admin/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: customer.id, disabled }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? 'Customer account could not be updated.');
        return;
      }

      setMessage(`${customer.email} ${disabled ? 'disabled' : 'enabled'}.`);
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyCustomer(null);
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.24em] text-stone-500">Accounts</p>
          <h2 className="text-2xl font-semibold text-stone-900">Customers</h2>
        </div>
        <label className="block space-y-1 text-sm text-stone-600">
          <span>Search name or email</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className={inputClass} />
        </label>
      </div>
      {visibleCustomers.length === 0 ? (
        <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">
          {customers.length === 0 ? 'No customer accounts yet.' : 'No customers match your search.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-500">
              <tr>
                <th className="pb-3 pr-4 font-medium">Customer</th>
                <th className="pb-3 pr-4 font-medium">Orders</th>
                <th className="pb-3 pr-4 font-medium">Joined</th>
                <th className="pb-3 pr-4 font-medium">Account</th>
                <th className="pb-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.map((customer) => (
                <tr key={customer.id} className="border-b border-stone-100 last:border-b-0">
                  <td className="py-4 pr-4">
                    <p className="font-medium text-stone-900">{customer.name ?? 'No name provided'}</p>
                    <p className="text-stone-600">{customer.email}</p>
                  </td>
                  <td className="py-4 pr-4 text-stone-600">{customer.orderCount}</td>
                  <td className="py-4 pr-4 text-stone-600">{new Date(customer.createdAt).toLocaleDateString('en-NG')}</td>
                  <td className="py-4 pr-4 text-stone-600">{customer.disabledAt ? 'Disabled' : 'Active'}</td>
                  <td className="py-4 text-right">
                    <button
                      type="button"
                      disabled={busyCustomer === customer.id}
                      onClick={() => setCustomerDisabled(customer, !customer.disabledAt)}
                      className="rounded-full border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      {busyCustomer === customer.id ? 'Saving…' : customer.disabledAt ? 'Enable' : 'Disable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-4 text-sm text-stone-600">{message}</p>
    </section>
  );
}

const inputClass = 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-2 text-sm text-stone-900 outline-none focus:border-stone-900';

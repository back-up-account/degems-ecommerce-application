'use client';

import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminDashboard } from '@/components/admin-dashboard';
import type { AdminDashboardData } from '@api/lib/admin-dashboard-types';

type DashboardPayload = {
  roleLabel: string;
  dashboardData: AdminDashboardData;
};

type DashboardState =
  | { status: 'loading' }
  | { status: 'ready'; payload: DashboardPayload }
  | { status: 'error'; message: string };

export function AdminDashboardClient() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const response = await fetch('/api/admin/dashboard', { cache: 'no-store' });
        if (!active) return;

        if (response.status === 401) {
          router.replace('/admin/login');
          return;
        }
        if (response.status === 428) {
          router.replace('/admin/first-login');
          return;
        }
        if (!response.ok) {
          const result = await response.json() as { message?: string };
          setState({
            status: 'error',
            message: result.message ?? `Dashboard request failed (${response.status}).`,
          });
          return;
        }

        const payload = await response.json() as DashboardPayload;
        if (typeof payload.roleLabel !== 'string'
          || !payload.dashboardData
          || !Array.isArray(payload.dashboardData.products)
          || !Array.isArray(payload.dashboardData.orders)) {
          setState({ status: 'error', message: 'Dashboard response was invalid.' });
          return;
        }

        setState({ status: 'ready', payload });
      } catch (error) {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not load the dashboard.',
          });
        }
      }
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [router]);

  if (state.status === 'loading') {
    return <main className="mx-auto max-w-7xl px-4 py-12 text-sm text-stone-600">Loading administration…</main>;
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">{state.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-500">DEGEMS store operations</p>
          <h1 className="text-4xl font-semibold tracking-tight">{state.payload.roleLabel}</h1>
        </div>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/admin/login' })}
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700"
        >
          Sign out
        </button>
      </div>
      <AdminDashboard {...state.payload.dashboardData} />
    </main>
  );
}

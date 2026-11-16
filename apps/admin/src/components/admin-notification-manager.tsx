'use client';

import { useEffect, useState } from 'react';

type FailedNotification = {
  id: string;
  eventType: string;
  channel: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  orderReference: string | null;
};

type NotificationResult = {
  failedCount: number;
  notifications: FailedNotification[];
};

export function AdminNotificationManager() {
  const [result, setResult] = useState<NotificationResult>({ failedCount: 0, notifications: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/admin/notifications', { cache: 'no-store' });
        const data = await response.json() as NotificationResult & { message?: string };
        if (!active) return;
        if (!response.ok || !Array.isArray(data.notifications)) {
          setMessage(data.message ?? 'Notification failures could not be loaded.');
          return;
        }
        setResult(data);
      } catch {
        if (active) setMessage('Could not reach the server. Try again shortly.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  function refresh() {
    setLoading(true);
    setMessage('');
    setRefreshKey((current) => current + 1);
  }

  async function retry(notificationId: string) {
    setBusyId(notificationId);
    setMessage('');
    try {
      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(data.message ?? 'Notification could not be queued for retry.');
        return;
      }
      setResult((current) => ({
        failedCount: Math.max(0, current.failedCount - 1),
        notifications: current.notifications.filter((item) => item.id !== notificationId),
      }));
      setMessage('Notification queued for retry. Check provider delivery and the queue metrics.');
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.24em] text-stone-500">Operations</p>
          <h2 className="text-2xl font-semibold text-stone-900">Failed notifications</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-600">{result.failedCount} failed</span>
          <button
            type="button"
            disabled={loading}
            onClick={refresh}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm leading-6 text-stone-600">
        Review the provider configuration before retrying. Retries are audited and use the normal delivery worker.
      </p>
      {loading ? <p role="status" className="text-sm text-stone-600">Loading notification queue...</p> : null}
      {!loading && result.notifications.length === 0 ? (
        <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">
          {result.failedCount === 0 ? 'No failed notifications.' : 'Showing the latest 50 failed notifications.'}
        </p>
      ) : null}
      {result.notifications.length > 0 ? (
        <div className="space-y-3">
          {result.notifications.map((notification) => (
            <article key={notification.id} className="flex flex-col gap-3 rounded-2xl border border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-medium text-stone-900">
                  {notification.eventType.replaceAll('_', ' ')} - {notification.channel}
                </h3>
                <p className="mt-1 text-sm text-stone-600">
                  {notification.orderReference ? `${notification.orderReference} - ` : ''}
                  {notification.attempts} attempts - {notification.lastError ?? 'No error detail'}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Last updated {new Date(notification.updatedAt).toLocaleString('en-NG')}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === notification.id}
                onClick={() => void retry(notification.id)}
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {busyId === notification.id ? 'Queueing...' : 'Retry notification'}
              </button>
            </article>
          ))}
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="mt-4 text-sm text-stone-600">{message}</p>
    </section>
  );
}

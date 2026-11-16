import type { AdminAuditEvent } from '@api/lib/admin-dashboard-types';

export function AdminAuditLog({ events }: { events: AdminAuditEvent[] }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h3 className="text-xl font-semibold text-stone-900">Recorded changes</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Latest 100 recorded changes across staff, catalog, orders, payments, customers, and store settings.
          Read-only visits are not logged.
        </p>
      </div>

      {events.length === 0 ? (
        <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">No changes have been recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Latest recorded administration changes</caption>
            <thead className="border-b border-stone-200 text-stone-500">
              <tr>
                <th scope="col" className="pb-3 pr-5 font-medium">Activity</th>
                <th scope="col" className="pb-3 pr-5 font-medium">Record</th>
                <th scope="col" className="pb-3 pr-5 font-medium">Performed by</th>
                <th scope="col" className="pb-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-stone-100 last:border-b-0">
                  <td className="py-4 pr-5 font-medium text-stone-900">{formatAction(event.action)}</td>
                  <td className="py-4 pr-5 text-stone-600">
                    <span>{event.entityType}</span>
                    <code className="ml-2 text-xs text-stone-500" title={event.entityId}>
                      {event.entityId.slice(0, 8)}
                    </code>
                  </td>
                  <td className="py-4 pr-5 text-stone-600">{event.actorLabel}</td>
                  <td className="whitespace-nowrap py-4 text-stone-600">
                    <time dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatAction(action: string) {
  return action
    .split(/[._]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

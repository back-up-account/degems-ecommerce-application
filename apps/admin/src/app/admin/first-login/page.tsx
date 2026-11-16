import { AdminFirstLogin } from '@/components/admin-first-login';

export const dynamic = 'force-dynamic';

export default function AdminFirstLoginPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <section className="space-y-6 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-brass-600">First-time staff setup</p>
          <h1 className="text-3xl font-semibold tracking-tight">Secure your staff account</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Choose a private password and enroll an authenticator before accessing administration.
          </p>
        </div>
        <AdminFirstLogin />
      </section>
    </main>
  );
}

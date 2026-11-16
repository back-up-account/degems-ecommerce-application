import Link from 'next/link';
import { AdminSignIn } from '@admin/components/admin-sign-in';

export const dynamic = 'force-dynamic';

export default function AdminLoginPage() {
  return (
    <main className="mx-auto grid min-h-[calc(100dvh-5rem)] w-full max-w-5xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:px-8">
      <section className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brass-600">Secure staff portal</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">The tools behind your storefront.</h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-stone-600">
          Sign in with your DEGEMS staff account. Your role controls which administration tools are available.
        </p>
      </section>
      <section className="w-full min-w-0 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-2xl font-semibold">Staff sign in</h2>
        <p className="mt-2 text-sm text-stone-600">Enter your email and password first. We’ll ask for your verification code next.</p>
        <div className="mt-6">
          <AdminSignIn callbackUrl="/admin" />
        </div>
        <p className="mt-5 border-t border-stone-200 pt-4 text-xs leading-5 text-stone-500">
          New staff continue to the required authenticator setup after verifying their credentials.
        </p>
        <Link href="/" className="mt-5 inline-flex text-sm font-medium text-stone-700 underline">
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}

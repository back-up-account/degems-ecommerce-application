import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AccountSignIn } from '@/components/account-sign-in';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const signupHref = callbackUrl
    ? `/account/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/account/signup';

  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-500">Welcome back</p>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900">Sign in to DEGEMS</h1>
        </div>

        <AccountSignIn
          callbackUrl={callbackUrl}
          googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
        />

        <div className="mt-7 border-t border-stone-200 pt-5 text-center">
          <p className="text-sm text-stone-600">New to DEGEMS?</p>
          <Link
            href={signupHref}
            className="mt-2 inline-flex items-center gap-2 font-medium text-stone-900 underline decoration-stone-400 underline-offset-4 hover:decoration-stone-900"
          >
            Create a customer account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}

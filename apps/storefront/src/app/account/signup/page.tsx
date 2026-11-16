import Link from 'next/link';
import { ArrowLeft, ArrowRight, Lock, UserRound } from 'lucide-react';
import { AccountRegistration } from '@/components/account-registration';

export const metadata = {
  title: 'Create a customer account | DEGEMS',
  robots: { index: false, follow: false },
};

export default async function AccountSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const signInHref = callbackUrl
    ? `/account?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/account';

  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] bg-stone-900 p-6 text-white shadow-sm sm:p-8">
        <div className="mb-7">
          <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-300">New to DEGEMS</p>
          <h1 className="text-3xl font-semibold tracking-tight">Create your customer account</h1>
          <p className="mt-3 text-sm leading-6 text-stone-300">
            Enter your name and email. We’ll send you a verification link to finish setting up your account.
          </p>
        </div>

        <AccountRegistration />

        <div className="mt-7 space-y-3 border-t border-white/10 pt-5 text-sm text-stone-200">
          <p className="flex items-center gap-3">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            Verify your email before signing in.
          </p>
          <p className="flex items-center gap-3">
            <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
            New accounts receive customer access only.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
          <Link href={signInHref} className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-stone-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
          </Link>
          <Link href="/products" className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-stone-300">
            Explore products
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}

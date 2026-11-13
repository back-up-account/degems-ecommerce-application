import Link from 'next/link';
import { ArrowRight, Lock, UserRound } from 'lucide-react';
import { AccountRegistration } from '@/components/account-registration';
import { AccountSignIn } from '@/components/account-sign-in';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid gap-8 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm lg:grid-cols-2 lg:p-8">
        <section className="space-y-6">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-500">Welcome back</p>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-900">Sign in to DEGEMS</h1>
          </div>

          <AccountSignIn
            callbackUrl={callbackUrl}
            googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
          />
        </section>

        <section className="rounded-[2rem] bg-stone-900 p-6 text-white lg:p-8">
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-300">New to DEGEMS</p>
              <h2 className="text-3xl font-semibold tracking-tight">Create a customer account.</h2>
            </div>
            <AccountRegistration />
            <div className="space-y-3 border-t border-white/10 pt-5 text-sm text-stone-200">
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4" />
                Email verification is required before signing in.
              </div>
              <div className="flex items-center gap-3">
                <UserRound className="h-4 w-4" />
                New accounts are created with customer access only.
              </div>
              <Link href="/products" className="inline-flex items-center gap-2 pt-2 font-medium text-white">
                Explore products
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

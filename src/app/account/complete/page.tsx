import { AccountSignInCompletion } from '@/components/account-sign-in-completion';

export const metadata = {
  title: 'Complete sign-in | DEGEMS',
  robots: { index: false, follow: false },
};

export default async function AccountSignInCompletionPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="space-y-5 rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Account ready</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Sign-in complete</h1>
        <p className="text-sm leading-6 text-stone-600">Continue to merge your guest cart with your DEGEMS account cart.</p>
        <AccountSignInCompletion callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}

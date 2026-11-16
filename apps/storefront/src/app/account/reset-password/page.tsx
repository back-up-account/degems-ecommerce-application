import Link from 'next/link';
import { AccountPasswordReset } from '@/components/account-password-reset';

export const metadata = {
  title: 'Choose a new password | DEGEMS',
  robots: { index: false, follow: false },
};

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="space-y-5 rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Account security</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Choose a new password</h1>
        <AccountPasswordReset token={token ?? ''} />
        <Link href="/account" className="text-sm font-medium text-stone-700 underline">Back to sign in</Link>
      </div>
    </main>
  );
}

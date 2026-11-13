import Link from 'next/link';
import { AccountRecoveryRequest } from '@/components/account-recovery-request';

export const metadata = {
  title: 'Recover account | DEGEMS',
  robots: { index: false, follow: false },
};

export default function AccountRecoveryPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="space-y-5 rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Account security</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Reset your password</h1>
        <p className="text-sm leading-6 text-stone-600">Enter your account email. If an eligible account exists, we’ll send a one-time reset link.</p>
        <AccountRecoveryRequest />
        <Link href="/account" className="text-sm font-medium text-stone-700 underline">Back to sign in</Link>
      </div>
    </main>
  );
}

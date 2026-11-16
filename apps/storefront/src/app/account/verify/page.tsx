import { AccountEmailVerification } from '@/components/account-email-verification';

export const metadata = {
  title: 'Verify email | DEGEMS',
  robots: { index: false, follow: false },
};

export default async function AccountVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="space-y-5 rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Account security</p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Verify your email</h1>
        <p className="text-sm leading-6 text-stone-600">Verify your email address, then choose a password to activate your DEGEMS customer account.</p>
        <AccountEmailVerification token={token ?? ''} />
      </div>
    </main>
  );
}

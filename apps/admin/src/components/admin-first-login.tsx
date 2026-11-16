'use client';

import { signOut } from 'next-auth/react';
import { useState, type FormEvent } from 'react';

type Enrollment = {
  uri: string;
  recoveryCodes: string[];
};

export function AdminFirstLogin() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [message, setMessage] = useState('');
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);

  async function beginSetup() {
    setStarting(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/staff/onboarding', {
        method: 'POST',
        cache: 'no-store',
      });
      const result = await response.json() as Enrollment & { message?: string };
      if (!response.ok || !result.uri || !result.recoveryCodes) {
        setMessage(result.message ?? 'Authenticator setup could not be started.');
        return;
      }
      setEnrollment({ uri: result.uri, recoveryCodes: result.recoveryCodes });
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setStarting(false);
    }
  }

  async function completeSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCompleting(true);
    setMessage('');
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/admin/staff/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: String(formData.get('password') ?? ''),
          confirmPassword: String(formData.get('confirmPassword') ?? ''),
          mfaCode: String(formData.get('mfaCode') ?? '').trim(),
        }),
      });
      const result = await response.json() as { message?: string };
      setMessage(result.message ?? 'Staff setup could not be completed.');
      if (response.ok) {
        await signOut({ callbackUrl: '/admin/login' });
      }
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {!enrollment ? (
        <button
          type="button"
          onClick={() => void beginSetup()}
          disabled={starting}
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {starting ? 'Preparing authenticator…' : 'Begin authenticator setup'}
        </button>
      ) : (
        <>
          <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <h2 className="font-semibold text-amber-950">1. Add DEGEMS to your authenticator app</h2>
            <p className="text-sm leading-6 text-amber-900">
              Import this setup URI into your authenticator app, or enter its secret key manually. Keep it private.
            </p>
            <code className="block overflow-x-auto rounded-xl bg-white p-3 text-xs text-stone-800">{enrollment.uri}</code>
          </section>

          <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <h2 className="font-semibold text-stone-900">2. Save your recovery codes</h2>
            <p className="text-sm leading-6 text-stone-600">
              Each code works once if you lose access to your authenticator. Save them privately; they will not be shown again.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {enrollment.recoveryCodes.map((code) => (
                <li key={code} className="rounded-lg bg-white px-3 py-2 font-mono text-sm text-stone-900">{code}</li>
              ))}
            </ul>
          </section>

          <form onSubmit={completeSetup} className="space-y-4">
            <h2 className="font-semibold text-stone-900">3. Choose your password and confirm MFA</h2>
            <label className="block space-y-2 text-sm font-medium text-stone-700">
              <span>New password</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                className={inputClass}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-stone-700">
              <span>Confirm new password</span>
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                className={inputClass}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-stone-700">
              <span>Current six-digit authenticator code</span>
              <input
                name="mfaCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={completing}
              className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
            >
              {completing ? 'Securing account…' : 'Save password and enable MFA'}
            </button>
          </form>
        </>
      )}
      <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
    </div>
  );
}

const inputClass = 'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900';

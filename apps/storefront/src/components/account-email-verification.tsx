'use client';

import Link from 'next/link';
import { useState } from 'react';

export function AccountEmailVerification({ token }: { token: string }) {
  const [message, setMessage] = useState('');
  const [created, setCreated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function completeRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const confirmPassword = String(formData.get('confirmPassword') ?? '');
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/account/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const result = (await response.json()) as { message?: string };
      setMessage(result.message ?? 'This verification link is invalid or expired.');
      setCreated(response.ok);
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    !token ? <p role="status" className="text-sm text-red-600">This verification link is invalid or expired.</p> : created ? (
      <div className="space-y-4">
        <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
        <Link href="/account" className="inline-flex rounded-full border border-stone-300 px-5 py-3 text-sm font-medium">Continue to sign in</Link>
      </div>
    ) : (
      <form onSubmit={completeRegistration} className="space-y-4">
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Choose a password</span>
          <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className={inputClass} />
        </label>
        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Confirm password</span>
          <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Activating account…' : 'Verify email and create account'}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
      </form>
    )
  );
}

const inputClass = 'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900';

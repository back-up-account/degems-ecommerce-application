'use client';

import { useState } from 'react';

export function AccountPasswordReset({ token }: { token: string }) {
  const [message, setMessage] = useState('');
  const [updated, setUpdated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
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
      const response = await fetch('/api/account/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const result = (await response.json()) as { message?: string };
      setMessage(result.message ?? 'This password reset link is invalid or expired.');
      setUpdated(response.ok);
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return <p role="status" className="text-sm text-red-600">This password reset link is invalid or expired.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-2 text-sm font-medium text-stone-700">
        <span>New password</span>
        <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className={inputClass} />
      </label>
      <label className="block space-y-2 text-sm font-medium text-stone-700">
        <span>Confirm new password</span>
        <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={isSubmitting || updated}
        className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
      >
        {isSubmitting ? 'Updating…' : 'Update password'}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
    </form>
  );
}

const inputClass = 'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900';

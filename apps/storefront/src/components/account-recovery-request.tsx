'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { accountEmailSchema } from '@api/lib/account-validation';
import type { z } from 'zod';

type EmailValues = z.input<typeof accountEmailSchema>;
type EmailResult = z.output<typeof accountEmailSchema>;

export function AccountRecoveryRequest() {
  const [message, setMessage] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailValues, unknown, EmailResult>({
    resolver: zodResolver(accountEmailSchema),
  });

  async function onSubmit(values: EmailResult) {
    setMessage('');
    try {
      const response = await fetch('/api/account/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = (await response.json()) as { message?: string };
      setMessage(result.message ?? 'If an eligible account exists, password reset instructions will be sent by email. Links expire after 30 minutes.');
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <label htmlFor="recovery-email" className="block text-sm font-medium text-stone-700">Reset password by email</label>
      <input
        id="recovery-email"
        {...register('email')}
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900"
      />
      {errors.email ? <p className="text-xs text-red-600">{errors.email.message}</p> : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
      >
        {isSubmitting ? 'Requesting…' : 'Send reset link'}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
    </form>
  );
}

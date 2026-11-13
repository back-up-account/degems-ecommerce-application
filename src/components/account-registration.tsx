'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { accountRegistrationSchema } from '@/lib/account-validation';
import type { z } from 'zod';

type RegistrationValues = z.input<typeof accountRegistrationSchema>;
type RegistrationResult = z.output<typeof accountRegistrationSchema>;

export function AccountRegistration() {
  const [message, setMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationValues, unknown, RegistrationResult>({
    resolver: zodResolver(accountRegistrationSchema),
  });

  async function onSubmit(values: RegistrationResult) {
    setMessage('');
    try {
      const response = await fetch('/api/account/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = (await response.json()) as { message?: string };
      setMessage(result.message ?? 'If this address can be registered, verification instructions will be sent by email. Links expire after 30 minutes.');
      setIsSubmitted(response.ok);
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    }
  }

  if (isSubmitted) {
    return <p role="status" aria-live="polite" className="rounded-2xl bg-white/10 p-4 text-sm text-stone-100">{message}</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <label className="block space-y-2 text-sm font-medium text-stone-100">
        <span>Name</span>
        <input {...register('name')} autoComplete="name" className={inputClass} />
        {errors.name ? <span className="block text-xs font-normal text-red-200">{errors.name.message}</span> : null}
      </label>
      <label className="block space-y-2 text-sm font-medium text-stone-100">
        <span>Email</span>
        <input {...register('email')} type="email" autoComplete="email" className={inputClass} />
        {errors.email ? <span className="block text-xs font-normal text-red-200">{errors.email.message}</span> : null}
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-full bg-white px-5 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-100 disabled:opacity-60"
      >
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-stone-200">{message}</p>
      <p className="text-xs leading-5 text-stone-300">Verify your email first, then choose a password. Links expire after 30 minutes.</p>
    </form>
  );
}

const inputClass = 'w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-stone-400 focus:border-white';

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { signOut } from 'next-auth/react';
import { useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});

export function AdminSecuritySettings() {
  const [message, setMessage] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof passwordChangeSchema>>({
    resolver: zodResolver(passwordChangeSchema),
  });

  async function onSubmit(values: z.infer<typeof passwordChangeSchema>) {
    setMessage('');
    try {
      const response = await fetch('/api/admin/security/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? 'Could not change the password.');
        return;
      }
      reset();
      setMessage(result.message ?? 'Password changed.');
      await signOut({ callbackUrl: '/account' });
    } catch {
      setMessage('Could not change the password. Try again shortly.');
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-stone-900">Administrator security</h2>
      <p className="mt-2 text-sm text-stone-600">
        Admin sign-in requires an authenticator code. Changing your password ends all active sessions.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 grid gap-4 sm:max-w-xl">
        <PasswordField
          id="admin-current-password"
          label="Current password"
          autoComplete="current-password"
          register={register('currentPassword')}
          error={errors.currentPassword?.message}
        />
        <PasswordField
          id="admin-new-password"
          label="New password"
          autoComplete="new-password"
          register={register('password')}
          error={errors.password?.message}
        />
        <PasswordField
          id="admin-confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          register={register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-fit rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Updating…' : 'Change password'}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
      </form>
    </section>
  );
}

function PasswordField({
  id,
  label,
  autoComplete,
  register,
  error,
}: {
  id: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  register: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-stone-700">{label}</label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        {...register}
        className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-900"
      />
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

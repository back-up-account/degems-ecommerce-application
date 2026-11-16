'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

const mfaSchema = z.object({
  mfaCode: z.string().trim().min(1, 'Enter your authenticator or recovery code.').max(32),
});

type Credentials = z.infer<typeof credentialsSchema>;

export function AdminSignIn({ callbackUrl = '/admin' }: { callbackUrl?: string }) {
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [adminChallenge, setAdminChallenge] = useState('');
  const credentialsForm = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
  });
  const mfaForm = useForm<z.infer<typeof mfaSchema>>({
    resolver: zodResolver(mfaSchema),
  });

  async function finishSignIn(values: {
    email?: string;
    password?: string;
    mfaCode?: string;
    adminChallenge?: string;
  }) {
    const result = await signIn('credentials', {
      ...values,
      adminLogin: 'true',
      redirect: false,
    });

    if (result?.error) {
      setMessage(values.adminChallenge
        ? 'Verification code is incorrect or the sign-in challenge has expired.'
        : 'Email or password is incorrect.');
      return;
    }

    const destination = new URL(callbackUrl, window.location.origin);
    window.location.assign(destination.origin === window.location.origin ? destination.href : '/');
  }

  async function onCredentialsSubmit(values: Credentials) {
    setMessage('');
    try {
      const response = await fetch('/api/auth/admin/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(values),
      });

      const result = await response.json() as {
        status?: 'mfa' | 'setup';
        challenge?: string;
        message?: string;
      };
      if (!response.ok) {
        setMessage(result.message ?? 'Email or password is incorrect.');
        return;
      }

      if (result.status === 'setup') {
        await finishSignIn(values);
        return;
      }
      if (result.status !== 'mfa' || !result.challenge) {
        setMessage('Could not verify your account. Try again shortly.');
        return;
      }

      setAdminChallenge(result.challenge);
      setStep('mfa');
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    }
  }

  async function onMfaSubmit({ mfaCode }: z.infer<typeof mfaSchema>) {
    if (!adminChallenge) {
      setStep('credentials');
      setMessage('Enter your email and password to continue.');
      return;
    }

    setMessage('');
    try {
      await finishSignIn({ mfaCode, adminChallenge });
    } catch {
      setMessage('Could not sign in right now. Try again shortly.');
    }
  }

  return (
    <div className="space-y-5">
      {step === 'credentials' ? (
        <form onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-stone-700" htmlFor="staff-email">Email</label>
            <div className="flex h-12 w-full items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 focus-within:border-brass-500 focus-within:ring-2 focus-within:ring-brass-100">
              <Mail className="h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
              <input
                id="staff-email"
                {...credentialsForm.register('email')}
                type="email"
                autoComplete="username"
                placeholder="name@example.com"
                className="min-w-0 w-full bg-transparent text-sm leading-5 text-stone-900 placeholder:text-stone-400 outline-none"
              />
            </div>
            {credentialsForm.formState.errors.email ? <p className="text-sm text-red-600">{credentialsForm.formState.errors.email.message}</p> : null}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-stone-700" htmlFor="staff-password">Password</label>
            <div className="flex h-12 w-full items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 focus-within:border-brass-500 focus-within:ring-2 focus-within:ring-brass-100">
              <Lock className="h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
              <input
                id="staff-password"
                {...credentialsForm.register('password')}
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                className="min-w-0 w-full bg-transparent text-sm leading-5 text-stone-900 placeholder:text-stone-400 outline-none"
              />
            </div>
            {credentialsForm.formState.errors.password ? <p className="text-sm text-red-600">{credentialsForm.formState.errors.password.message}</p> : null}
          </div>

          <button
            type="submit"
            disabled={credentialsForm.formState.isSubmitting}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition-colors hover:bg-stone-700 focus-visible:ring-2 focus-visible:ring-brass-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {credentialsForm.formState.isSubmitting ? 'Checking credentials…' : 'Continue'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      ) : (
        <form onSubmit={mfaForm.handleSubmit(onMfaSubmit)} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-stone-700" htmlFor="staff-mfa-code">
              Authenticator or recovery code
            </label>
            <input
              id="staff-mfa-code"
              {...mfaForm.register('mfaCode')}
              type="text"
              autoComplete="one-time-code"
              inputMode="text"
              placeholder="Enter your code"
              autoFocus
              className="h-12 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm leading-5 text-stone-900 placeholder:text-stone-400 outline-none focus-visible:ring-2 focus-visible:ring-brass-100"
            />
            {mfaForm.formState.errors.mfaCode ? <p className="text-sm text-red-600">{mfaForm.formState.errors.mfaCode.message}</p> : null}
            <p className="text-xs leading-5 text-stone-500">
              Enter the current code from your authenticator app, or use one of your recovery codes.
            </p>
          </div>

          <button
            type="submit"
            disabled={mfaForm.formState.isSubmitting}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition-colors hover:bg-stone-700 focus-visible:ring-2 focus-visible:ring-brass-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mfaForm.formState.isSubmitting ? 'Verifying code…' : 'Verify and sign in'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAdminChallenge('');
              setStep('credentials');
              setMessage('');
              mfaForm.reset();
            }}
            className="inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-medium text-stone-600 underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Use a different account
          </button>
        </form>
      )}

      <div className="text-right">
        <Link href="/account/recover" className="text-sm font-medium text-stone-600 underline">
          Forgot password?
        </Link>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-red-600">{message}</p>
    </div>
  );
}

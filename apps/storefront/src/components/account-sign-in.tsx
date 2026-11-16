'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const signInSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
  mfaCode: z.string().max(32).optional(),
});

export function AccountSignIn({
  callbackUrl,
  googleEnabled = false,
  mode = 'customer',
}: {
  callbackUrl?: string;
  googleEnabled?: boolean;
  mode?: 'customer' | 'admin';
}) {
  const [message, setMessage] = useState('');
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
  });

  async function onSubmit(values: z.infer<typeof signInSchema>) {
    setMessage('');

    try {
      const result = await signIn('credentials', {
        ...values,
        adminLogin: mode === 'admin' ? 'true' : 'false',
        redirect: false,
      });

      if (result?.error) {
        setMessage('Email or password is incorrect.');
        return;
      }

      if (mode === 'customer') {
        try {
          const cartResponse = await fetch('/api/cart/claim', { method: 'POST' });
          if (!cartResponse.ok) {
            setMessage('You are signed in, but your cart could not be synchronized. Try again shortly.');
            return;
          }
        } catch {
          setMessage('You are signed in, but your cart could not be synchronized. Try again shortly.');
          return;
        }
      }

      const destination = new URL(callbackUrl ?? '/', window.location.origin);
      window.location.assign(destination.origin === window.location.origin ? destination.href : '/');
    } catch {
      setMessage('Could not sign in right now. Try again shortly.');
    }
  }

  async function signInWithGoogle() {
    setMessage('');
    setIsGoogleSubmitting(true);
    try {
      const destination = new URL(callbackUrl ?? '/', window.location.origin);
      const safeDestination = destination.origin === window.location.origin
        ? `${destination.pathname}${destination.search}${destination.hash}`
        : '/';
      const completionUrl = `/account/complete?callbackUrl=${encodeURIComponent(safeDestination)}`;
      const result = await signIn('google', { callbackUrl: completionUrl, redirect: false });
      if (!result?.url) {
        setMessage('Could not start Google sign-in. Try again shortly.');
        setIsGoogleSubmitting(false);
        return;
      }
      window.location.assign(result.url);
    } catch {
      setMessage('Could not start Google sign-in. Try again shortly.');
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700" htmlFor="account-email">Email</label>
          <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
            <Mail className="h-4 w-4 text-stone-500" />
            <input id="account-email" {...register('email')} type="email" autoComplete="email" className="w-full bg-transparent text-sm text-stone-900 outline-none" />
          </div>
          {errors.email ? <p className="mt-2 text-sm text-red-600">{errors.email.message}</p> : null}
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700" htmlFor="account-password">Password</label>
          <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
            <Lock className="h-4 w-4 text-stone-500" />
            <input id="account-password" {...register('password')} type="password" autoComplete="current-password" className="w-full bg-transparent text-sm text-stone-900 outline-none" />
          </div>
          {errors.password ? <p className="mt-2 text-sm text-red-600">{errors.password.message}</p> : null}
        </div>
        {mode === 'admin' ? (
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700" htmlFor="admin-mfa-code">
              Authenticator or recovery code
            </label>
            <input
              id="admin-mfa-code"
              {...register('mfaCode')}
              type="text"
              autoComplete="one-time-code"
              inputMode="text"
              placeholder="Leave blank for first-time setup"
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none"
            />
            <p className="mt-1 text-xs text-stone-500">
              Existing staff must enter a valid code. New staff leave this blank and will be required to set up MFA before accessing admin tools.
            </p>
          </div>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-60"
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
          <ArrowRight className="h-4 w-4" />
        </button>
        <div className="text-right">
          <Link href="/account/recover" className="text-sm font-medium text-stone-600 underline">
            Forgot password?
          </Link>
        </div>
        <p role="status" aria-live="polite" className="text-sm text-red-600">{message}</p>
      </form>
      {googleEnabled && mode === 'customer' ? (
        <button
          type="button"
          disabled={isGoogleSubmitting}
          onClick={signInWithGoogle}
          className="w-full rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
        >
          {isGoogleSubmitting ? 'Opening Google…' : 'Continue with Google'}
        </button>
      ) : null}
    </div>
  );
}

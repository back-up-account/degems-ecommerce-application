'use client';

import Link from 'next/link';
import { useState } from 'react';

export function AccountSignInCompletion({ callbackUrl }: { callbackUrl?: string }) {
  const [message, setMessage] = useState('');
  const [isContinuing, setIsContinuing] = useState(false);

  async function continueToStore() {
    setMessage('');
    setIsContinuing(true);
    try {
      const response = await fetch('/api/cart/claim', { method: 'POST' });
      if (!response.ok) {
        setMessage('Your cart could not be synchronized. Try again shortly.');
        return;
      }

      const destination = new URL(callbackUrl ?? '/', window.location.origin);
      window.location.assign(destination.origin === window.location.origin ? destination.href : '/');
    } catch {
      setMessage('Your cart could not be synchronized. Try again shortly.');
    } finally {
      setIsContinuing(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={continueToStore}
        disabled={isContinuing}
        className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
      >
        {isContinuing ? 'Saving your cart…' : 'Continue'}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
      <Link href="/account" className="block text-sm font-medium text-stone-700 underline">Return to account sign-in</Link>
    </div>
  );
}

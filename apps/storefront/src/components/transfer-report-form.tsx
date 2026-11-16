'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

export function TransferReportForm({ token, disabled }: { token: string; disabled: boolean }) {
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/invoice/payment-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, bankTransferReference: reference }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(result.message ?? 'Transfer reference could not be submitted.');
        return;
      }

      setSubmitted(true);
      setMessage(result.message ?? 'Transfer reference submitted for review.');
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submitTransfer} className="mt-6 space-y-3">
      <label className="block space-y-2 text-sm font-medium text-stone-700">
        <span>Bank transfer transaction reference</span>
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          disabled={disabled || submitted || isSubmitting}
          required
          minLength={4}
          maxLength={100}
          autoComplete="off"
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900 disabled:bg-stone-100"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || submitted || isSubmitting || reference.trim().length < 4}
        className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? 'Submitting…' : 'Report transfer for review'}
      </button>
      <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
      {submitted ? <p className="text-xs leading-5 text-amber-800">This report is not payment confirmation. Do not send funds a second time if you have already transferred.</p> : null}
    </form>
  );
}

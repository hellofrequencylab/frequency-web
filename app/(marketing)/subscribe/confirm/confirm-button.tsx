'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { confirmSubscribe } from './actions'

// The AFFIRMATIVE confirm surface for the inbound double-opt-in. Consent flips on THIS click (a POST
// server action), never on page load, so a link scanner or inbox prefetcher opening the email cannot
// subscribe anyone. Modeled on the warm-intro accept pattern (app/(capture)/intro/intro-accept.tsx).
export function ConfirmSubscribeButton({ e, x, t }: { e: string; x: string; t: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onConfirm() {
    setError(null)
    setStatus('loading')
    const res = await confirmSubscribe({ e, x, t })
    if (res.ok) {
      setStatus('done')
    } else {
      setError('This link may have expired. Head back and we can send you a fresh one.')
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div role="status">
        <div className="mx-auto w-14 h-14 rounded-full bg-success-bg text-success flex items-center justify-center mb-6">
          <Check className="w-7 h-7" strokeWidth={2.5} aria-hidden />
        </div>
        <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
          You&apos;re on the list.
        </h1>
        <p className="text-lg text-muted leading-relaxed mb-8">
          That&apos;s it. You&apos;ll hear from Daniel a few times a month, notes on Circles,
          practices, and events. Every email has a one-click unsubscribe if it ever stops being
          worth your inbox.
        </p>
        <Link
          href="/"
          className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
        >
          Back to Frequency
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
        Confirm your subscription.
      </h1>
      <p className="text-lg text-muted leading-relaxed mb-8">
        One tap and you&apos;re on the list. You&apos;ll hear from Daniel a few times a month, notes
        on Circles, practices, and events.
      </p>
      <button
        type="button"
        onClick={onConfirm}
        disabled={status === 'loading'}
        className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? 'One sec…' : 'Confirm subscription'}
      </button>
      {error && (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

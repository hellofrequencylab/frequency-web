'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { acceptIntro } from './actions'

// The one-tap confirm for the warm-intro double-opt-in. Consent is an AFFIRMATIVE click, never a
// side effect of opening the email (a link scanner must not subscribe anyone), so the flip to mailable
// happens here on the button, not on page load.
export function IntroAccept({ token, spaceName }: { token: string; spaceName: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onAccept() {
    setError(null)
    setStatus('loading')
    const res = await acceptIntro(token)
    if (res.ok) {
      setStatus('done')
    } else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="text-center" role="status">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success">
          <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
        </div>
        <h3 className="text-2xl font-bold text-text">You&apos;re connected.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {spaceName} can reach you now. Every email has a one-click unsubscribe if it ever stops being
          worth your inbox.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-2xl bg-primary px-6 py-3 text-base font-bold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Explore Frequency
        </Link>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={onAccept}
        disabled={status === 'loading'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3.5 text-base font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {status === 'loading' ? 'One sec…' : 'Yes, keep me posted'}
      </button>
      <Link
        href="/"
        className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-border px-8 py-3 text-sm font-semibold text-muted transition-colors hover:bg-canvas"
      >
        No thanks
      </Link>
      {error && (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

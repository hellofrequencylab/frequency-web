'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button, Outcome, buttonClasses } from '@/components/marketing/marketing-ui'
import { confirmSubscribe } from './actions'

// The AFFIRMATIVE confirm surface for the inbound double-opt-in. Consent flips on THIS click (a POST
// server action), never on page load, so a link scanner or inbox prefetcher opening the email cannot
// subscribe anyone. Modeled on the warm-intro accept pattern (app/(capture)/intro/intro-accept.tsx).
//
// Both states compose the kit's `Outcome` block, so this landing is the same lockup as /beta/confirm
// rather than a fourth hand-stacked copy of it.
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
      <Outcome
        role="status"
        tone="success"
        icon={Check}
        title={<>You&apos;re on the list.</>}
        action={<Button href="/">Back to Frequency</Button>}
      >
        That&apos;s it. You&apos;ll hear from Daniel a few times a month, notes on Circles, practices,
        and events. Every email has a one-click unsubscribe if it ever stops being worth your inbox.
      </Outcome>
    )
  }

  return (
    <Outcome
      title={<>Confirm your subscription.</>}
      action={
        <>
          <button
            type="button"
            onClick={onConfirm}
            disabled={status === 'loading'}
            className={buttonClasses({ className: 'disabled:opacity-60' })}
          >
            {status === 'loading' ? 'One sec…' : 'Confirm subscription'}
          </button>
          {error && (
            <p className="mt-4 text-body-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </>
      }
    >
      One tap and you&apos;re on the list. You&apos;ll hear from Daniel a few times a month, notes on
      Circles, practices, and events.
    </Outcome>
  )
}

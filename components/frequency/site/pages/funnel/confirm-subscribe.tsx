'use client'

// The /subscribe/confirm button on the Frequency design. The SAME affirmative confirm as
// app/(marketing)/subscribe/confirm/confirm-button.tsx: consent flips on THIS click (the confirmSubscribe
// POST re-verifies the token), never on page load, so a link scanner opening the email cannot subscribe
// anyone.

import { useState } from 'react'
import { confirmSubscribe } from '@/app/(marketing)/subscribe/confirm/actions'
import { FnOutcome } from './parts'

export function FrequencyConfirmSubscribe({ e, x, t }: { e: string; x: string; t: string }) {
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
      <FnOutcome
        as="h1"
        role="status"
        tone="success"
        icon="check"
        title="You're on the list."
        action={{ href: '/', label: 'Back to Frequency' }}
      >
        That&apos;s it. You&apos;ll hear from Daniel a few times a month, notes on Circles, practices, and events.
        Every email has a one-click unsubscribe if it ever stops being worth your inbox.
      </FnOutcome>
    )
  }

  return (
    <FnOutcome
      as="h1"
      icon="send"
      title="Confirm your subscription."
      action={
        <>
          <div className="ctas">
            <button className="btn fq-iri-btn" type="button" onClick={onConfirm} disabled={status === 'loading'}>
              {status === 'loading' ? 'One sec…' : 'Confirm subscription'}
            </button>
          </div>
          {error && (
            <p className="jx-err" role="alert">
              {error}
            </p>
          )}
        </>
      }
    >
      One tap and you&apos;re on the list. You&apos;ll hear from Daniel a few times a month, notes on Circles,
      practices, and events.
    </FnOutcome>
  )
}

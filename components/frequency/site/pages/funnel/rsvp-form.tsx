'use client'

// The public RSVP form (ADR-154) on the Frequency design. The SAME behaviour as
// app/(marketing)/rsvp/[token]/form.tsx: the inviter and the event ride the signed token only, which goes
// back to submitEventGuest untouched (the server re-verifies it); one calm confirmation for everyone; no
// mailing-list sign-up rides on an RSVP.

import { useState } from 'react'
import { submitEventGuest } from '@/app/(marketing)/rsvp/[token]/actions'
import type { GuestRsvpStatus } from '@/lib/events/guests'
import { Input } from '@/components/ui/field'
import { FnOutcome } from './parts'

const OPTIONS: { value: GuestRsvpStatus; label: string }[] = [
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'declined', label: 'Can’t make it' },
]

export function FrequencyRsvpForm({ token }: { token: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [rsvp, setRsvp] = useState<GuestRsvpStatus>('going')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    const res = await submitEventGuest({ token, displayName: name, email, phone, rsvpStatus: rsvp })
    if (res.ok) {
      setStatus('done')
    } else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <FnOutcome
        role="status"
        tone="success"
        icon="check"
        title="You’re on the list."
        action={{ href: '/', label: 'See what Frequency is' }}
      >
        The host has your RSVP. They’ll be in touch with the details.
      </FnOutcome>
    )
  }

  return (
    <form className="fn-box jx-f" onSubmit={onSubmit}>
      <label htmlFor="fn-rsvp-name">
        Your name
        <Input
          id="fn-rsvp-name"
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label htmlFor="fn-rsvp-email">
        Email
        <Input
          id="fn-rsvp-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label htmlFor="fn-rsvp-phone">
        <span>
          Phone <span className="fn-opt">(optional)</span>
        </span>
        <Input
          id="fn-rsvp-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <fieldset className="jx-lab fn-fs">
        <legend>Can you make it?</legend>
        <span className="jx-chips">
          {OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={rsvp === o.value} onClick={() => setRsvp(o.value)}>
              {o.label}
            </button>
          ))}
        </span>
      </fieldset>
      <button className="btn fq-iri-btn" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'One sec…' : 'Send RSVP'}
      </button>
      {error && (
        <p className="jx-err" role="alert">
          {error}
        </p>
      )}
      <p className="jx-fine">
        We’ll pass your RSVP to the host. No spam, and we won’t add you to any mailing list unless you ask.
      </p>
    </form>
  )
}

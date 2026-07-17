'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { submitEventGuest } from './actions'
import type { GuestRsvpStatus } from '@/lib/events/guests'

const OPTIONS: { value: GuestRsvpStatus; label: string }[] = [
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'declined', label: 'Can’t make it' },
]

// The public capture form. The inviter + event are NOT in this component — they ride the
// signed token, resolved server-side. We send the token back untouched; the server never
// trusts anything else. On success we show one calm confirmation, identical for everyone.
export function RsvpForm({ token }: { token: string }) {
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
      <div role="status" className="text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-success-bg text-success flex items-center justify-center mb-6">
          <Check className="w-7 h-7" strokeWidth={2.5} aria-hidden />
        </div>
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-4">You’re on the list.</h2>
        <p className="text-lg text-muted leading-relaxed mb-8">
          The host has your RSVP. They’ll be in touch with the details.
        </p>
        <Link
          href="/"
          className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
        >
          See what Frequency is
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label htmlFor="rsvp-name" className="block text-sm font-bold text-text mb-1.5">
          Your name
        </label>
        <input
          id="rsvp-name"
          type="text"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="rsvp-email" className="block text-sm font-bold text-text mb-1.5">
          Email
        </label>
        <input
          id="rsvp-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="rsvp-phone" className="block text-sm font-bold text-text mb-1.5">
          Phone <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="rsvp-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text focus:border-primary focus:outline-none"
        />
      </div>
      <fieldset>
        <legend className="block text-sm font-bold text-text mb-1.5">Can you make it?</legend>
        <div className="flex gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setRsvp(o.value)}
              aria-pressed={rsvp === o.value}
              className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-bold transition-colors ${
                rsvp === o.value
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border bg-surface text-text hover:border-primary'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? 'One sec…' : 'Send RSVP'}
      </button>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-muted leading-relaxed">
        We’ll pass your RSVP to the host. No spam, and we won’t add you to any mailing list unless you
        ask.
      </p>
    </form>
  )
}

'use client'

import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { reserveFoundingSpot, type FounderTier } from '@/app/(marketing)/founders/actions'

// The three founding tiers, in order. `note` is the one-line plain description;
// `price` is display only (no charge happens here, reserving is free).
const TIERS: { id: FounderTier; label: string; price: string; note: string }[] = [
  { id: 'supporter', label: 'Founding Supporter', price: '$25', note: 'Believe in it, get in early.' },
  { id: 'member', label: 'Founding Member', price: '$250', note: 'The core founding offer, locked for life.' },
  { id: 'patron', label: 'Founding Patron', price: '$1,000', note: 'Go all in.' },
]

// The waitlist reservation form. A tier selector + email (name optional). On
// success it shows the "check your email to confirm your spot" state. It calls
// reserveFoundingSpot, which records a lead and queues a confirm email. NOTHING
// charges here, there is no card field and no payment step.
export function FoundersReserveForm({ defaultTier = 'member' }: { defaultTier?: FounderTier }) {
  const [tier, setTier] = useState<FounderTier>(defaultTier)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'already'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    const res = await reserveFoundingSpot({ email, name, tier })
    if (res.ok) {
      setStatus(res.already ? 'already' : 'done')
    } else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done' || status === 'already') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-success-bg text-success flex items-center justify-center mb-4">
          <Check className="w-6 h-6" strokeWidth={2.5} />
        </div>
        <h3 className="font-display uppercase text-text text-3xl mb-2">
          {status === 'already' ? 'Your spot is held' : 'Check your email to confirm your spot'}
        </h3>
        <p className="text-base text-muted leading-relaxed">
          {status === 'already'
            ? "You're already confirmed. We saved your founding tier and we'll be in touch when founding checkout opens, at the locked founder price."
            : `We just emailed ${email}. Click the link in it to confirm your founding spot. No charge yet, you're reserving, not paying.`}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-7 sm:p-8 shadow-sm text-left">
      {/* Tier selector */}
      <fieldset>
        <legend className="block text-sm font-semibold text-text mb-2">Choose your tier</legend>
        <div className="space-y-2.5">
          {TIERS.map((t) => {
            const active = tier === t.id
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  active ? 'border-primary bg-primary-bg/50' : 'border-border bg-surface hover:border-border-strong'
                }`}
              >
                <input
                  type="radio"
                  name="founder-tier"
                  value={t.id}
                  checked={active}
                  onChange={() => setTier(t.id)}
                  className="mt-1 accent-primary"
                />
                <span className="flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-bold text-text">{t.label}</span>
                    <span className="text-sm font-bold text-primary-strong">{t.price}</span>
                  </span>
                  <span className="block text-sm text-muted leading-snug mt-0.5">{t.note}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="founder-name" className="block text-sm font-semibold text-text mb-1.5">
            First name <span className="font-normal text-subtle">(optional)</span>
          </label>
          <input
            id="founder-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle focus:border-border-strong outline-none transition-colors"
            placeholder="Alex"
          />
        </div>
        <div>
          <label htmlFor="founder-email" className="block text-sm font-semibold text-text mb-1.5">
            Email
          </label>
          <input
            id="founder-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle focus:border-border-strong outline-none transition-colors"
            placeholder="you@email.com"
          />
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? 'Reserving your spot...' : 'Reserve my Founding spot'}
        {status !== 'loading' && <ArrowRight className="w-4 h-4" />}
      </button>

      <p className="mt-4 text-xs text-subtle leading-relaxed text-center">
        Free to reserve. No card, no charge. We&apos;ll email you to confirm your spot.
      </p>
    </form>
  )
}

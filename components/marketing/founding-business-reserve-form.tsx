'use client'

import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { reserveFoundingBusiness } from '@/app/(marketing)/founders/business/actions'

// The Founding Business waitlist reservation form (ADR-599). Business name + city + email. On success
// it shows the "check your email to confirm your spot" state. It calls reserveFoundingBusiness, which
// records a lead and queues a confirm email. NOTHING charges here: there is no card field and no
// payment step. A card is optional and, if ever collected, is only charged at graduation.
export function FoundingBusinessReserveForm() {
  const [businessName, setBusinessName] = useState('')
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'already'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    const res = await reserveFoundingBusiness({ email, businessName, city })
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
            ? "You're already confirmed. We saved your founding business spot and we'll be in touch when founding checkout opens, at the locked founder rate."
            : `We just emailed ${email}. Click the link in it to confirm your founding business spot. No charge yet, you're reserving, not paying.`}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-7 sm:p-8 shadow-sm text-left">
      <div className="space-y-4">
        <div>
          <label htmlFor="fb-name" className="block text-sm font-semibold text-text mb-1.5">
            Business name
          </label>
          <input
            id="fb-name"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            autoComplete="organization"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle focus:border-border-strong outline-none transition-colors"
            placeholder="Your business"
          />
        </div>
        <div>
          <label htmlFor="fb-city" className="block text-sm font-semibold text-text mb-1.5">
            City
          </label>
          <input
            id="fb-city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle focus:border-border-strong outline-none transition-colors"
            placeholder="Where you operate"
          />
        </div>
        <div>
          <label htmlFor="fb-email" className="block text-sm font-semibold text-text mb-1.5">
            Email
          </label>
          <input
            id="fb-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle focus:border-border-strong outline-none transition-colors"
            placeholder="you@business.com"
          />
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? 'Reserving your spot...' : 'Reserve our Founding spot'}
        {status !== 'loading' && <ArrowRight className="w-4 h-4" />}
      </button>

      <p className="mt-4 text-xs text-subtle leading-relaxed text-center">
        Free to reserve. No card, no charge. We&apos;ll email you to confirm your spot.
      </p>
    </form>
  )
}

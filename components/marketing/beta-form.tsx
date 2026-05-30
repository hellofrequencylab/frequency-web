'use client'

import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { requestBetaAccess } from '@/app/(marketing)/beta/actions'

export function BetaForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'already'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    const res = await requestBetaAccess({ email, name })
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
          {status === 'already' ? "You're already on the list" : 'Check your inbox'}
        </h3>
        <p className="text-base text-muted leading-relaxed">
          {status === 'already'
            ? "Good news, you're confirmed and on the waitlist. We'll be in touch when a spot opens."
            : `We just emailed ${email}. Click the link in it to confirm your spot, and you're on the list.`}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-7 sm:p-8 shadow-sm text-left">
      <div className="space-y-4">
        <div>
          <label htmlFor="beta-name" className="block text-sm font-semibold text-text mb-1.5">
            First name <span className="font-normal text-subtle">(optional)</span>
          </label>
          <input
            id="beta-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle focus:border-primary outline-none transition-colors"
            placeholder="Alex"
          />
        </div>
        <div>
          <label htmlFor="beta-email" className="block text-sm font-semibold text-text mb-1.5">
            Email
          </label>
          <input
            id="beta-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle focus:border-primary outline-none transition-colors"
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
        {status === 'loading' ? 'Adding you…' : 'Join the Beta'}
        {status !== 'loading' && <ArrowRight className="w-4 h-4" />}
      </button>

      <p className="mt-4 text-xs text-subtle leading-relaxed text-center">
        We&apos;ll email you to confirm. No spam, just an invite when a spot opens.
      </p>
    </form>
  )
}

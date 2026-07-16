'use client'

import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { requestSubscribe } from '@/app/(marketing)/subscribe/actions'

export function SubscribeForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    const res = await requestSubscribe({ email, name })
    if (res.ok) {
      // ONE success state for every outcome (anti-enumeration): we never reveal whether the
      // address was new, already subscribed, or opted out.
      setStatus('done')
    } else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm" role="status">
        <div className="mx-auto w-12 h-12 rounded-full bg-success-bg text-success flex items-center justify-center mb-4">
          <Check className="w-6 h-6" strokeWidth={2.5} aria-hidden />
        </div>
        <h3 className="font-display uppercase text-text text-3xl mb-2">Check your inbox</h3>
        <p className="text-base text-muted leading-relaxed">
          {email
            ? `If ${email} can get mail from us, a confirm link is on its way. Click it and you're on the list.`
            : "If that address can get mail from us, a confirm link is on its way. Click it and you're on the list."}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-7 sm:p-8 shadow-sm text-left">
      <div className="space-y-4">
        <div>
          <label htmlFor="subscribe-name" className="block text-sm font-semibold text-text mb-1.5">
            First name <span className="font-normal text-subtle">(optional)</span>
          </label>
          <input
            id="subscribe-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle focus:border-border-strong outline-none transition-colors"
            placeholder="Alex"
          />
        </div>
        <div>
          <label htmlFor="subscribe-email" className="block text-sm font-semibold text-text mb-1.5">
            Email
          </label>
          <input
            id="subscribe-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-describedby={error ? 'subscribe-error' : undefined}
            aria-invalid={error ? true : undefined}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle focus:border-border-strong outline-none transition-colors"
            placeholder="you@email.com"
          />
        </div>
      </div>

      {error && (
        <p id="subscribe-error" className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors disabled:opacity-60"
      >
        {status === 'loading' ? 'Sending the link…' : 'Send me the confirm link'}
        {status !== 'loading' && <ArrowRight className="w-4 h-4" aria-hidden />}
      </button>

      <p className="mt-4 text-xs text-subtle leading-relaxed text-center">
        We&apos;ll email you to confirm it&apos;s really you. That&apos;s the only way onto the list.
      </p>
    </form>
  )
}

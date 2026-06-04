'use client'

import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { requestBetaAccess } from '@/app/(marketing)/beta/actions'

// Compact inline beta capture for the /discover page. Same double-opt-in funnel
// as the marketing BetaForm (requestBetaAccess), with a `source` tag for
// attribution — but rendered inline so we don't bounce a warm visitor to /beta.
export function InlineBetaCapture({
  source = 'discover_inline',
  heading = 'Get an invite',
  body = 'Join the beta: we open to a small group at a time. No spam, just an invite when a spot opens near you.',
}: {
  source?: string
  heading?: string
  body?: string
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'already'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    const res = await requestBetaAccess({ email, name, source })
    if (res.ok) {
      setStatus(res.already ? 'already' : 'done')
    } else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done' || status === 'already') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-success-bg text-success">
          <Check className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <h3 className="text-lg font-semibold text-text">
          {status === 'already' ? "You're already on the list" : 'Check your inbox'}
        </h3>
        <p className="mt-1 text-sm text-muted leading-relaxed">
          {status === 'already'
            ? "You're confirmed and on the waitlist. We'll be in touch when a spot opens."
            : `We just emailed ${email}. Click the link to confirm your spot.`}
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-surface p-6 shadow-sm text-left"
    >
      <h3 className="text-lg font-semibold text-text">{heading}</h3>
      <p className="mt-1 mb-4 text-sm text-muted leading-relaxed">{body}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          aria-label="First name (optional)"
          placeholder="First name"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle outline-none transition-colors focus:border-primary sm:w-1/3"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-label="Email"
          placeholder="you@email.com"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text placeholder:text-subtle outline-none transition-colors focus:border-primary"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {status === 'loading' ? 'Adding…' : 'Join the Beta'}
          {status !== 'loading' && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </form>
  )
}

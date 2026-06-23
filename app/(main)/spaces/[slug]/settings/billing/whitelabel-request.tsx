'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Loader2, BadgeCheck } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { requestWhitelabel } from './actions'

// WHITE-LABEL REQUEST (client, Pricing P3, ADR-364). White-label is the deliberately-expensive door
// ($2,000 setup + a monthly fee): it is sold high-touch by a human, NOT a self-serve Stripe checkout
// (network-effect strategy). So this is a LEAD form: it records the interest (-> requestWhitelabel ->
// a `contacts` lead) and tells the owner a human will follow up. No charge, no checkout. No em dashes.

export function WhitelabelRequest({
  slug,
  monthly,
  setup,
  isWhitelabel,
  defaultEmail,
}: {
  slug: string
  monthly: string | null
  setup: string | null
  isWhitelabel: boolean
  defaultEmail: string
}) {
  const [email, setEmail] = useState(defaultEmail)
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // A space already on white-label does not need to request it.
  if (isWhitelabel) {
    return (
      <div className="rounded-2xl border border-signal/30 bg-signal-bg/20 px-5 py-4">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-signal-strong" aria-hidden />
          <p className="text-sm font-bold text-text">Your space is on White-label.</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Your branding is yours. Reach out any time if you want to change anything.
        </p>
      </div>
    )
  }

  function submit() {
    setError(null)
    start(async () => {
      const result = await requestWhitelabel(slug, { email: email.trim(), note: note.trim() || undefined })
      if (isError(result)) {
        setError(result.error)
        return
      }
      setDone(true)
    })
  }

  const priceLine = [setup ? `${setup} to set up` : null, monthly ? `${monthly} a month` : null]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="rounded-2xl border border-signal/30 bg-signal-bg/20 p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-signal-bg/60">
          <Sparkles className="h-4 w-4 text-signal-strong" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-text">Want your own brand? Ask about White-label</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Run Frequency under your own name and look.{priceLine ? ` It is ${priceLine}.` : ''} We set
            this up with you, so leave your email and a human will be in touch.
          </p>

          {done ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-success/30 bg-success-bg px-4 py-3">
              <BadgeCheck className="h-4 w-4 text-success" aria-hidden />
              <p className="text-sm font-semibold text-success">Thanks. We will be in touch soon.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything you want us to know? (optional)"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
              />
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-signal/40 bg-signal-bg/40 px-4 py-2.5 text-sm font-bold text-signal-strong transition-colors hover:bg-signal-bg/60 disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {pending ? 'Sending' : 'Request white-label'}
              </button>
              {error && (
                <p className="text-2xs font-medium text-danger" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

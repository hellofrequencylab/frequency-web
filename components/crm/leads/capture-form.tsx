'use client'

import { useState } from 'react'
import { ArrowRight, Check, ExternalLink } from 'lucide-react'

// The shared client form behind the public capture doors 3 to 5 (event / lead magnet / share-back).
// One anti-enumeration, honeypot-guarded form; each door passes its own bound server action, submit
// label, and consent note, and gets a custom success reveal (a resource link, a reciprocal card, or
// just a thank-you). Door 2 (warm-intro accept) is a one-tap confirm, not this form.

/** What a door's server action returns. Success may reveal a link (unlock) or a card (share-back). */
export type CaptureSubmitResult =
  | {
      ok: true
      heading?: string
      message?: string
      /** A resource to open (the consent-native unlock). */
      link?: { href: string; label: string }
      /** The other party's card to hand back (the reciprocal share-back). */
      card?: { name: string; lines: string[]; href?: string; hrefLabel?: string }
    }
  | { ok: false; error: string }

export type CaptureSubmit = (input: {
  token: string
  name: string
  email: string
  phone: string
  /** Honeypot — bots fill it, humans never see it. */
  company: string
}) => Promise<CaptureSubmitResult>

export function CaptureForm({
  token,
  submit,
  submitLabel,
  consentNote,
  showPhone = false,
  namePlaceholder = 'Your name',
}: {
  token: string
  submit: CaptureSubmit
  submitLabel: string
  consentNote?: React.ReactNode
  showPhone?: boolean
  namePlaceholder?: string
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Extract<CaptureSubmitResult, { ok: true }> | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    const res = await submit({ token, name, email, phone, company })
    if (res.ok) {
      setResult(res)
      setStatus('done')
    } else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done' && result) {
    return (
      <div className="text-center" role="status">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success">
          <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
        </div>
        <h3 className="text-2xl font-bold text-text">{result.heading ?? "You're all set."}</h3>
        {result.message && <p className="mt-2 text-sm leading-relaxed text-muted">{result.message}</p>}
        {result.link && (
          <a
            href={result.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-base font-bold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {result.link.label}
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
        {result.card && (
          <div className="mt-5 rounded-xl border border-border bg-canvas p-5 text-left">
            <p className="text-base font-bold text-text">{result.card.name}</p>
            {result.card.lines.map((line, i) => (
              <p key={i} className="mt-1 text-sm text-muted">
                {line}
              </p>
            ))}
            {result.card.href && (
              <a
                href={result.card.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline"
              >
                {result.card.hrefLabel ?? 'Open their page'}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="text-left">
      <div className="space-y-4">
        <div>
          <label htmlFor="cap-name" className="mb-1.5 block text-sm font-semibold text-text">
            Name
          </label>
          <input
            id="cap-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text outline-none transition-colors placeholder:text-subtle focus:border-border-strong"
            placeholder={namePlaceholder}
          />
        </div>
        <div>
          <label htmlFor="cap-email" className="mb-1.5 block text-sm font-semibold text-text">
            Email
          </label>
          <input
            id="cap-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-describedby={error ? 'cap-error' : undefined}
            aria-invalid={error ? true : undefined}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text outline-none transition-colors placeholder:text-subtle focus:border-border-strong"
            placeholder="you@email.com"
          />
        </div>
        {showPhone && (
          <div>
            <label htmlFor="cap-phone" className="mb-1.5 block text-sm font-semibold text-text">
              Phone <span className="font-normal text-subtle">(optional)</span>
            </label>
            <input
              id="cap-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text outline-none transition-colors placeholder:text-subtle focus:border-border-strong"
              placeholder="(555) 555-0134"
            />
          </div>
        )}
      </div>

      {/* Honeypot: off-screen, never announced, never tab-reachable. A filled value = a bot. */}
      <div aria-hidden className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="cap-company">Company</label>
        <input
          id="cap-company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      {error && (
        <p id="cap-error" className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-3.5 text-base font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {status === 'loading' ? 'One sec…' : submitLabel}
        {status !== 'loading' && <ArrowRight className="h-4 w-4" aria-hidden />}
      </button>

      {consentNote && <div className="mt-4 text-xs leading-relaxed text-subtle">{consentNote}</div>}
    </form>
  )
}

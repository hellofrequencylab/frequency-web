'use client'

// The public lead-capture doors (/checkin, /exchange, /intro, /unlock: front doors 2 to 5) on the Frequency
// design. components/crm/leads/capture-shell.tsx, capture-form.tsx and app/(capture)/intro/intro-accept.tsx
// hand off to these under SITE_DESIGN 'frequency', so the four routes and their server actions are
// untouched. The behaviour is the DAWN one, line for line:
//   · each door's bound server action, submit label and consent note are passed in unchanged; the form
//     sends the token back untouched and the server re-verifies it;
//   · the honeypot field is off-screen, never announced and never tab-reachable;
//   · ONE success state per door (anti-enumeration), revealing only what the action returns: a resource
//     link (unlock), the other party's card (share-back), or a thank-you;
//   · the warm intro is a one-tap AFFIRMATIVE confirm: nothing flips on page load, and "No thanks" is a
//     plain link that does nothing.
// No consent box anywhere, and certainly not a pre-ticked one: the unlock door's consent is the visible
// note beside the button, as on DAWN (lib/entity-blocks/block-content.ts, CONTACT FORM notes).

import { useState } from 'react'
import Link from 'next/link'
import type { CaptureSubmit, CaptureSubmitResult } from '@/components/crm/leads/capture-form'
import { acceptIntro } from '@/app/(capture)/intro/actions'
import { Input } from '@/components/ui/field'
import { FnStage } from './parts'

/** The door's frame: the kicker, the h1, one line, then the form or the confirm. */
export function FrequencyCaptureShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <FnStage>
      <div className="fn-box">
        {eyebrow && <span className="fn-k">{eyebrow}</span>}
        <h1 className="fn-h1">{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
    </FnStage>
  )
}

export function FrequencyCaptureForm({
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
      <div className="fn-done" role="status">
        <h2>{result.heading ?? "You're all set."}</h2>
        {result.message && <p>{result.message}</p>}
        {result.link && (
          <a className="btn fq-iri-btn" href={result.link.href} target="_blank" rel="noopener noreferrer">
            {result.link.label} ↗
          </a>
        )}
        {result.card && (
          <div className="fn-card">
            <b>{result.card.name}</b>
            {result.card.lines.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
            {result.card.href && (
              <a href={result.card.href} target="_blank" rel="noopener noreferrer">
                {result.card.hrefLabel ?? 'Open their page'} ↗
              </a>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <form className="jx-f" onSubmit={onSubmit}>
      <label htmlFor="fn-cap-name">
        Name
        <Input
          id="fn-cap-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder={namePlaceholder}
        />
      </label>
      <label htmlFor="fn-cap-email">
        Email
        <Input
          id="fn-cap-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-describedby={error ? 'fn-cap-error' : undefined}
          aria-invalid={error ? true : undefined}
          placeholder="you@email.com"
        />
      </label>
      {showPhone && (
        <label htmlFor="fn-cap-phone">
          <span>
            Phone <span className="fn-opt">(optional)</span>
          </span>
          <Input
            id="fn-cap-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="(555) 555-0134"
          />
        </label>
      )}

      {/* Honeypot: off-screen, never announced, never tab-reachable. A filled value = a bot. */}
      <div aria-hidden className="fn-hp">
        <label htmlFor="fn-cap-company">Company</label>
        <Input
          id="fn-cap-company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      {error && (
        <p id="fn-cap-error" className="jx-err" role="alert">
          {error}
        </p>
      )}

      <button className="btn fq-iri-btn" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'One sec…' : `${submitLabel} →`}
      </button>

      {consentNote && <div className="jx-fine fn-consent">{consentNote}</div>}
    </form>
  )
}

/** The warm-intro one-tap confirm (the double opt-in). */
export function FrequencyIntroAccept({ token, spaceName }: { token: string; spaceName: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onAccept() {
    setError(null)
    setStatus('loading')
    const res = await acceptIntro(token)
    if (res.ok) {
      setStatus('done')
    } else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="fn-done" role="status">
        <h2>You&apos;re connected.</h2>
        <p>
          {spaceName} can reach you now. Every email has a one-click unsubscribe if it ever stops being worth your
          inbox.
        </p>
        <Link className="btn fq-iri-btn" href="/">
          Explore Frequency
        </Link>
      </div>
    )
  }

  return (
    <div className="fn-done">
      <button className="btn fq-iri-btn" type="button" onClick={onAccept} disabled={status === 'loading'}>
        {status === 'loading' ? 'One sec…' : 'Yes, keep me posted'}
      </button>
      <Link className="btn btn-ghost" href="/">
        No thanks
      </Link>
      {error && (
        <p className="jx-err" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

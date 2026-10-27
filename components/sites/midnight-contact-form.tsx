'use client'

import { useState } from 'react'
import { Field, Input, Textarea } from '@/components/ui/field'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE MIDNIGHT CONTACT FORM (House of Fates design, the Contact page). First name, email and a comment, through the
// same anonymous lead door as the Contact form (the Space resolved from the slug server-side, a honeypot and a
// rate limit above the write). A null slug is the editor's preview: the same markup, inert. Sending swaps the form
// for the thank-you in place.

export function MidnightContactForm({ slug, buttonLabel, successTitle, successBody }: { slug: string | null; buttonLabel: string; successTitle: string; successBody: string }) {
  const [first, setFirst] = useState('')
  const [email, setEmail] = useState('')
  const [comment, setComment] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (slug === null || status === 'loading') return
    setError(null)
    setStatus('loading')
    try {
      const res = await submitContactForm({ slug, name: first.trim(), email, phone: '', message: comment.trim(), optIn: false, company })
      if (res.ok) setStatus('done')
      else {
        setError(res.error)
        setStatus('idle')
      }
    } catch {
      setError('That did not send. Check your connection and try again.')
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="mn-contact-done" role="status">
        <p className="mn-display mn-display--sent">
          {successTitle} <em>{successBody}</em>
        </p>
      </div>
    )
  }

  const off = slug === null
  return (
    <form className="mn-contact-form" onSubmit={onSubmit}>
      <div className="mn-contact-pair">
        <Field label="First name">
          <Input type="text" required autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} disabled={off} />
        </Field>
        <Field label="Email">
          <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={off} />
        </Field>
      </div>
      <Field label="Comment">
        <Textarea rows={6} required value={comment} onChange={(e) => setComment(e.target.value)} disabled={off} />
      </Field>
      <Input className="mn-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <div>
        <button type="submit" className="hs-btn hs-btn-primary hs-btn--lg" disabled={off || status === 'loading'}>{status === 'loading' ? 'Sending' : buttonLabel || 'Send'}</button>
      </div>
      {error && <p className="mn-letter-error" role="alert">{error}</p>}
    </form>
  )
}

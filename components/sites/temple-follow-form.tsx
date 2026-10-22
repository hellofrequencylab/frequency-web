'use client'

import { useState } from 'react'
import { Field, Input } from '@/components/ui/field'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE TEMPLE'S FOLLOW FORM (design: the follow band). One email field and one button; pressing Follow is the
// visitor's own opt-in to the house's announcements, so it goes through the same anonymous lead door as the
// Contact form (the Space resolved from the slug server-side, a honeypot and a rate limit above the write).
// A null slug is the editor's preview: the same markup, inert.

export function TempleFollowForm({ slug, placeholder, buttonLabel, successMessage }: { slug: string | null; placeholder: string; buttonLabel: string; successMessage: string }) {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (slug === null || status === 'loading') return
    setError(null)
    setStatus('loading')
    try {
      const res = await submitContactForm({ slug, name: '', email, phone: '', message: '', optIn: true, company })
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

  if (status === 'done') return <p className="tt-follow-done" role="status">{successMessage || 'You follow the house.'}</p>

  return (
    <form className="tt-follow-form" onSubmit={onSubmit}>
      <Field label="Email" className="tt-follow-field" labelClassName="sr-only">
        <Input type="email" required autoComplete="email" placeholder={placeholder} value={email} onChange={(e) => setEmail(e.target.value)} disabled={slug === null} />
      </Field>
      <Input className="tt-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <button type="submit" className="hs-btn hs-btn-dark" disabled={slug === null || status === 'loading'}>{status === 'loading' ? 'Following' : buttonLabel || 'Follow'}</button>
      {error && <p className="tt-follow-error" role="alert">{error}</p>}
    </form>
  )
}

'use client'

import { useState } from 'react'
import { Field, Input } from '@/components/ui/field'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE TEMPLE KIT LETTER FORM (design: the footer's Subscribe row). One email field and one button; pressing Subscribe is the
// visitor's own opt-in to the letter, so it goes through the same anonymous lead door as the Contact form (the Space resolved
// from the slug server-side, a honeypot and a rate limit above the write). A null slug is the editor's preview: the same markup,
// inert. The field is ui/field's Input, so its error state (aria-invalid) is the design's danger border and hint.

export function TempleKitLetterForm({ slug, label, placeholder, buttonLabel, successMessage }: { slug: string | null; label: string; placeholder: string; buttonLabel: string; successMessage: string }) {
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

  if (status === 'done') return <p className="tk-letter-done" role="status">{successMessage}</p>

  return (
    <form className="tk-letter-form" onSubmit={onSubmit}>
      <Field label={label} className="tk-letter-field" error={error ?? undefined}>
        <Input type="email" required autoComplete="email" placeholder={placeholder} value={email} aria-invalid={error ? true : undefined} onChange={(e) => setEmail(e.target.value)} disabled={slug === null} />
      </Field>
      <Input className="tk-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <button type="submit" className="hs-btn hs-btn-primary" disabled={slug === null || status === 'loading'}>{status === 'loading' ? 'Subscribing' : buttonLabel}</button>
    </form>
  )
}

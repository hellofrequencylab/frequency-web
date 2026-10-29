'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/field'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE NETWORK KIT LETTER FORM (design: the letter block). One email field and one button; pressing Subscribe is the
// visitor's own opt-in to the letter, so it goes through the same anonymous lead door as the Contact form (the Space
// resolved from the slug server-side, a honeypot and a rate limit above the write). A null slug is the editor's
// preview: the same markup, inert. The thank-you line is the owner's own words and promises no day or rhythm.

export function NetworkKitLetterForm({ slug, placeholder, buttonLabel, successMessage }: { slug: string | null; placeholder: string; buttonLabel: string; successMessage: string }) {
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

  if (status === 'done') return <p className="nk-letter-done" role="status">{successMessage || 'Thanks. You are on the list.'}</p>

  return (
    <form className="nk-letter-form" onSubmit={onSubmit}>
      <Input className="nk-input" type="email" aria-label="Email" required autoComplete="email" placeholder={placeholder} value={email} onChange={(e) => setEmail(e.target.value)} disabled={slug === null} />
      <Input className="nk-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <button type="submit" className="nk-btn nk-btn--lg" disabled={slug === null || status === 'loading'}>{status === 'loading' ? 'Subscribing' : buttonLabel || 'Subscribe'}</button>
      {error && <p className="nk-letter-error" role="alert">{error}</p>}
    </form>
  )
}

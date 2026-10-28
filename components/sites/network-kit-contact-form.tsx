'use client'

import { useState } from 'react'
import { Input, Textarea } from '@/components/ui/field'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE NETWORK KIT CONTACT FORM (design: the contact block). A name, an email, a message and one unticked box: the
// box is the visitor's own opt-in to hear about what is on, and nothing is mailable without it. It goes through the
// same anonymous lead door as the letter form and the Contact page (the Space resolved from the slug server-side, a
// honeypot and a rate limit above the write). A null slug is the editor's preview: the same markup, inert.

export function NetworkKitContactForm({ slug, buttonLabel, successMessage }: { slug: string | null; buttonLabel: string; successMessage: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (slug === null || status === 'loading') return
    setError(null)
    setStatus('loading')
    try {
      const res = await submitContactForm({ slug, name, email, phone: '', message, optIn, company })
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

  if (status === 'done') return <p className="nk-letter-done" role="status">{successMessage || 'Thanks. We will be in touch.'}</p>

  return (
    <form className="nk-contact-form" onSubmit={onSubmit}>
      <label className="nk-field"><span>Your name</span><Input className="nk-input" type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={slug === null} /></label>
      <label className="nk-field"><span>Email</span><Input className="nk-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={slug === null} /></label>
      <label className="nk-field"><span>Your message</span><Textarea className="nk-input nk-textarea" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} disabled={slug === null} /></label>
      <label className="nk-check"><input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} disabled={slug === null} /><span>Email me about what is happening</span></label>
      <Input className="nk-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <div><button type="submit" className="nk-btn" disabled={slug === null || status === 'loading'}>{status === 'loading' ? 'Sending' : buttonLabel || 'Send'}</button></div>
      {error && <p className="nk-letter-error" role="alert">{error}</p>}
    </form>
  )
}

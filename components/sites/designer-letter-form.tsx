'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/field'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE DESIGNER LETTER FORM (design: the footer's Subscribe). One email field and a Sign Up button in a single
// rounded well; pressing it is the visitor's own opt-in, so it goes through the same anonymous lead door as the
// Contact form (the Space resolved from the slug server-side, a honeypot and a rate limit above the write). A null
// slug is the editor's preview: the same markup, inert.

export function DesignerLetterForm({ slug, title, body, fine, button, placeholder, success }: { slug: string | null; title: string; body: string; fine: string; button: string; placeholder: string; success: string }) {
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

  return (
    <form className="dz-letter" onSubmit={onSubmit}>
      <h3>{title}</h3>
      {body && <p className="dz-letter-body">{body}</p>}
      {status === 'done' ? (
        <p className="dz-letter-done" role="status">{success}</p>
      ) : (
        <>
          <div className="dz-letter-well">
            <Input variant="seamless" className="dz-letter-input" type="email" required aria-label={placeholder} autoComplete="email" placeholder={placeholder} value={email} onChange={(e) => setEmail(e.target.value)} disabled={slug === null} />
            <button type="submit" disabled={slug === null || status === 'loading'}>{status === 'loading' ? 'Sending' : button}</button>
          </div>
          <Input variant="seamless" className="dz-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
          {fine && <span className="dz-letter-fine">{fine}</span>}
          {error && <span className="dz-letter-fine" role="alert">{error}</span>}
        </>
      )}
    </form>
  )
}

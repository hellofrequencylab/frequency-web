'use client'

import { useState } from 'react'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'

// THE FREE HUMAN BOOKING FORM (design: the Speaking section's "Bring Audrey to your gathering"). Name, email, the kind of
// gathering, and a note. It goes through the same anonymous lead door as the Contact form (the Space resolved from the slug
// server-side, a honeypot and a rate limit above the write); the kind is folded into the message so the owner reads it in one
// place. A null slug is the editor's preview: the same markup, inert.

export function FreeHumanBookingForm({ slug, kinds, submitLabel, note, successMessage }: { slug: string | null; kinds: string[]; submitLabel: string; note: string; successMessage: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [kind, setKind] = useState('')
  const [when, setWhen] = useState('')
  const [message, setMessage] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const off = slug === null

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (slug === null || status === 'loading') return
    setError(null)
    setStatus('loading')
    const body = [kind ? `Kind of gathering: ${kind}` : '', when.trim() ? `Date or season: ${when.trim()}` : '', message.trim()].filter(Boolean).join('\n\n')
    try {
      const res = await submitContactForm({ slug, name, email, phone: '', message: body, optIn: false, company })
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

  if (status === 'done') return <p className="fh-booking-done" role="status">{successMessage}</p>

  return (
    <form className="fh-booking" onSubmit={onSubmit}>
      <div className="fh-booking-grid">
        <label className="fh-field"><span className="fh-field-label">Your name</span><Input required autoComplete="name" placeholder="First name is fine" value={name} onChange={(e) => setName(e.target.value)} disabled={off} /></label>
        <label className="fh-field"><span className="fh-field-label">Email</span><Input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={off} /></label>
        {kinds.length > 0 && (
          <label className="fh-field">
            <span className="fh-field-label">Kind of gathering</span>
            <Select value={kind} onChange={(e) => setKind(e.target.value)} options={kinds} emptyLabel="Choose one" disabled={off} />
          </label>
        )}
        <label className="fh-field"><span className="fh-field-label">Date or season</span><Input placeholder="Spring 2027" value={when} onChange={(e) => setWhen(e.target.value)} disabled={off} /></label>
        <label className="fh-field" data-wide><span className="fh-field-label">Tell us about it</span><Textarea rows={3} placeholder="Who will be in the room?" value={message} onChange={(e) => setMessage(e.target.value)} disabled={off} /></label>
      </div>
      <Input className="fh-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <div className="fh-booking-foot">
        <button type="submit" className="hs-btn hs-btn-primary" disabled={off || status === 'loading'}>{status === 'loading' ? 'Sending' : submitLabel || 'Send'}</button>
        {note && <span className="fh-booking-note">{note}</span>}
      </div>
      {error && <p className="fh-booking-error" role="alert">{error}</p>}
    </form>
  )
}

'use client'

import { useState, type FormEvent } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE NEW WORLD FORMS (design: New World Blocks.jsx ContactBlock and LetterBlock). Both go through the Space's one anonymous lead
// door (the Space resolved from the slug server-side, a honeypot and a rate limit above the write), the same door the Network kit's
// forms use. The contact form's box is the visitor's own opt-in; pressing Join on the letter form is the opt-in. A null slug is the
// editor's preview: the same markup, inert. Thank-you lines are the owner's own words and promise no day or rhythm.

type Status = 'idle' | 'loading' | 'done'

function useLead() {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  async function send(slug: string | null, input: { name: string; email: string; message: string; optIn: boolean; company: string }) {
    if (slug === null || status === 'loading') return
    setError(null)
    setStatus('loading')
    try {
      const res = await submitContactForm({ slug, phone: '', ...input })
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
  return { status, error, send }
}

export function NewWorldContactForm({ slug, buttonLabel, successMessage }: { slug: string | null; buttonLabel: string; successMessage: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [company, setCompany] = useState('')
  const { status, error, send } = useLead()
  const off = slug === null

  if (status === 'done') return <p className="nw-form-done" role="status">{successMessage || 'Thanks. A person will reply soon.'}</p>

  return (
    <form className="nw-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(slug, { name, email, message, optIn, company }) }}>
      <label className="nw-field"><span>Name</span><Input className="nw-input" type="text" required autoComplete="name" placeholder="Jamie Lee" value={name} onChange={(e) => setName(e.target.value)} disabled={off} /></label>
      <label className="nw-field"><span>Email</span><Input className="nw-input" type="email" required autoComplete="email" placeholder="jamie@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={off} /></label>
      <label className="nw-field nw-field--wide"><span>Message</span><Textarea className="nw-input nw-textarea" rows={4} placeholder="What can we help with?" value={message} onChange={(e) => setMessage(e.target.value)} disabled={off} /></label>
      <Checkbox wrapperClassName="nw-check nw-field--wide" label="Email me when something is coming up" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} disabled={off} />
      <Input className="nw-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <div className="nw-form-foot nw-field--wide">
        <span className="nw-form-note"><ShieldCheck size={15} aria-hidden="true" />Never shared.</span>
        <button type="submit" className="sv-btn sv-btn--accent" disabled={off || status === 'loading'}><span>{status === 'loading' ? 'Sending' : buttonLabel || 'Send'}</span><ArrowRight size={16} aria-hidden="true" /></button>
      </div>
      {error && <p className="nw-form-error nw-field--wide" role="alert">{error}</p>}
    </form>
  )
}

export function NewWorldLetterForm({ slug, placeholder, buttonLabel, successMessage }: { slug: string | null; placeholder: string; buttonLabel: string; successMessage: string }) {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const { status, error, send } = useLead()
  const off = slug === null

  if (status === 'done') return <p className="nw-form-done" role="status">{successMessage || 'Thanks. You are on the list.'}</p>

  return (
    <form className="nw-letter-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(slug, { name: '', email, message: '', optIn: true, company }) }}>
      <Input className="nw-input nw-input--pill" type="email" aria-label="Email" required autoComplete="email" placeholder={placeholder || 'you@email.com'} value={email} onChange={(e) => setEmail(e.target.value)} disabled={off} />
      <Input className="nw-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <button type="submit" className="sv-btn sv-btn--accent" disabled={off || status === 'loading'}><span>{status === 'loading' ? 'Joining' : buttonLabel || 'Join'}</span></button>
      {error && <p className="nw-form-error" role="alert">{error}</p>}
    </form>
  )
}

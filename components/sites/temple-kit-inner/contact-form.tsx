'use client'

import { useState } from 'react'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE TEMPLE KIT CONTACT FORM (design: the Contact page). Name, email, the date in mind, what they are interested
// in, what they are planning, and a phone-call switch, through the same anonymous lead door as the Contact form
// (the Space resolved from the slug server-side, a honeypot and a rate limit above the write). The choices are
// folded into the message so the owner reads them in one place. A null slug is the editor's preview: the same
// markup, inert. Sending swaps the form for the thank-you in place.

export function TempleKitContactForm({ slug, intro, topics, buttonLabel, successTitle, successBody }: { slug: string | null; intro: string; topics: string[]; buttonLabel: string; successTitle: string; successBody: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [date, setDate] = useState('')
  const [topic, setTopic] = useState(topics[0] ?? '')
  const [plan, setPlan] = useState('')
  const [call, setCall] = useState(false)
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (slug === null || status === 'loading') return
    setError(null)
    setStatus('loading')
    const message = [`Interested in: ${topic || 'not said'}`, `Date in mind: ${date.trim() || 'not said'}`, call ? 'Prefers a phone call' : '', `\n${plan.trim()}`].filter(Boolean).join('\n')
    try {
      const res = await submitContactForm({ slug, name: name.trim(), email, phone: '', message, optIn: false, company })
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
      <div className="tki-contact-done" role="status">
        <p className="tki-contact-done-title">
          {successTitle} <em>{successBody}</em>
        </p>
      </div>
    )
  }

  const off = slug === null
  return (
    <form className="tki-form" onSubmit={onSubmit}>
      {intro && <p className="tki-form-intro">{intro}</p>}
      <div className="tki-form-pair">
        <Field label="Name"><Input type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={off} /></Field>
        <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={off} /></Field>
      </div>
      <Field label="Date you have in mind"><Input type="text" value={date} onChange={(e) => setDate(e.target.value)} disabled={off} /></Field>
      {topics.length > 0 && <Field label="I'm interested in"><Select value={topic} onChange={(e) => setTopic(e.target.value)} options={topics} disabled={off} /></Field>}
      <Field label="What you're planning"><Textarea rows={5} required value={plan} onChange={(e) => setPlan(e.target.value)} disabled={off} /></Field>
      <label className="tki-switch">
        <input type="checkbox" role="switch" checked={call} onChange={(e) => setCall(e.target.checked)} disabled={off} />
        <span className="tki-switch-track" aria-hidden="true" />
        I&apos;d prefer a phone call
      </label>
      <Input className="tki-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <div>
        <button type="submit" className="hs-btn hs-btn-primary hs-btn--lg" disabled={off || status === 'loading'}>{status === 'loading' ? 'Sending' : buttonLabel || 'Send message'}</button>
      </div>
      {error && <p className="tki-form-error" role="alert">{error}</p>}
    </form>
  )
}

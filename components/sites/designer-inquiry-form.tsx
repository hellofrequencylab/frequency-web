'use client'

import { useState } from 'react'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE DESIGNER INQUIRY FORM (design: the Ready to Build and Consultation forms). Name, email and phone, two
// choices (or a meeting type), the services of interest as chips, and a free note. It goes through the same
// anonymous lead door as the Contact form (the Space resolved from the slug server-side, a honeypot and a rate
// limit above the write); the choices are folded into the message so the owner reads them in one place. A null
// slug is the editor's preview: the same markup, inert.

const PROJECT_TYPES = ['Custom home', 'Remodel', 'Large renovation', 'Commercial']
const STAGES = ['Ideation', 'Plans in progress', 'Ready to break ground']
const MEETINGS = ['Virtual meeting', 'In-person site walk']

export function DesignerInquiryForm({ slug, variant, services, submitLabel, successTitle, successBody }: { slug: string | null; variant: 'project' | 'consult'; services: string[]; submitLabel: string; successTitle: string; successBody: string }) {
  const consult = variant === 'consult'
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [type, setType] = useState('')
  const [stage, setStage] = useState('')
  const [meeting, setMeeting] = useState(MEETINGS[0])
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (slug === null || status === 'loading') return
    setError(null)
    setStatus('loading')
    const lines = [
      consult ? `Meeting type: ${meeting}` : `Project type: ${type || 'not said'}\nWhere they are: ${stage || 'not said'}`,
      `Services of interest: ${picked.join(', ') || 'none picked'}`,
      note.trim() ? `\n${note.trim()}` : '',
    ]
    try {
      const res = await submitContactForm({ slug, name: `${first} ${last}`.trim(), email, phone, message: lines.join('\n'), optIn: false, company })
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
      <div className="dz-done" role="status">
        <h3>{successTitle}</h3>
        <p className="dz-body">{successBody}</p>
      </div>
    )
  }

  const off = slug === null
  return (
    <form className="dz-form" onSubmit={onSubmit}>
      <Field label="First name"><Input required autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} disabled={off} /></Field>
      <Field label="Last name"><Input required autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} disabled={off} /></Field>
      <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={off} /></Field>
      <Field label="Phone"><Input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={off} /></Field>
      {consult ? (
        <div className="dz-form-wide" role="group" aria-labelledby="dz-meeting">
          <p className="dz-legend" id="dz-meeting">Meeting type</p>
          <div className="dz-chips">
            {MEETINGS.map((m) => (
              <button key={m} type="button" className="dz-chip" aria-pressed={meeting === m} onClick={() => setMeeting(m)} disabled={off}>{m}</button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <Field label="Project type"><Select value={type} onChange={(e) => setType(e.target.value)} options={PROJECT_TYPES} emptyLabel="Choose one" disabled={off} /></Field>
          <Field label="Where are you in the process?"><Select value={stage} onChange={(e) => setStage(e.target.value)} options={STAGES} emptyLabel="Choose one" disabled={off} /></Field>
        </>
      )}
      {services.length > 0 && (
        <div className="dz-form-wide" role="group" aria-labelledby="dz-services">
          <p className="dz-legend" id="dz-services">Services of interest</p>
          <div className="dz-chips">
            {services.map((s) => (
              <button key={s} type="button" className="dz-chip" aria-pressed={picked.includes(s)} onClick={() => toggle(s)} disabled={off}>{s}</button>
            ))}
          </div>
        </div>
      )}
      <div className="dz-form-wide">
        <Field label={consult ? 'What questions can we help with?' : 'Tell us about your vision'}><Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} disabled={off} /></Field>
      </div>
      <Input className="dz-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
      <div className="dz-form-wide dz-form-foot">
        <span className="dz-form-note">We respect your privacy and do not sell your information.</span>
        <button type="submit" className="dz-btn dz-btn-primary" data-size="lg" disabled={off || status === 'loading'}>{status === 'loading' ? 'Sending' : submitLabel || 'Send'}</button>
      </div>
      {error && <p className="dz-form-wide dz-form-note" role="alert">{error}</p>}
    </form>
  )
}

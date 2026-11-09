'use client'

import { useId, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'

// THE SERVICES QUOTE FORM (design: Vanta design system, ui_kits/site/Quote.jsx). Three steps on one card: the services (any of them)
// and how often, then the place (address, property type, rough window count, inside and outside glass), then the contact details. It
// goes through the same anonymous lead door as the Contact form (the Space resolved from the slug server-side, a honeypot and a rate
// limit above the write); every choice is folded into the message so the owner reads the request in one place. A null slug is the
// editor's preview: the same markup, inert. Classes only, every colour from the Services token block (components/sites/services-css.ts).

interface ServicesQuoteFormProps {
  slug: string | null
  services: string[]
  frequencies: string[]
  propertyTypes: string[]
  sizes: string[]
  submitLabel: string
  successTitle: string
  successBody: string
}

const STEPS = ['Service', 'Your place', 'Contact']

export function ServicesQuoteForm({ slug, services, frequencies, propertyTypes, sizes, submitLabel, successTitle, successBody }: ServicesQuoteFormProps) {
  const id = useId()
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<string[]>(services.slice(0, 1))
  const [often, setOften] = useState(frequencies[0] ?? '')
  const [address, setAddress] = useState('')
  const [property, setProperty] = useState('')
  const [size, setSize] = useState('')
  const [inside, setInside] = useState(true)
  const [outside, setOutside] = useState(true)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [company, setCompany] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const off = slug === null

  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))

  async function send() {
    if (off || status === 'loading') return
    setError(null)
    setStatus('loading')
    const glass = [inside && 'interior', outside && 'exterior'].filter(Boolean).join(' and ')
    const message = [
      `Services: ${picked.join(', ') || 'not said'}`,
      often && `How often: ${often}`,
      `Address: ${address.trim() || 'not said'}`,
      property && `Property: ${property}`,
      size && `Windows: ${size}`,
      glass && `Glass: ${glass}`,
      note.trim() && `\n${note.trim()}`,
    ].filter(Boolean).join('\n')
    try {
      const res = await submitContactForm({ slug, name: name.trim(), email, phone, message, optIn: false, company })
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

  function next(e: React.FormEvent) {
    e.preventDefault()
    if (step < STEPS.length - 1) setStep(step + 1)
    else void send()
  }

  if (status === 'done') {
    return (
      <div className="sv-qf-card sv-qf-done" role="status">
        <span className="sv-qf-badge"><Check size={14} strokeWidth={2.5} aria-hidden="true" />Request received</span>
        <h3 className="sv-display">{successTitle}</h3>
        {successBody && <p className="sv-lede">{successBody}</p>}
        <div className="sv-chips">{[...picked, often].filter(Boolean).map((t) => <span key={t}>{t}</span>)}</div>
      </div>
    )
  }

  const choice = (key: string, label: string, on: boolean, onClick: () => void) => (
    <button key={key} type="button" className="sv-choice" aria-pressed={on} onClick={onClick} disabled={off}>
      <span className="sv-choice-box" aria-hidden="true">{on && <Check size={12} strokeWidth={3} />}</span>
      {label}
    </button>
  )

  return (
    <div className="sv-qf-form">
      <ol className="sv-stepper" aria-label="Quote steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} data-done={i < step || undefined}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i >= step || off}>
              <span className="sv-stepper-num">{i < step ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : String(i + 1).padStart(2, '0')}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>
      <form className="sv-qf-card" onSubmit={next} noValidate={step < STEPS.length - 1}>
        {step === 0 && (
          <>
            <fieldset className="sv-fieldset">
              <legend className="sv-field-label">Services · choose any</legend>
              <div className="sv-choices">{services.map((s) => choice(s, s, picked.includes(s), () => toggle(s)))}</div>
            </fieldset>
            {frequencies.length > 0 && (
              <fieldset className="sv-fieldset">
                <legend className="sv-field-label">How often</legend>
                <div className="sv-choices sv-choices--3">{frequencies.map((f) => choice(f, f, often === f, () => setOften(f)))}</div>
              </fieldset>
            )}
          </>
        )}
        {step === 1 && (
          <div className="sv-fields">
            <label className="sv-field sv-field--wide"><span className="sv-field-label">Street address</span><Input id={`${id}-address`} aria-label="Street address" className="sv-input" autoComplete="street-address" placeholder="Street, city" value={address} onChange={(e) => setAddress(e.target.value)} disabled={off} /></label>
            {propertyTypes.length > 0 && (<label className="sv-field"><span className="sv-field-label">Property type</span><Select id={`${id}-property`} aria-label="Property type" className="sv-input" wrapperClassName="sv-select" value={property} onChange={(e) => setProperty(e.target.value)} options={propertyTypes} emptyLabel="Choose one" disabled={off} /></label>)}
            {sizes.length > 0 && (<label className="sv-field"><span className="sv-field-label">About how many windows</span><Select id={`${id}-size`} aria-label="About how many windows" className="sv-input" wrapperClassName="sv-select" value={size} onChange={(e) => setSize(e.target.value)} options={sizes} emptyLabel="Choose one" disabled={off} /></label>)}
            <fieldset className="sv-fieldset sv-field--wide">
              <legend className="sv-field-label">Include</legend>
              <div className="sv-choices">
                {choice('inside', 'Interior glass', inside, () => setInside(!inside))}
                {choice('outside', 'Exterior glass', outside, () => setOutside(!outside))}
              </div>
            </fieldset>
          </div>
        )}
        {step === 2 && (
          <div className="sv-fields">
            <label className="sv-field"><span className="sv-field-label">Full name</span><Input id={`${id}-name`} aria-label="Full name" className="sv-input" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={off} /></label>
            <label className="sv-field"><span className="sv-field-label">Phone</span><Input id={`${id}-phone`} aria-label="Phone" className="sv-input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={off} /></label>
            <label className="sv-field sv-field--wide"><span className="sv-field-label">Email</span><Input id={`${id}-email`} aria-label="Email" className="sv-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={off} /></label>
            <label className="sv-field sv-field--wide"><span className="sv-field-label">Notes</span><Textarea id={`${id}-note`} aria-label="Notes" className="sv-input" rows={4} placeholder="Gate code, pets, preferred days" value={note} onChange={(e) => setNote(e.target.value)} disabled={off} /></label>
            <Input className="sv-hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        )}
        <div className="sv-qf-foot">
          {step > 0 ? (
            <button type="button" className="sv-btn sv-btn--secondary" onClick={() => setStep(step - 1)} disabled={off}><ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /><span>Back</span></button>
          ) : (
            <span className="sv-qf-note"><ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />Your details stay private.</span>
          )}
          <button type="submit" className="sv-btn sv-btn--accent" disabled={off || status === 'loading' || (step === 0 && picked.length === 0)}>
            <span>{step < STEPS.length - 1 ? 'Continue' : status === 'loading' ? 'Sending' : submitLabel || 'Send request'}</span>
            <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {error && <p className="sv-qf-note" role="alert">{error}</p>}
      </form>
    </div>
  )
}

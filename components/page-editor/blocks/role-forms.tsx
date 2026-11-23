'use client'

import { useState, type FormEvent } from 'react'
import { Input, Textarea } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE ROLE BLOCKS' FORMS (LIVE-2517). The Letter and Contact roles can carry a real form (their `form` switch, off by default, so a
// block that never set it renders exactly as before). A contact block's `topics` lines add a Topic box; the pick leads the message. Both go through the Space's one anonymous lead door, the same door the New World
// and Network kit forms use (the Space resolved from the slug server-side, a honeypot and a rate limit above the write). Pressing the
// letter's button is the opt-in; the contact form asks nothing more. Markup is the role contract only (`data-part` hooks, no theme
// class), so every theme dresses it from role-blocks-css. A null slug is the editor canvas: the same markup, inert.

type Status = 'idle' | 'loading' | 'done'

function useLead(slug: string | null) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  async function send(input: { name: string; email: string; message: string; optIn: boolean; company: string }) {
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

const Honeypot = ({ value, set }: { value: string; set: (v: string) => void }) => (
  <Input data-part="hp" type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" value={value} onChange={(e) => set(e.target.value)} />
)

export function RoleLetterForm({ slug, label, buttonLabel }: { slug: string | null; label: string; buttonLabel: string }) {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const { status, error, send } = useLead(slug)
  if (status === 'done') return <p data-part="done" role="status">Thanks. You are on the list.</p>
  return (
    <form data-part="form" data-form="letter" onSubmit={(e: FormEvent) => { e.preventDefault(); void send({ name: '', email, message: '', optIn: true, company }) }}>
      <label data-part="field">
        <span data-part="label">{label || 'Email address'}</span>
        <Input data-part="input" type="email" required autoComplete="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={slug === null} />
      </label>
      <Honeypot value={company} set={setCompany} />
      <button data-part="cta" type="submit" disabled={slug === null || status === 'loading'}>{status === 'loading' ? 'Joining' : buttonLabel || 'Sign up'}</button>
      {error && <p data-part="error" role="alert">{error}</p>}
    </form>
  )
}

export function RoleContactForm({ slug, buttonLabel, topics = [] }: { slug: string | null; buttonLabel: string; topics?: string[] }) {
  const [topic, setTopic] = useState(topics[0] ?? '')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [company, setCompany] = useState('')
  const { status, error, send } = useLead(slug)
  const off = slug === null
  if (status === 'done') return <p data-part="done" role="status">Thanks. Your message is on its way.</p>
  return (
    <form data-part="form" data-form="contact" onSubmit={(e: FormEvent) => { e.preventDefault(); void send({ name, email, message: topic ? `Topic: ${topic}\n\n${message}` : message, optIn: false, company }) }}>
      <label data-part="field"><span data-part="label">Name</span><Input data-part="input" type="text" required autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} disabled={off} /></label>
      <label data-part="field"><span data-part="label">Email</span><Input data-part="input" type="email" required autoComplete="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={off} /></label>
      {topics.length > 0 && (
        <label data-part="field" data-wide=""><span data-part="label">Topic</span>
          <Select data-part="input" options={topics} value={topic} onChange={(e) => setTopic(e.target.value)} disabled={off} />
        </label>
      )}
      <label data-part="field" data-wide=""><span data-part="label">Message</span><Textarea data-part="input" rows={4} required placeholder="What would you like to ask?" value={message} onChange={(e) => setMessage(e.target.value)} disabled={off} /></label>
      <Honeypot value={company} set={setCompany} />
      <div data-wide=""><button data-part="cta" type="submit" disabled={off || status === 'loading'}>{status === 'loading' ? 'Sending' : buttonLabel || 'Send'}</button></div>
      {error && <p data-part="error" data-wide="" role="alert">{error}</p>}
    </form>
  )
}

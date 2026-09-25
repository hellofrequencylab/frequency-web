'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Field, Input, Textarea, labelClasses } from '@/components/ui/field'
import { Eyebrow } from '@/components/page-editor/blocks/kit'
import { submitContactForm } from '@/app/(main)/spaces/[slug]/contact-form-actions'

// THE CONTACT FORM BLOCK's client island (lead capture, door 6).
//
// Every other entity block is read-only markup; this one holds state and posts. The server side of
// the block (ContentBlockView / the module render) stays a synchronous, hook-free Server Component
// and simply RETURNS this element, so only the form hydrates — the same boundary `recording` and
// `embed` use.
//
// `slug` NULL MEANS PREVIEW, and it is the whole reason this component takes a nullable slug rather
// than being split in two. The operator's edit canvas and the block palette need to show what the
// form LOOKS like without shipping a live form into an editing surface, and a preview that is a
// different component from the real thing is a preview that drifts. So: same markup, same fields,
// inputs disabled, submit does nothing.
//
// The honeypot field is named `company`, matching every other capture door in the repo, and is
// hidden from sight AND from assistive tech (aria-hidden + tabIndex -1) so only a bot fills it.

export interface ContactFormBlockProps {
  /** The Space to write to, resolved server-side in the action. Null renders a dead preview. */
  slug: string | null
  eyebrow?: string
  title?: string
  body?: string
  showPhone?: boolean
  showMessage?: boolean
  messageLabel?: string
  optInLabel?: string
  submitLabel?: string
  successMessage?: string
}

export function ContactFormBlock({
  slug,
  eyebrow,
  title,
  body,
  showPhone = false,
  showMessage = true,
  messageLabel,
  optInLabel,
  submitLabel,
  successMessage,
}: ContactFormBlockProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [optIn, setOptIn] = useState(false) // NEVER pre-ticked. See the block's field schema.
  const [company, setCompany] = useState('') // honeypot
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const preview = slug === null
  const heading = title?.trim() || 'Get in touch'
  const sendLabel = submitLabel?.trim() || 'Send'
  const thanks = successMessage?.trim() || 'Thanks. Your message is on its way.'
  const consentWords = optInLabel?.trim() || 'Email me about what is on'
  const messageWords = messageLabel?.trim() || 'Your message'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (preview || status === 'loading') return
    setError(null)
    setStatus('loading')
    const res = await submitContactForm({ slug, name, email, phone, message, optIn, company })
    if (res.ok) {
      setStatus('done')
    } else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center sm:p-8" role="status">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-success-bg text-success">
          <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
        </div>
        <p className="text-body text-text">{thanks}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
      {/* The shared Eyebrow atom, not a hand-rolled copy of its look: it carries the `eyebrow` text
          role, so the Space's theme and brand accent reach it exactly as they reach every sibling
          block. Locked by lib/theme/eyebrow-role.test.ts. */}
      {eyebrow?.trim() && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="font-display text-page-title uppercase tracking-tight text-balance text-text sm:text-3xl">
        {heading}
      </h2>
      {body?.trim() && <p className="mt-3 text-body-sm leading-relaxed text-muted">{body}</p>}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {/* Field wraps exactly one control each (ADR-966 / `pnpm check:labels`), so every input is
            named by its own label rather than by a heading that happens to sit above it. */}
        <Field label="Your name">
          <Input
            className="w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={preview}
            autoComplete="name"
          />
        </Field>
        <Field label="Email">
          <Input
            className="w-full"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={preview}
            autoComplete="email"
          />
        </Field>
        {showPhone && (
          <Field label="Phone">
            <Input
              className="w-full"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={preview}
              autoComplete="tel"
            />
          </Field>
        )}
        {showMessage && (
          <Field label={messageWords}>
            <Textarea
              className="w-full"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={preview}
            />
          </Field>
        )}

        {/* Honeypot. Hidden from sight and from assistive tech, so only a bot ever fills it. */}
        <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <Field label="Company" labelClassName={labelClasses}>
            <Input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(e) => setOptIn(e.target.checked)}
            disabled={preview}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[var(--color-primary)]"
          />
          <span className="text-body-sm text-muted">{consentWords}</span>
        </label>

        {error && (
          <p className="text-body-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={preview || status === 'loading'}
          className="tap-target inline-flex items-center justify-center rounded-control bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {status === 'loading' ? 'Sending…' : sendLabel}
        </button>
      </form>
    </div>
  )
}

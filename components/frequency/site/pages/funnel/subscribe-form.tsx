'use client'

// The /subscribe form on the Frequency design. The SAME behaviour as components/marketing/subscribe-form.tsx:
// one call to requestSubscribe, ONE success state for every outcome (anti-enumeration: the page never says
// whether the address was new, already subscribed or opted out), and nothing is on the list until the
// emailed confirm link is clicked. There is no consent checkbox: submitting your own address asks for the
// confirm email, and the confirm click is the consent.

import { useState } from 'react'
import { requestSubscribe } from '@/app/(marketing)/subscribe/actions'
import { Input } from '@/components/ui/field'
import { FnOutcome } from './parts'

export function FrequencySubscribeForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    const res = await requestSubscribe({ email, name })
    if (res.ok) {
      setStatus('done')
    } else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <FnOutcome role="status" tone="success" icon="send" title="Check your inbox.">
        {email
          ? `If ${email} can get mail from us, a confirm link is on its way. Click it and you're on the list.`
          : "If that address can get mail from us, a confirm link is on its way. Click it and you're on the list."}
      </FnOutcome>
    )
  }

  return (
    <form className="fn-box jx-f" onSubmit={onSubmit}>
      <label htmlFor="fn-sub-name">
        <span>
          First name <span className="fn-opt">(optional)</span>
        </span>
        <Input
          id="fn-sub-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          placeholder="Alex"
        />
      </label>
      <label htmlFor="fn-sub-email">
        Email
        <Input
          id="fn-sub-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-describedby={error ? 'fn-sub-error' : undefined}
          aria-invalid={error ? true : undefined}
          placeholder="you@email.com"
        />
      </label>
      {error && (
        <p id="fn-sub-error" className="jx-err" role="alert">
          {error}
        </p>
      )}
      <button className="btn fq-iri-btn" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending the link…' : 'Send me the confirm link →'}
      </button>
      <p className="jx-fine">We&apos;ll email you to confirm it&apos;s really you. That&apos;s the only way onto the list.</p>
    </form>
  )
}

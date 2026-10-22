'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { submitCardSwap } from './actions'

// Swap contacts on a card's face (LIVE-1282). The card and its owner are NOT in this component: the
// token goes back untouched and the server resolves everything from it. A signed-in member arrives
// prefilled from their own profile. On success the form gives way to one calm line.
export function SwapForm({
  token,
  ownerName,
  forSpace,
  prefill,
}: {
  token: string
  /** Who receives the details: the member's first name, or the Space's name. */
  ownerName: string
  /** A Space's card needs an email (its leads are keyed by email). */
  forSpace: boolean
  prefill: { name: string; email: string; phone: string }
}) {
  const [name, setName] = useState(prefill.name)
  const [email, setEmail] = useState(prefill.email)
  const [phone, setPhone] = useState(prefill.phone)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('sending')
    const res = await submitCardSwap({ token, name, email, phone, note })
    if (res.ok) setStatus('done')
    else {
      setError(res.error)
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <p role="status" className="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3 text-body-sm text-text">
        <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
        <span>
          Sent. {ownerName} has your details now.
        </span>
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Your name">
        <Input type="text" required autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={forSpace ? 'Email' : 'Email (or a phone number below)'}>
        <Input type="email" required={forSpace} autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Phone (optional)">
        <Input type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="A note (optional)" hint="Where you met, or what you want to talk about.">
        <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={status === 'sending'}>
        Swap contacts
      </Button>
      {error && (
        <p className="text-body-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <p className="text-meta leading-relaxed text-muted">
        Sending this shares what you typed with {ownerName}, and only them. Nobody adds you to a mailing list.
      </p>
    </form>
  )
}

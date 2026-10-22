'use client'

// The "Not yet" door (design section 10, right): an email and a consent tick. It rides the existing
// double opt-in (requestSubscribe, the same call as /subscribe): nothing is on the list until the emailed
// confirm link is clicked, and the page never says whether the address was new (anti-enumeration). States
// are the design's: default, filled, error and success.
import { useState } from 'react'
import { requestSubscribe } from '@/app/(marketing)/subscribe/actions'
import { Input } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'

type State = 'default' | 'error' | 'success'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function NicheGuideForm({ formId }: { formId: string }) {
  const [state, setState] = useState<State>('default')
  const [email, setEmail] = useState('')
  const [ticked, setTicked] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = email.trim()
    if (!EMAIL.test(v)) {
      setMessage('Enter a full email address.')
      setState('error')
      return
    }
    if (!ticked) {
      setMessage('Tick the box so we know you want the emails.')
      setState('error')
      return
    }
    setBusy(true)
    const res = await requestSubscribe({ email: v })
    setBusy(false)
    if (res.ok) setState('success')
    else {
      setMessage(res.error)
      setState('error')
    }
  }

  return (
    <form className="nk-f" data-st={state} onSubmit={onSubmit} noValidate>
      <label className="l" htmlFor={`${formId}-email`}>
        Email
      </label>
      <Input
        id={`${formId}-email`}
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        value={email}
        aria-invalid={state === 'error' ? true : undefined}
        aria-describedby={state === 'error' ? `${formId}-err` : undefined}
        onChange={(e) => {
          setEmail(e.target.value)
          if (state === 'error') setState('default')
        }}
      />
      <span id={`${formId}-err`} className="err" role="alert">
        {message}
      </span>
      <Checkbox
        checked={ticked}
        onChange={(e) => setTicked(e.target.checked)}
        wrapperClassName="tick"
        label="Send me launch news and occasional emails from Frequency. Unsubscribe any time."
      />
      <button className="btn btn-ghost fq-iri-rim" type="submit" disabled={busy}>
        {busy ? 'Sending the link…' : 'Email me the updates'}
      </button>
      <div className="nk-ok" role="status">
        <b>Check your inbox to confirm.</b>
        <span>You join the list once you confirm.</span>
      </div>
    </form>
  )
}

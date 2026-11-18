'use client'

// "Email me Week 1": the light door for a visitor who is not ready to make an account. One field, one
// call, and ONE success state for every outcome (anti-enumeration, as /subscribe). The email carries the
// Week 1 link and the next Run's dates, and separately asks whether they want notes from Frequency: being
// on the list still takes the confirm click (double opt-in).

import { useState } from 'react'
import { requestCoursePreview } from '@/app/(marketing)/courses/actions'
import { Input } from '@/components/ui/field'

export function CourseLeadForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const id = `dd-lead-${slug}`

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    try {
      const res = await requestCoursePreview({ email, slug })
      if (res.ok) setStatus('done')
      else {
        setError(res.error)
        setStatus('idle')
      }
    } catch {
      setError('That didn’t send. Please try again.')
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <p role="status">
        Check your inbox. If {email || 'that address'} can get mail from us, Week 1 is on its way.
      </p>
    )
  }

  return (
    <form className="dd-lead" onSubmit={onSubmit}>
      <label htmlFor={id}>
        Email
        <Input
          id={id}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@email.com"
          aria-describedby={error ? `${id}-err` : undefined}
          aria-invalid={error ? true : undefined}
        />
      </label>
      {error && (
        <p id={`${id}-err`} className="dd-err" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-ghost fq-iri-rim" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending…' : 'Email me Week 1'}
      </button>
      <p className="dd-fine">One email with Week 1. Notes from Frequency only if you say yes.</p>
    </form>
  )
}

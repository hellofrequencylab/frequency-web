'use client'

// The Community Book form: one field (the four pages, or links to them) and one send.

import { useState } from 'react'
import { submitCommunityBookAction } from '@/app/(marketing)/courses/actions'
import { Textarea } from '@/components/ui/field'

export function CertifyForm({ slug }: { slug: string }) {
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('loading')
    try {
      const res = await submitCommunityBookAction({ slug, body })
      if (res.ok) setStatus('done')
      else {
        setError(res.error)
        setStatus('idle')
      }
    } catch {
      setError('That did not send. Please try again.')
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return <p role="status">Sent. A reviewer reads every Community Book, and you’ll hear back by email.</p>
  }

  return (
    <form className="dd-lead" onSubmit={onSubmit}>
      <label htmlFor="dd-book">
        Your four pages, or links to them
        <Textarea
          id="dd-book"
          required
          rows={10}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'Sit-down: …\nOpening: …\nRun sheet: …\nMoney page: …'}
          aria-describedby={error ? 'dd-book-err' : undefined}
          aria-invalid={error ? true : undefined}
        />
      </label>
      {error && (
        <p id="dd-book-err" className="dd-err" role="alert">
          {error}
        </p>
      )}
      <button className="btn fq-iri-btn" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending…' : 'Send my Community Book'}
      </button>
    </form>
  )
}

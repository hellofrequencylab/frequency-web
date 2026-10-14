'use client'

import { useState, useTransition } from 'react'
import { isError } from '@/lib/action-result'
import { messageHost } from '@/app/(main)/events/[slug]/social-actions'
import { openDockThread } from '@/lib/messages/dock-open'
import { Textarea } from '@/components/ui/field'

// The Host panel's Message button (templates/members/Event.html), on the real action: the same
// `messageHost` the DAWN Host card's dialog calls, then the dock opens over the page on the new
// conversation (ADR-896), so the member never leaves the event. The kit draws it inline in the
// panel instead of a dialog: a pill composer under the host row.

export function FqMessageHost({ eventId, hostName }: { eventId: string; hostName: string }) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const first = hostName.trim().split(/\s+/)[0] || hostName

  if (sent) {
    return (
      <div className="stack fqm-gap-sm">
        <span className="t2">Your message is on its way to {first}.</span>
        <button type="button" className="btn sm" onClick={() => openDockThread({ kind: 'dm', id: sent, title: hostName })}>
          Open the conversation
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button type="button" className="btn sm fqm-tag-start" onClick={() => setOpen(true)}>
        Message
      </button>
    )
  }

  return (
    <form
      className="stack fqm-gap-sm"
      onSubmit={(e) => {
        e.preventDefault()
        const text = body.trim()
        if (!text) return
        setError(null)
        start(async () => {
          const res = await messageHost(eventId, text)
          if (isError(res)) setError(res.error)
          else setSent(res.data.conversationId)
        })
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Write to ${first}`}
        aria-label={`Message ${hostName}`}
        maxLength={2000}
        autoFocus
      />
      {error && (
        <span className="t2" role="alert">
          {error}
        </span>
      )}
      <div className="row">
        <button type="submit" className="btn sm pa" disabled={pending || !body.trim()}>
          {pending ? 'Sending' : 'Send'}
        </button>
        <button type="button" className="btn sm txt" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

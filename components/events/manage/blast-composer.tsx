'use client'

import { useState, useTransition } from 'react'
import { Send, Check } from 'lucide-react'
import { fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { sendEventBlast, type BlastChannel } from '@/app/(main)/events/[slug]/manage/manage-actions'

// Host blast composer (slice B-3). Write a message, pick the channels, send it to
// every guest who hasn't muted this event. Each channel is consent-gated server-side
// (preferences + consent + suppression) so the host can't route around a guest's
// choices. SMS is parked. Voice: plain, no hype.

const CHANNELS: { id: BlastChannel; label: string; hint: string }[] = [
  { id: 'inapp', label: 'In-app', hint: 'A notification on Frequency' },
  { id: 'push', label: 'Push', hint: 'A phone notification' },
  { id: 'email', label: 'Email', hint: 'To their inbox' },
]

const MAX = 1000

export function BlastComposer({ eventId, slug }: { eventId: string; slug: string }) {
  const [body, setBody] = useState('')
  const [channels, setChannels] = useState<BlastChannel[]>(['inapp', 'push'])
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(c: BlastChannel) {
    setSentTo(null)
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  function handleSend() {
    setError(null)
    setSentTo(null)
    const trimmed = body.trim()
    if (!trimmed) {
      setError('Write a message first.')
      return
    }
    if (channels.length === 0) {
      setError('Pick at least one way to send it.')
      return
    }
    startTransition(async () => {
      const res = await sendEventBlast(eventId, slug, { body: trimmed, channels })
      if (isError(res)) {
        setError(res.error)
        return
      }
      setSentTo(res.data.recipientCount)
      setBody('')
    })
  }

  return (
    <div className="space-y-3">
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          setSentTo(null)
        }}
        rows={4}
        maxLength={MAX}
        disabled={pending}
        placeholder="Running 10 minutes late, grab a coffee and head in when you're ready."
        className={`${fieldClasses} resize-y leading-relaxed`}
      />

      <div className="flex flex-wrap items-center gap-2">
        {CHANNELS.map((c) => {
          const on = channels.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              disabled={pending}
              title={c.hint}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                on
                  ? 'border-primary bg-primary/10 text-primary-strong'
                  : 'border-border text-muted hover:bg-surface-elevated'
              }`}
            >
              {c.label}
            </button>
          )
        })}
        <span className="ml-auto text-xs tabular-nums text-subtle">
          {body.length}/{MAX}
        </span>
      </div>

      <p className="text-xs text-muted">
        {"Goes to everyone who RSVP'd and hasn't muted this event. We skip anyone who's turned off event notifications. SMS isn't available yet."}
      </p>

      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        {sentTo != null && (
          <span className="flex items-center gap-1 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" />
            {sentTo === 0 ? 'No one to send to right now.' : `Sent to ${sentTo} ${sentTo === 1 ? 'guest' : 'guests'}.`}
          </span>
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={pending || !body.trim() || channels.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
          {pending ? 'Sending…' : 'Send blast'}
        </button>
      </div>
    </div>
  )
}

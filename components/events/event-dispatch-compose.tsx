'use client'

import { useState, useTransition } from 'react'
import { Radio, MessageSquare, Smartphone, Megaphone, Lock } from 'lucide-react'
import { postEventDispatch } from '@/app/(main)/events/[slug]/social-actions'

// EventDispatchCompose (ADR-255 / EVENTS-DESIGN B2) — the host's "post an update"
// box on the event page. The base action ALWAYS posts to the event page; the host
// may also send it as a Dispatch (rides the existing rail with an event badge +
// push fan-out) and/or text the group (SMS).
//
// SMS is present but gated (ADR-256): the host can mark "text the group" so the
// intent is recorded on the Event Dispatch, but the send is held behind the legal
// gate. The server action records the flag and routes it through sendSms(), which
// refuses every send until SMS is enabled (A2P 10DLC + member consent + quiet
// hours). So choosing it queues nothing illegal — it just notes that this update
// should also go out by text once the channel is live. The toggle says so plainly.
//
// Host/cohost only — the page gates whether this renders at all; the server action
// re-checks authorization.

const MAX_BODY = 2000

export function EventDispatchCompose({ eventId, slug }: { eventId: string; slug: string }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [toDispatch, setToDispatch] = useState(false)
  const [toSms, setToSms] = useState(false)
  const [pending, startTransition] = useTransition()

  const canSubmit = !!body.trim() && !pending

  function submit() {
    const trimmed = body.trim()
    if (!trimmed || pending) return
    startTransition(async () => {
      await postEventDispatch(eventId, slug, {
        title: title.trim() || null,
        body: trimmed,
        toDispatch,
        // Records intent on the Event Dispatch. The send is gated behind sendSms()
        // (ADR-256): nothing texts until SMS is enabled. Honest copy below.
        toSms,
      })
      setTitle('')
      setBody('')
      setToDispatch(false)
      setToSms(false)
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Megaphone className="h-3.5 w-3.5 text-primary" />
        Post an update
      </p>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        disabled={pending}
        className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-subtle focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 disabled:opacity-60"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
        }}
        placeholder="What should guests know? Parking, a time change, what to bring."
        rows={3}
        disabled={pending}
        className="w-full resize-none rounded-lg bg-transparent px-1 text-sm leading-relaxed text-text/90 outline-none placeholder:text-subtle disabled:opacity-60"
      />

      {/* Channel toggles. Page post is always on (the base action). */}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-elevated px-2.5 py-1.5 text-2xs font-medium text-muted">
          <MessageSquare className="h-3.5 w-3.5" />
          On this page
        </span>

        <button
          type="button"
          onClick={() => setToDispatch((v) => !v)}
          disabled={pending}
          aria-pressed={toDispatch}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors disabled:opacity-50 ${
            toDispatch
              ? 'bg-primary-bg text-primary-strong'
              : 'border border-border text-muted hover:border-border-strong hover:text-text'
          }`}
        >
          <Radio className="h-3.5 w-3.5" />
          Send as a Dispatch
        </button>

        {/* SMS — selectable, but the send is gated behind sendSms() (ADR-256). The
            host can mark "text the group" to record the intent; the lock signals
            the channel is not live yet. Copy below states it plainly. */}
        <button
          type="button"
          onClick={() => setToSms((v) => !v)}
          disabled={pending}
          aria-pressed={toSms}
          title="Marks this update to also go out by text once SMS is turned on."
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors disabled:opacity-50 ${
            toSms
              ? 'bg-primary-bg text-primary-strong'
              : 'border border-dashed border-border text-muted hover:border-border-strong hover:text-text'
          }`}
        >
          <Smartphone className="h-3.5 w-3.5" />
          Text the group
          <Lock className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="ml-auto shrink-0 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Posting…' : 'Post update'}
        </button>
      </div>

      {toDispatch && (
        <p className="mt-2 text-2xs text-subtle">
          Guests who RSVP&rsquo;d get this in their Dispatches, unless they muted this event.
        </p>
      )}

      {toSms && (
        <p className="mt-2 text-2xs text-subtle">
          Texting isn&rsquo;t on yet. We&rsquo;ll mark this update to go out by text too, and it
          sends once SMS is turned on and a guest has opted in.
        </p>
      )}
    </div>
  )
}

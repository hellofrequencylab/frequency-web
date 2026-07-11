'use client'

import { useState, useTransition } from 'react'
import { Radio, MessageSquare, Smartphone, Megaphone } from 'lucide-react'
import { postEventDispatch } from '@/app/(main)/events/[slug]/social-actions'

// EventDispatchCompose (ADR-255 / EVENTS-DESIGN B2) — the host's "post an update"
// box on the event page. The base action ALWAYS posts to the event page; the host
// may also send it as a Dispatch (rides the existing rail with an event badge +
// push fan-out) and/or text the group (SMS).
//
// SMS is gated on provisioning (ADR-256). Until the owner completes the A2P 10DLC +
// Twilio track, isSmsProvisioned() is false and nothing can text. So the "text the
// group" toggle only renders as a real control when `smsProvisioned` is true; until
// then it shows a disabled "Coming soon" chip so a host is never offered a toggle
// that silently does nothing. When provisioned, the host can mark "text the group"
// to record the intent on the Event Dispatch; the send still rides sendSms(), which
// re-checks member consent + quiet hours. The parent RSC resolves the boolean.
//
// Host/cohost only — the page gates whether this renders at all; the server action
// re-checks authorization.

const MAX_BODY = 2000

export function EventDispatchCompose({
  eventId,
  slug,
  smsProvisioned,
}: {
  eventId: string
  slug: string
  smsProvisioned: boolean
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [toDispatch, setToDispatch] = useState(false)
  const [toSms, setToSms] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const canSubmit = !!body.trim() && !pending

  function submit() {
    const trimmed = body.trim()
    if (!trimmed || pending) return
    startTransition(async () => {
      const res = await postEventDispatch(eventId, slug, {
        title: title.trim() || null,
        body: trimmed,
        toDispatch,
        // Records intent on the Event Dispatch. The send is gated behind sendSms()
        // (ADR-256): nothing texts until SMS is enabled. Honest copy below.
        toSms,
      })
      // Surface a failure instead of clearing the box as if it sent (the host would
      // lose their text + think it posted).
      if ('error' in res) {
        setError(res.error)
        return
      }
      setError('')
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

        {/* SMS — only a real toggle once the channel is provisioned (ADR-256). Until
            then, a disabled "Coming soon" chip: never offer a toggle that does nothing. */}
        {smsProvisioned ? (
          <button
            type="button"
            onClick={() => setToSms((v) => !v)}
            disabled={pending}
            aria-pressed={toSms}
            title="Marks this update to also go out by text."
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors disabled:opacity-50 ${
              toSms
                ? 'bg-primary-bg text-primary-strong'
                : 'border border-dashed border-border text-muted hover:border-border-strong hover:text-text'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Text the group
          </button>
        ) : (
          <span
            aria-disabled="true"
            title="Text messages are coming soon."
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-2xs font-medium text-subtle"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Text the group
            <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-medium text-muted">
              Coming soon
            </span>
          </span>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="ml-auto shrink-0 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? 'Posting…' : 'Post update'}
        </button>
      </div>

      {error && <p className="mt-2 text-2xs font-medium text-danger">{error}</p>}

      {toDispatch && (
        <p className="mt-2 text-2xs text-subtle">
          Guests who RSVP&rsquo;d get this in their Dispatches, unless they muted this event.
        </p>
      )}

      {toSms && (
        <p className="mt-2 text-2xs text-subtle">
          Goes out by text to guests who opted in, within their quiet hours.
        </p>
      )}
    </div>
  )
}

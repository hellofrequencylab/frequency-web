'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { PersonCard } from '@/components/cards/person-card'
import { Dialog } from '@/components/ui/dialog'
import { getInitials } from '@/lib/utils'
import { isError } from '@/lib/action-result'
import { messageHost } from '@/app/(main)/events/[slug]/social-actions'
import type { HostLite } from '@/lib/events/active-event'

// The event Host profile box (the repurposed `event-lineup` module) — a client island so the box
// can open a modal compose. It REUSES PersonCard for the profile visual (no hand-rolled card), adds
// a "Message Host" CTA, and on click opens a larger host profile + a message field. The send wires
// into the SAME messaging backend as /messages via the `messageHost` server action
// (findOrCreateDirectConversation + messages insert), which returns an ActionResult so this surfaces
// success and errors inline. The parent server module self-hides when there is no host, so `host`
// here is always present.
export function HostProfileBox({
  host,
  eventId,
  canMessage,
  signInHref,
}: {
  host: HostLite
  eventId: string
  /** False when the viewer is signed out or is the host themselves → the CTA becomes a sign-in / hidden. */
  canMessage: boolean
  signInHref: string
}) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentHref, setSentHref] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const firstName = host.display_name.trim().split(/\s+/)[0] || host.display_name

  function close() {
    setOpen(false)
    setBody('')
    setError(null)
    setSentHref(null)
  }

  function submit() {
    const trimmed = body.trim()
    if (!trimmed) return
    setError(null)
    startTransition(async () => {
      const result = await messageHost(eventId, trimmed)
      if (isError(result)) {
        setError(result.error)
      } else {
        setSentHref(`/messages/${result.data.conversationId}`)
      }
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-subtle">Host</p>

      <PersonCard
        handle={host.handle}
        displayName={host.display_name}
        avatarUrl={host.avatar_url}
        context="Hosting this event"
      />

      {canMessage ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Message Host
        </button>
      ) : (
        <Link
          href={signInHref}
          className="mt-3 block w-full rounded-xl border border-border px-3 py-2 text-center text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
        >
          Sign in to message the host
        </Link>
      )}

      <Dialog open={open} onClose={close} ariaLabel={`Message ${host.display_name}`} className="max-w-md">
        <div className="w-full rounded-2xl border border-border bg-surface p-6 shadow-xl">
          {/* The larger host profile header. */}
          <div className="flex items-center gap-4">
            {host.avatar_url ? (
              <Image
                src={host.avatar_url}
                alt={host.display_name}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 select-none items-center justify-center rounded-full bg-primary-bg text-lg font-semibold text-primary-strong">
                {getInitials(host.display_name)}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-text">{host.display_name}</h2>
              <Link href={`/people/${host.handle}`} className="text-sm text-subtle hover:text-text">
                @{host.handle}
              </Link>
            </div>
          </div>

          {sentHref ? (
            <>
              <p className="mt-5 text-sm text-muted">Your message is on its way to {firstName}.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  Done
                </button>
                <Link
                  href={sentHref}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
                >
                  Open the conversation
                </Link>
              </div>
            </>
          ) : (
            <>
              <label htmlFor="host-message" className="mt-5 block text-sm font-medium text-text">
                Send {firstName} a message
              </label>
              <textarea
                id="host-message"
                autoFocus
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={`Say hello or ask ${firstName} about the event.`}
                className="mt-2 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/30"
              />

              {error && <p className="mt-2 text-sm text-danger">{error}</p>}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending || !body.trim()}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                >
                  {isPending ? 'Sending...' : 'Send message'}
                </button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </section>
  )
}

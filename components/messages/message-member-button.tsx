'use client'

import { useState } from 'react'
import { openDirectConversation } from '@/app/(main)/messages/actions'
import { openDockThread } from '@/lib/messages/dock-open'

// ── "Message this member" (ADR-896, chat consolidation) ───────────────────────────────────
// ONE button for every member-to-member message entry point. It opens the chat dock in place
// instead of navigating to /messages/<id>, which is the owner's report verbatim: "When I hit
// the Reconnect with button it took me to a chat page. That page should not exist."
//
// It is one shared component rather than three copies on purpose. The three call sites (the
// profile header chip, the profile "Reconnect with …" panel, the circle roster row) were three
// separate `<form action={startConversation.bind(...)}>` blocks, and the previous time this
// behaviour changed only some of them moved. A shared component makes divergence impossible,
// and the drift guard in message-member-button.test.ts pins that none of them re-grows a form.
//
// The refusal copy comes back from the action as a sentence, never as a thrown Error: a thrown
// Error reaches production as an opaque digest, and "You need to be friends before you can
// message." is not an error, it is an answer.

export function MessageMemberButton({
  profileId,
  threadTitle,
  className,
  wrapperClassName,
  errorClassName = 'text-2xs text-danger',
  ariaLabel,
  title,
  children,
}: {
  /** The OTHER member's profile id. The action re-derives the caller; this is never trusted. */
  profileId: string
  /** The peer's display name, when the caller knows it. Purely the dock's header while the
   *  thread loads — the server read returns the authoritative title and overwrites it. */
  threadTitle?: string
  className?: string
  wrapperClassName?: string
  errorClassName?: string
  ariaLabel?: string
  title?: string
  children: React.ReactNode
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function open() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const res = await openDirectConversation(profileId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      openDockThread({ kind: 'dm', id: res.conversationId, title: threadTitle })
    } catch {
      // A network drop, not a policy refusal. Same plain sentence, no digest.
      setError('We could not open that conversation. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <span className={`inline-flex flex-col items-stretch gap-1 ${wrapperClassName ?? ''}`}>
      <button
        type="button"
        onClick={open}
        aria-busy={pending}
        aria-label={ariaLabel}
        title={title}
        className={className}
      >
        {children}
      </button>
      {error && (
        <span role="status" className={errorClassName}>
          {error}
        </span>
      )}
    </span>
  )
}

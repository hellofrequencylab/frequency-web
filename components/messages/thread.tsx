'use client'

import { formatTimeShort } from '@/lib/format-date'
import { useState } from 'react'
import Image from 'next/image'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { TypingIndicator } from '@/components/messages/typing-indicator'
import { ChatComposer } from '@/components/ui/chat-composer'
import { useDmThread } from '@/components/messages/use-dm-thread'

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

type Participant = {
  id: string
  display_name: string
  handle: string
  avatar_url: string | null
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return formatTimeShort(d)
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function MessageThread({
  conversationId,
  initialMessages,
  myProfileId,
  participants,
  autoFocus = false,
}: {
  conversationId: string
  initialMessages: Message[]
  myProfileId: string
  participants: Participant[]
  /** Put the caret in the composer on mount. Set ONLY for a programmatic open (a member who
   *  pressed "Message" meant to type), never for a row click in the dock's own inbox. */
  autoFocus?: boolean
}) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Build a map for quick participant lookup
  const participantMap = Object.fromEntries(participants.map((p) => [p.id, p]))

  // Everything a DM does (realtime, read mark, typing, the pinned scroller, the optimistic send) is
  // the one shared thread the Messages page runs too (HYG-252). This view owns its box and its look.
  // The scroller sets scrollTop on THIS list only, so the page behind the fixed dock never moves.
  const { messages, pending: isPending, typingNames, notifyTyping, listRef, send } = useDmThread({
    conversationId,
    initialMessages,
    myProfileId,
    myDisplayName: participantMap[myProfileId]?.display_name,
  })

  function submit() {
    setError(null)
    const sent = send(body, (err, text) => {
      // The send failed (e.g. the other member has been blocked): the draft comes back so the text isn't lost.
      setBody((cur) => (cur ? cur : text))
      setError(err instanceof Error ? err.message : 'Message failed to send. Try again.')
    })
    if (sent) setBody('')
  }

  // Group consecutive messages from the same sender
  type Group = { sender_id: string; msgs: Message[] }
  const groups: Group[] = []
  for (const msg of messages) {
    const last = groups[groups.length - 1]
    if (last && last.sender_id === msg.sender_id) {
      last.msgs.push(msg)
    } else {
      groups.push({ sender_id: msg.sender_id, msgs: [msg] })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Message list ─────────────────────────── */}
      <div ref={listRef} className="fqd-scroll flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
        {groups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-body-sm text-subtle">
              No messages yet. Say hello!
            </p>
          </div>
        )}

        {groups.map((group, gi) => {
          const isMine = group.sender_id === myProfileId
          const sender = participantMap[group.sender_id]

          return (
            <div
              key={gi}
              className={`fqd-grp flex items-end gap-2.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar. Shown once per group, aligned to last message */}
              <div className="shrink-0 self-end mb-1">
                {!isMine && (
                  sender?.avatar_url ? (
                    <Image
                      src={avatarSrc(sender.avatar_url)}
                      alt={sender.display_name}
                      width={28}
                      height={28}
                      style={avatarFocusStyle(sender.avatar_url)}
                      className="w-7 h-7 rounded-pill object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-pill bg-primary-bg text-primary-strong text-3xs font-bold flex items-center justify-center select-none">
                      {sender ? getInitials(sender.display_name) : '?'}
                    </div>
                  )
                )}
                {isMine && <div className="w-7" />}
              </div>

              {/* Bubble stack. `group` sits on the STACK, not on each bubble row, so hovering
                  anywhere in a run of messages reveals the one timestamp beneath it. */}
              <div
                className={`group flex flex-col gap-0.5 max-w-[72%] ${
                  isMine ? 'items-end' : 'items-start'
                }`}
              >
                {!isMine && sender && (
                  <span className="fqd-name text-2xs text-muted px-1 mb-0.5">
                    {sender.display_name}
                  </span>
                )}
                {group.msgs.map((msg, mi) => {
                  const isFirst = mi === 0
                  return (
                    <div
                      key={msg.id}
                      className={`fqd-bub ${isMine ? 'is-mine' : 'is-theirs'} px-3 py-2 text-body-sm leading-relaxed break-words ${
                        isMine
                          ? 'bg-primary text-on-primary rounded-card rounded-br-md'
                          : 'bg-surface-elevated text-text rounded-card rounded-bl-md'
                      } ${isFirst && !isMine ? 'rounded-tl-card' : ''} ${
                        isFirst && isMine ? 'rounded-tr-card' : ''
                      }`}
                    >
                      {msg.body}
                    </div>
                  )
                })}
                {/* 🔴 THE TIMESTAMP GOES UNDER THE RUN, NOT BESIDE IT.
                    It used to be a flex SIBLING of the bubble inside this `max-w-[72%]` column,
                    with no `shrink-0` and no `whitespace-nowrap`. So on any message long enough
                    to claim the full width — which is most of them — flex squeezed the span to a
                    few pixels and "Aug 20, 8:14 PM" wrapped one word per line into a crushed
                    column against the edge. Owner report, 2026-08-22.
                    In the column it cannot be squeezed at all, and `whitespace-nowrap` means it
                    could not wrap even if something tried. It keeps its space at rest
                    (`opacity-0`, not `hidden`), so revealing it never reflows the transcript. */}
                <time
                  dateTime={group.msgs[group.msgs.length - 1]!.created_at}
                  className="px-1 text-3xs text-muted whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none"
                >
                  {formatTime(group.msgs[group.msgs.length - 1]!.created_at)}
                </time>
              </div>
            </div>
          )
        })}
        <TypingIndicator names={typingNames} />
      </div>

      {/* ── Composer ──────────────────────────────── */}
      {/* One box, shared with every other chat surface: it GROWS as you type (the old one was
          pinned at one row and scrolled your own sentence out of sight), owns Enter-to-send,
          and keeps the draft on a failed send. */}
      <div className="fqd-compose shrink-0 border-t border-border bg-surface px-4 py-3">
        <ChatComposer
          value={body}
          onValueChange={(next) => {
            setBody(next)
            notifyTyping()
          }}
          onSend={submit}
          label="Message"
          placeholder="Message…"
          pending={isPending}
          error={error}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { sendMessage } from '@/app/(main)/messages/actions'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { useTypingIndicator } from '@/lib/realtime/use-typing'
import { TypingIndicator } from '@/components/messages/typing-indicator'
import { ChatComposer } from '@/components/ui/chat-composer'
import { useStickToBottom } from '@/components/ui/use-stick-to-bottom'

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
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Build a map for quick participant lookup
  const participantMap = Object.fromEntries(participants.map((p) => [p.id, p]))

  // Live typing indicator (Broadcast — see lib/realtime/use-typing.ts)
  const { typingNames, notifyTyping, stopTyping } = useTypingIndicator({
    scope: `conv:${conversationId}`,
    userId: myProfileId,
    displayName: participantMap[myProfileId]?.display_name,
  })

  // The transcript's own scroller. `useStickToBottom` sets scrollTop on THIS element and
  // nothing else, which is the fix for the reported "it scrolls the main page behind it up":
  // the old `bottomRef.scrollIntoView()` walked every scrollable ancestor, and the dock is
  // position:fixed, so the ancestor the browser found to scroll was the document. It also
  // stops yanking the reader to the bottom while they are scrolled up reading history.
  // The coarse-pointer autofocus rule moved into ChatComposer for the same reason: one seam.
  const { ref: listRef, stickNow } = useStickToBottom<HTMLDivElement>([messages.length, typingNames.length])

  // Supabase Realtime subscription for new messages
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            // My own realtime echo: replace the optimistic placeholder for this message rather than
            // appending, so a DM I just sent doesn't briefly double-render (the optimistic id is
            // `optimistic-*`, which the id dedup above can't match against the real row's uuid).
            if (newMsg.sender_id === myProfileId) {
              const i = prev.findIndex((m) => m.id.startsWith('optimistic-') && m.body === newMsg.body)
              if (i !== -1) {
                const next = prev.slice()
                next[i] = newMsg
                return next
              }
            }
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, myProfileId])

  function submit() {
    const trimmed = body.trim()
    if (!trimmed || isPending) return

    setError(null)

    // Optimistic insert
    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: myProfileId,
      body: trimmed,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    setBody('')
    stopTyping()
    stickNow()

    const fd = new FormData()
    fd.set('body', trimmed)

    startTransition(async () => {
      try {
        await sendMessage(conversationId, fd)
      } catch (err) {
        // The send failed (e.g. the other member has been blocked) — roll back the
        // optimistic bubble and restore the draft so the text isn't lost.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        setBody((cur) => (cur ? cur : trimmed))
        setError(err instanceof Error ? err.message : 'Message failed to send. Try again.')
      }
    })
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
      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
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
              className={`flex items-end gap-2.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
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
                  <span className="text-2xs text-muted px-1 mb-0.5">
                    {sender.display_name}
                  </span>
                )}
                {group.msgs.map((msg, mi) => {
                  const isFirst = mi === 0
                  return (
                    <div
                      key={msg.id}
                      className={`px-3 py-2 text-body-sm leading-relaxed break-words ${
                        isMine
                          ? 'bg-primary text-on-primary rounded-2xl rounded-br-md'
                          : 'bg-surface-elevated text-text rounded-2xl rounded-bl-md'
                      } ${isFirst && !isMine ? 'rounded-tl-2xl' : ''} ${
                        isFirst && isMine ? 'rounded-tr-2xl' : ''
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
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
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

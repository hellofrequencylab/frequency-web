'use client'

import { useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import { PenLine, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendRoomMessage, markRoomRead } from '@/app/(main)/messages/rooms/actions'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { useTypingIndicator } from '@/lib/realtime/use-typing'
import { TypingIndicator } from '@/components/messages/typing-indicator'
import { ChatComposer } from '@/components/ui/chat-composer'
import { useStickToBottom } from '@/components/ui/use-stick-to-bottom'
import { roomPostGateReason, type RoomVisibility } from '@/lib/messages/room-access'

export type RoomMessage = {
  id: string
  room_id: string
  author_id: string
  body: string
  created_at: string
  author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

// The composer distinguishes a question from a plan (DAWN message-board pass,
// design_handoff/CHANGES.md). The kind is a WRITING AID, not a stored field: it
// swaps the placeholder and the hint so a plan leaves with a time and a place in
// it. The message posts through the same sendRoomMessage action either way.
type ComposeKind = 'question' | 'plan'

const KIND_COPY: Record<ComposeKind, { chip: string; placeholder: string; hint: string }> = {
  question: {
    chip: 'A question',
    placeholder: 'Ask it plain. Somebody in here knows.',
    hint: 'One clear question gets faster answers than a preamble.',
  },
  plan: {
    chip: 'A plan',
    placeholder: 'Where, when, and how many people can come.',
    hint: 'A plan with a time and a place in it is easy to say yes to.',
  },
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function RoomThread({
  roomId,
  initialMessages,
  myProfileId,
  canPost,
  visibility,
}: {
  roomId: string
  initialMessages: RoomMessage[]
  myProfileId: string
  /** Resolved by the caller through `canPostToRoom` (lib/messages/room-access.ts), never
   *  re-derived here: the page and the dock must not be able to answer it differently. */
  canPost: boolean
  /** Required, not optional, and that is the point: the sentence shown to someone who cannot
   *  post depends on it, and a defaulted prop is how a Channel visitor ends up being told to
   *  "join the room" — a door that does not exist for a Channel. */
  visibility: RoomVisibility
}) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages)
  const [body, setBody] = useState('')
  // The composer starts CLOSED, as one line (DAWN room law): a big empty box asks
  // everyone to perform; a prompt asks them to say something.
  const [composerOpen, setComposerOpen] = useState(false)
  const [kind, setKind] = useState<ComposeKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  // Live typing indicator (Broadcast — see lib/realtime/use-typing.ts)
  const { typingNames, notifyTyping, stopTyping } = useTypingIndicator({
    scope: `room:${roomId}`,
    userId: myProfileId,
  })

  // Pin the transcript to its newest message by setting scrollTop on the LIST — never
  // `scrollIntoView`, which walks up to the document and scrolls the page behind the dock.
  const { ref: listRef, stickNow } = useStickToBottom<HTMLDivElement>([messages.length, typingNames.length])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const m = payload.new as RoomMessage
          // NO `messages.some(...)` guard here: this callback is created once (deps are
          // [roomId]), so `messages` inside it is frozen at the array this component mounted
          // with. The old early-return therefore never fired for a live message and only cost
          // a wasted profile fetch. The setMessages updater below dedups against CURRENT
          // state, which is the only place that can see it.

          // Fetch the author info for the new message
          const { data: author } = await supabase
            .from('profiles')
            .select('id, display_name, handle, avatar_url')
            .eq('id', m.author_id)
            .maybeSingle()

          setMessages(prev => {
            if (prev.some(x => x.id === m.id)) return prev
            return [...prev, { ...m, author: author ?? null }]
          })
        }
      )
      .subscribe()

    // Mark room as read on mount
    markRoomRead(roomId)

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || isPending) return

    setError(null)
    stickNow()
    startTransition(async () => {
      try {
        await sendRoomMessage(roomId, trimmed)
        setBody('')
        stopTyping()
      } catch (err) {
        // Was `console.error(err)` — a room message that failed to post vanished with no sign
        // it had gone anywhere, which is indistinguishable from "sent" to the member.
        setError(err instanceof Error ? err.message : 'That message did not post. Try again.')
      }
    })
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-body-sm text-subtle">No messages yet. Start the conversation.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1]
            const showAuthor = !prev || prev.author_id !== m.author_id ||
              (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) > 5 * 60 * 1000

            const isOwn = m.author_id === myProfileId
            const a = m.author

            return (
              <div key={m.id} className={`flex gap-3 ${showAuthor ? 'mt-3' : ''}`}>
                {showAuthor && a ? (
                  a.avatar_url ? (
                    <Image src={avatarSrc(a.avatar_url)} alt={a.display_name} width={36} height={36} className="w-9 h-9 rounded-pill object-cover shrink-0" style={avatarFocusStyle(a.avatar_url)} />
                  ) : (
                    <div className="w-9 h-9 rounded-pill bg-primary-bg text-primary-strong text-meta font-semibold flex items-center justify-center shrink-0 select-none">
                      {getInitials(a.display_name)}
                    </div>
                  )
                ) : (
                  <div className="w-9 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  {showAuthor && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className={`text-body-sm font-semibold ${isOwn ? 'text-primary-strong' : 'text-text'}`}>
                        {a?.display_name ?? 'Unknown'}
                      </span>
                      <span className="text-3xs text-muted">{formatTime(m.created_at)}</span>
                    </div>
                  )}
                  <p className="text-body-sm text-text whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </div>
              </div>
            )
          })
        )}
        <TypingIndicator names={typingNames} />
      </div>

      {/* Composer — starts closed as one line; open, it knows a question from a plan. */}
      {canPost ? (
        !composerOpen ? (
          <div className="px-5 py-3 border-t border-border bg-surface shrink-0">
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="flex w-full items-center gap-3 rounded-control border border-border bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-border-strong"
            >
              <span className="min-w-0 flex-1 truncate text-body-sm text-subtle">
                Say something to the room. If it is a plan, put a time in it.
              </span>
              <PenLine className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-3 border-t border-border bg-surface shrink-0">
            <div className="lift-1 rounded-card border border-border bg-surface p-3">
              <div className="mb-2 flex items-center gap-1.5">
                {(Object.keys(KIND_COPY) as ComposeKind[]).map(k => {
                  const on = kind === k
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setKind(on ? null : k)}
                      className={`rounded-pill border px-2.5 py-1 text-meta font-medium transition-colors ${
                        on
                          ? 'border-primary/40 bg-primary-bg text-primary-strong'
                          : 'border-border text-muted hover:text-text'
                      }`}
                    >
                      {KIND_COPY[k].chip}
                    </button>
                  )
                })}
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-muted"
                  aria-label="Close composer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ChatComposer
                value={body}
                onValueChange={next => { setBody(next); notifyTyping() }}
                onSend={submit}
                label="Say it to the room"
                placeholder={kind ? KIND_COPY[kind].placeholder : 'Say it to the room.'}
                pending={isPending}
                error={error}
                autoFocus
                // Escape closes an empty composer, the way it did before it moved onto the
                // shared primitive: a member who opened the box by accident gets out of it.
                onKeyDown={e => { if (e.key === 'Escape' && !body.trim()) setComposerOpen(false) }}
                // The kind hint IS this composer's footer line, so it takes the slot the
                // generic "Enter to send" hint would have used rather than stacking under it.
                footer={kind ? <p className="mt-1.5 text-2xs text-muted">{KIND_COPY[kind].hint}</p> : null}
              />
            </div>
          </form>
        )
      ) : (
        <div className="px-5 py-4 border-t border-border bg-surface/50 dark:bg-canvas/50 text-center">
          <p className="text-meta text-muted">{roomPostGateReason(visibility)}</p>
        </div>
      )}
    </div>
  )
}

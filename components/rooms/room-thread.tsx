'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { Send, Loader2, PenLine, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendRoomMessage, markRoomRead } from '@/app/(main)/messages/rooms/actions'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { useTypingIndicator } from '@/lib/realtime/use-typing'
import { TypingIndicator } from '@/components/messages/typing-indicator'

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
}: {
  roomId: string
  initialMessages: RoomMessage[]
  myProfileId: string
  canPost: boolean
}) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages)
  const [body, setBody] = useState('')
  // The composer starts CLOSED, as one line (DAWN room law): a big empty box asks
  // everyone to perform; a prompt asks them to say something.
  const [composerOpen, setComposerOpen] = useState(false)
  const [kind, setKind] = useState<ComposeKind | null>(null)
  const [isPending, startTransition] = useTransition()
  const endRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Live typing indicator (Broadcast — see lib/realtime/use-typing.ts)
  const { typingNames, notifyTyping, stopTyping } = useTypingIndicator({
    scope: `room:${roomId}`,
    userId: myProfileId,
  })

  // Scroll to bottom when messages change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages.length])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const m = payload.new as RoomMessage
          // Skip if it's my own message. Already added optimistically
          if (m.author_id === myProfileId && messages.some(x => x.id === m.id)) return

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

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || isPending) return

    startTransition(async () => {
      try {
        await sendRoomMessage(roomId, trimmed)
        setBody('')
        stopTyping()
      } catch (err) {
        console.error(err)
      }
    })
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-subtle">No messages yet. Start the conversation.</p>
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
                    <div className="w-9 h-9 rounded-pill bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                      {getInitials(a.display_name)}
                    </div>
                  )
                ) : (
                  <div className="w-9 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  {showAuthor && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className={`text-sm font-semibold ${isOwn ? 'text-primary-strong' : 'text-text'}`}>
                        {a?.display_name ?? 'Unknown'}
                      </span>
                      <span className="text-3xs text-muted">{formatTime(m.created_at)}</span>
                    </div>
                  )}
                  <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </div>
              </div>
            )
          })
        )}
        <TypingIndicator names={typingNames} />
        <div ref={endRef} />
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
              <span className="min-w-0 flex-1 truncate text-sm text-subtle">
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
                      className={`rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors ${
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
              <div className="flex items-end gap-2">
                <textarea
                  value={body}
                  onChange={e => { setBody(e.target.value); notifyTyping() }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submit(e)
                    }
                    if (e.key === 'Escape' && !body.trim()) {
                      setComposerOpen(false)
                    }
                  }}
                  placeholder={kind ? KIND_COPY[kind].placeholder : 'Say it to the room.'}
                  rows={1}
                  autoFocus
                  disabled={isPending}
                  className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder-subtle outline-none focus:border-border-strong focus:ring-2 focus:ring-border-strong/30 dark:focus:ring-border-strong/30 leading-relaxed max-h-32"
                  style={{ minHeight: '2.5rem' }}
                />
                <button
                  type="submit"
                  disabled={!body.trim() || isPending}
                  className="rounded-lg bg-primary p-2.5 text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors"
                  aria-label="Send"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              {kind && (
                <p className="mt-1.5 text-2xs text-muted">{KIND_COPY[kind].hint}</p>
              )}
            </div>
          </form>
        )
      ) : (
        <div className="px-5 py-4 border-t border-border bg-surface/50 dark:bg-canvas/50 text-center">
          <p className="text-xs text-muted">Join this room to send messages.</p>
        </div>
      )}
    </div>
  )
}

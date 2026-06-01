'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { Send, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendRoomMessage, markRoomRead } from '@/app/(main)/messages/rooms/actions'
import { getInitials } from '@/lib/utils'

export type RoomMessage = {
  id: string
  room_id: string
  author_id: string
  body: string
  created_at: string
  author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
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
  const [isPending, startTransition] = useTransition()
  const endRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

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
                    <Image src={a.avatar_url} alt={a.display_name} width={36} height={36} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
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
                      <span className="text-[10px] text-subtle">{formatTime(m.created_at)}</span>
                    </div>
                  )}
                  <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      {canPost ? (
        <form onSubmit={submit} className="px-5 py-3 border-t border-border bg-surface shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit(e)
                }
              }}
              placeholder="Message…"
              rows={1}
              disabled={isPending}
              className="flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder-subtle outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 dark:focus:ring-primary/30 leading-relaxed max-h-32"
              style={{ minHeight: '2.5rem' }}
            />
            <button
              type="submit"
              disabled={!body.trim() || isPending}
              className="rounded-lg bg-primary p-2.5 text-white hover:bg-primary-hover disabled:opacity-40 transition-colors"
              aria-label="Send"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      ) : (
        <div className="px-5 py-4 border-t border-border bg-surface/50 dark:bg-canvas/50 text-center">
          <p className="text-xs text-muted">Join this room to send messages.</p>
        </div>
      )}
    </div>
  )
}

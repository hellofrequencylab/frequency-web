'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { sendMessage } from '@/app/(main)/messages/actions'
import { getInitials } from '@/lib/utils'

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
}: {
  conversationId: string
  initialMessages: Message[]
  myProfileId: string
  participants: Participant[]
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Build a map for quick participant lookup
  const participantMap = Object.fromEntries(participants.map((p) => [p.id, p]))

  // Scroll to bottom on mount and when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
            // Avoid duplicates (the sender already sees their own msg via server action revalidate)
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  function submit() {
    const trimmed = body.trim()
    if (!trimmed || isPending) return

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

    const fd = new FormData()
    fd.set('body', trimmed)

    startTransition(async () => {
      await sendMessage(conversationId, fd)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {groups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-subtle">
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
                      src={sender.avatar_url}
                      alt={sender.display_name}
                      width={28}
                      height={28}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary-bg text-primary-strong text-[10px] font-bold flex items-center justify-center select-none">
                      {sender ? getInitials(sender.display_name) : '?'}
                    </div>
                  )
                )}
                {isMine && <div className="w-7" />}
              </div>

              {/* Bubble stack */}
              <div
                className={`flex flex-col gap-0.5 max-w-[72%] ${
                  isMine ? 'items-end' : 'items-start'
                }`}
              >
                {!isMine && sender && (
                  <span className="text-[11px] text-subtle px-1 mb-0.5">
                    {sender.display_name}
                  </span>
                )}
                {group.msgs.map((msg, mi) => {
                  const isFirst = mi === 0
                  const isLast = mi === group.msgs.length - 1
                  return (
                    <div key={msg.id} className="group flex items-end gap-1.5">
                      {isMine && (
                        <span
                          className={`text-[10px] text-subtle opacity-0 group-hover:opacity-100 transition-opacity ${
                            isLast ? '' : 'invisible'
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </span>
                      )}
                      <div
                        className={`px-3 py-2 text-sm leading-relaxed break-words ${
                          isMine
                            ? 'bg-primary text-on-primary rounded-2xl rounded-br-md'
                            : 'bg-surface-elevated text-text rounded-2xl rounded-bl-md'
                        } ${isFirst && !isMine ? 'rounded-tl-2xl' : ''} ${
                          isFirst && isMine ? 'rounded-tr-2xl' : ''
                        }`}
                      >
                        {msg.body}
                      </div>
                      {!isMine && (
                        <span
                          className={`text-[10px] text-subtle opacity-0 group-hover:opacity-100 transition-opacity ${
                            isLast ? '' : 'invisible'
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Composer ──────────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            rows={1}
            disabled={isPending}
            className="flex-1 resize-none text-sm text-text placeholder-subtle outline-none leading-relaxed bg-surface rounded-xl px-3 py-2.5 max-h-32 disabled:opacity-60"
            style={{ minHeight: '42px' }}
          />
          <button
            onClick={submit}
            disabled={!body.trim() || isPending}
            className="shrink-0 w-9 h-9 rounded-xl bg-primary flex items-center justify-center hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <svg
              className="w-4 h-4 text-on-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 2-7 20-4-9-9-4 20-7z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-subtle mt-1.5 text-right">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

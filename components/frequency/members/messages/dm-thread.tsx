'use client'

import { Fragment, useEffect, useState, useTransition, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendMessage } from '@/app/(main)/messages/actions'
import { useTypingIndicator } from '@/lib/realtime/use-typing'
import { TypingIndicator } from '@/components/messages/typing-indicator'
import { useStickToBottom } from '@/components/ui/use-stick-to-bottom'
import type { Message } from '@/components/messages/thread'

// The Frequency DM transcript and composer (Messages.html): their bubble left on white, yours right
// on the accent gradient, the time under each, a pill input and Send. The behaviour is the
// platform's MessageThread, unchanged: the realtime insert subscription, the typing broadcast, the
// optimistic bubble rolled back with the draft restored on a refused send, and the scroller that
// stays pinned to the newest message without scrolling the page behind it.

type Participant = { id: string; display_name: string }

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const today = d.toDateString() === new Date().toDateString()
  return today
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** The reference's centred day line ("Today") between messages from different days. */
function dayLine(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export function FqDmThread({
  conversationId,
  initialMessages,
  myProfileId,
  participants,
  peerFirstName,
}: {
  conversationId: string
  initialMessages: Message[]
  myProfileId: string
  participants: Participant[]
  peerFirstName: string | null
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const byId = Object.fromEntries(participants.map((p) => [p.id, p]))
  const { typingNames, notifyTyping, stopTyping } = useTypingIndicator({
    scope: `conv:${conversationId}`,
    userId: myProfileId,
    displayName: byId[myProfileId]?.display_name,
  })
  const { ref, stickNow } = useStickToBottom<HTMLDivElement>([messages.length, typingNames.length])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const m = payload.new as Message
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev
          if (m.sender_id === myProfileId) {
            const i = prev.findIndex((x) => x.id.startsWith('optimistic-') && x.body === m.body)
            if (i !== -1) {
              const next = prev.slice()
              next[i] = m
              return next
            }
          }
          return [...prev, m]
        })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, myProfileId])

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text || pending) return
    setError(null)
    const optimistic: Message = { id: `optimistic-${Date.now()}`, conversation_id: conversationId, sender_id: myProfileId, body: text, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, optimistic])
    setBody('')
    stopTyping()
    stickNow()
    const fd = new FormData()
    fd.set('body', text)
    start(async () => {
      try {
        await sendMessage(conversationId, fd)
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        setBody((cur) => cur || text)
        setError(err instanceof Error ? err.message : 'Message failed to send. Try again.')
      }
    })
  }

  return (
    <>
      <div ref={ref} className="fa-pane-b">
        {messages.length === 0 && <p className="why" style={{ textAlign: 'center' }}>No messages yet. Say hello.</p>}
        {messages.map((m, i) => {
          const mine = m.sender_id === myProfileId
          const who = !mine && participants.length > 2 ? byId[m.sender_id]?.display_name : null
          const day = dayLine(m.created_at)
          const newDay = i === 0 || dayLine(messages[i - 1].created_at) !== day
          return (
            <Fragment key={m.id}>
            {newDay && (
              <span className="t2 fqm-daysep" suppressHydrationWarning>
                {day}
              </span>
            )}
            <div className={mine ? 'fa-bub me' : 'fa-bub'}>
              <span>{m.body}</span>
              <small>
                {who ? `${who} · ` : ''}
                <time dateTime={m.created_at} suppressHydrationWarning>{timeLabel(m.created_at)}</time>
              </small>
            </div>
            </Fragment>
          )
        })}
        <TypingIndicator names={typingNames} />
      </div>
      <form className="row fa-pane-f" onSubmit={submit}>
        <input
          className="input grow"
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            notifyTyping()
          }}
          placeholder={peerFirstName ? `Write to ${peerFirstName}` : 'Write a message'}
          aria-label="Message"
          maxLength={4000}
        />
        <button type="submit" className="btn pa" disabled={pending || !body.trim()}>
          Send
        </button>
      </form>
      {error && (
        <p className="t2" role="alert" style={{ padding: '0 22px 14px' }}>
          {error}
        </p>
      )}
    </>
  )
}

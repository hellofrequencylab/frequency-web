'use client'

import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { markConversationRead, sendMessage } from '@/app/(main)/messages/actions'
import { useTypingIndicator } from '@/lib/realtime/use-typing'
import { useStickToBottom } from '@/components/ui/use-stick-to-bottom'
import type { Message } from '@/components/messages/thread'

/**
 * The one direct-message thread (HYG-252). The Messages page (FqDmThread) and the dock
 * (MessageThread) draw a DM differently, but they run THIS for everything a DM does, so a fix to
 * how a DM behaves lands in both at once:
 *
 *  - the realtime insert subscription, with my own echo replacing its optimistic bubble rather than
 *    doubling it (the optimistic id is `optimistic-*`, which an id check cannot match);
 *  - the read mark moving when a message lands while the thread is on screen, so the inbox does not
 *    count it as new (the dock used to skip this, so a DM read in the dock stayed unread);
 *  - the typing broadcast;
 *  - the scroller pinned to the newest message without scrolling the page behind it;
 *  - the optimistic send, rolled back with the words handed back on a refused send.
 *
 * The view owns only its draft box and how it words a failure.
 */
export function useDmThread({
  conversationId,
  initialMessages,
  myProfileId,
  myDisplayName,
}: {
  conversationId: string
  initialMessages: Message[]
  myProfileId: string
  myDisplayName?: string
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [pending, start] = useTransition()
  const { typingNames, notifyTyping, stopTyping } = useTypingIndicator({
    scope: `conv:${conversationId}`,
    userId: myProfileId,
    displayName: myDisplayName,
  })
  const { ref: listRef, stickNow } = useStickToBottom<HTMLDivElement>([messages.length, typingNames.length])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
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
          if (m.sender_id !== myProfileId && document.visibilityState === 'visible') {
            void markConversationRead(conversationId).catch(() => {})
          }
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, myProfileId])

  /** Send `text` with an optimistic bubble. On a refused send the bubble goes, and `onFail` gets the
   *  error and the words, so the view can put them back in its box. False when nothing was sent. */
  function send(text: string, onFail: (err: unknown, text: string) => void): boolean {
    const trimmed = text.trim()
    if (!trimmed || pending) return false
    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: myProfileId,
      body: trimmed,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    stopTyping()
    stickNow()
    const fd = new FormData()
    fd.set('body', trimmed)
    start(async () => {
      try {
        await sendMessage(conversationId, fd)
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
        onFail(err, trimmed)
      }
    })
    return true
  }

  return { messages, pending, typingNames, notifyTyping, listRef, send }
}

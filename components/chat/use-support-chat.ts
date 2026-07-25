'use client'

// Client transport for a live-chat thread (ADR-816). Message history is the durable server truth (loaded +
// persisted via server actions); LIVE delivery + typing ride Supabase Broadcast on a token-named channel
// (`chat:<token>`), which needs no auth/RLS — the unguessable token IS the access control. Reused by the
// visitor widget and the operator bridge; each passes its own `persist` (visitor → inbound, staff → outbound)
// so the same hook drives both ends of the conversation.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTypingIndicator } from '@/lib/realtime/use-typing'
import { isError, type ActionResult } from '@/lib/action-result'
import type { ChatMessage } from '@/lib/comms/support-chat'

type Channel = ReturnType<ReturnType<typeof createClient>['channel']>

export function useSupportChat({
  token,
  viewerId,
  viewerName,
  role,
  persist,
  loadHistory,
}: {
  token: string
  /** Stable id for this viewer (ignored on echo). */
  viewerId: string
  viewerName?: string
  role: 'visitor' | 'staff'
  /** Persist a message server-side; returns the stored row. */
  persist: (body: string) => Promise<ActionResult<ChatMessage>>
  /** Load the durable transcript. */
  loadHistory: () => Promise<ActionResult<{ messages: ChatMessage[] }>>
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<Channel | null>(null)
  const { typingNames, notifyTyping, stopTyping } = useTypingIndicator({ scope: token, userId: viewerId, displayName: viewerName })

  const addUnique = useCallback((m: ChatMessage) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
  }, [])

  useEffect(() => {
    let alive = true
    const supabase = createClient()
    const channel = supabase.channel(`chat:${token}`, { config: { broadcast: { self: false } } })
    channel
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        const m = payload as ChatMessage | undefined
        if (m?.id && typeof m.body === 'string') addUnique(m)
      })
      .subscribe()
    channelRef.current = channel

    loadHistory().then((r) => {
      if (!alive) return
      if (!isError(r)) setMessages(r.data.messages)
      setLoading(false)
    })

    return () => {
      alive = false
      // Channel hygiene: always remove on unmount (leaked channels exhaust the Realtime limit).
      supabase.removeChannel(channel)
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const send = useCallback(
    async (raw: string) => {
      const body = raw.trim()
      if (!body) return
      setError(null)
      stopTyping()
      const optimisticId = `tmp-${viewerId}-${Math.random().toString(36).slice(2)}`
      const optimistic: ChatMessage = { id: optimisticId, author: role, body, at: new Date().toISOString() }
      setMessages((prev) => [...prev, optimistic])
      const r = await persist(body)
      if (isError(r)) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        setError(r.error)
        return
      }
      // Swap the optimistic row for the stored one, and broadcast it to the other side.
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? r.data : m)))
      channelRef.current?.send({ type: 'broadcast', event: 'message', payload: r.data })
    },
    [persist, role, stopTyping, viewerId],
  )

  return { messages, loading, error, send, typingNames, notifyTyping }
}

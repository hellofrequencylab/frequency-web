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

// Copy for the two failures the server never gets to describe (a dropped connection, an unhandled
// server error). A returned `ActionResult` carries its own wording; these are the fallbacks.
const SEND_FAILED = 'That message did not send. Try again.'
const HISTORY_FAILED = 'We could not load this conversation. Try again in a moment.'

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

    loadHistory()
      .then((r) => {
        if (!alive) return
        // MERGE, don't replace: a broadcast can land before this resolves, and a bare
        // `setMessages(r.data.messages)` dropped it on the floor. Server rows first (they are
        // the durable truth and carry the real order), then anything live we already hold.
        if (!isError(r)) {
          setMessages((prev) => {
            const seen = new Set(r.data.messages.map((m) => m.id))
            return [...r.data.messages, ...prev.filter((m) => !seen.has(m.id))]
          })
        }
        setLoading(false)
      })
      // A server action REJECTS on a dropped connection or an unhandled server error, which never
      // reaches the `.then` above. Without this the panel sits on "Loading…" for the rest of the
      // session, and the reader has nothing to act on.
      .catch(() => {
        if (!alive) return
        setError(HISTORY_FAILED)
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

  /** Send, and report whether it landed. The BOOLEAN matters: both callers clear their draft
   *  the moment they call this, so without a failure signal a rejected message took the
   *  operator's (or visitor's) typed text with it — the error banner appeared and the words
   *  were gone. They now put the draft back on `false`. */
  const send = useCallback(
    async (raw: string): Promise<boolean> => {
      const body = raw.trim()
      if (!body) return false
      setError(null)
      stopTyping()
      const optimisticId = `tmp-${viewerId}-${crypto.randomUUID()}`
      const optimistic: ChatMessage = { id: optimisticId, author: role, body, at: new Date().toISOString() }
      setMessages((prev) => [...prev, optimistic])
      // A returned failure and a REJECTION are the same event to the person typing, so they get the
      // same handling. Only the returned failure was covered before, and a rejection is the likelier
      // one out here: a phone losing signal mid-send rejects the action rather than answering it.
      // On that path the promise threw past `return false`, so the caller's `.then` never ran, the
      // draft went with it, the optimistic bubble stayed on screen reading as sent, and nothing said so.
      let r: ActionResult<ChatMessage>
      try {
        r = await persist(body)
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        setError(SEND_FAILED)
        return false
      }
      // Only the CALL is guarded: what follows has already been stored, so a throw down there is not
      // a failed send and must never be reported as one.
      if (isError(r)) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        setError(r.error)
        return false
      }
      // Swap the optimistic row for the stored one, and broadcast it to the other side.
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? r.data : m)))
      channelRef.current?.send({ type: 'broadcast', event: 'message', payload: r.data })
      return true
    },
    [persist, role, stopTyping, viewerId],
  )

  return { messages, loading, error, send, typingNames, notifyTyping }
}

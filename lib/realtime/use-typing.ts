'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Live typing indicator over Supabase Realtime **Broadcast** (not postgres_changes).
 *
 * Why Broadcast: typing is ephemeral, high-frequency, and must never touch the DB or
 * run an RLS check per keystroke. Broadcast is the <50ms, non-persisted channel — the
 * right primitive for "someone is typing…", presence pings, and live cursors. Message
 * history stays on postgres_changes (MessageThread / RoomThread), where durability and
 * RLS belong. This split is the documented best practice (docs/MESSAGING-PLATFORM.md).
 *
 * Transport is wrapped here so the whole app can later swap to Broadcast-from-Database
 * without touching a single caller.
 */

const TYPING_EXPIRY_MS = 4000 // drop a typer this long after their last keystroke
const NOTIFY_THROTTLE_MS = 2000 // at most one "typing" broadcast per this window

type Typer = { name: string; at: number }

export function useTypingIndicator({
  scope,
  userId,
  displayName,
}: {
  /** Stable id for the conversation/room, e.g. `conv:<id>` or `room:<id>`. */
  scope: string
  /** The viewer's profile id — used to ignore our own echo. */
  userId: string
  /** The viewer's display name, if known. Falls back to "Someone". */
  displayName?: string
}) {
  const [typers, setTypers] = useState<Record<string, Typer>>({})
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const subscribedRef = useRef(false)
  const lastSentRef = useRef(0)
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const supabase = createClient()
    const timers = timersRef.current
    const channel = supabase.channel(`typing:${scope}`, { config: { broadcast: { self: false } } })

    const dropTyper = (id: string) =>
      setTypers((prev) => {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { id, name } = (payload ?? {}) as { id?: string; name?: string }
        if (!id || id === userId) return
        setTypers((prev) => ({ ...prev, [id]: { name: name || 'Someone', at: Date.now() } }))
        if (timers[id]) clearTimeout(timers[id])
        timers[id] = setTimeout(() => dropTyper(id), TYPING_EXPIRY_MS)
      })
      .on('broadcast', { event: 'stop' }, ({ payload }) => {
        const { id } = (payload ?? {}) as { id?: string }
        if (!id) return
        if (timers[id]) clearTimeout(timers[id])
        dropTyper(id)
      })
      .subscribe((status) => {
        subscribedRef.current = status === 'SUBSCRIBED'
      })

    channelRef.current = channel

    return () => {
      Object.values(timers).forEach(clearTimeout)
      timersRef.current = {}
      subscribedRef.current = false
      // Channel hygiene: always remove on unmount. Leaked channels are the #1 cause of
      // hitting Realtime connection limits.
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [scope, userId])

  /** Call on every keystroke in the composer. Throttled internally. */
  const notifyTyping = useCallback(() => {
    if (!subscribedRef.current) return
    const now = Date.now()
    if (now - lastSentRef.current < NOTIFY_THROTTLE_MS) return
    lastSentRef.current = now
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: userId, name: displayName || 'Someone' } })
  }, [userId, displayName])

  /** Call once the viewer sends a message or clears the composer. */
  const stopTyping = useCallback(() => {
    lastSentRef.current = 0
    if (!subscribedRef.current) return
    channelRef.current?.send({ type: 'broadcast', event: 'stop', payload: { id: userId } })
  }, [userId])

  return { typingNames: Object.values(typers).map((t) => t.name), notifyTyping, stopTyping }
}

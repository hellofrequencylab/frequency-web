'use client'

import { useEffect, useRef } from 'react'

// LIVE THREADS (LIVE-2528). A new message in a thread is broadcast from the database to the
// thread's private topic (migration 20270346310000), and a realtime.messages policy lets in only
// people who can read the thread. This joins that topic and calls `onMessage` when something
// lands, a beat later so a burst is one refetch. The payload carries no body: the caller refetches
// through its own RLS read. The Supabase client loads lazily, so a page pays for it only when a
// thread is on screen. Realtime is an enhancement: a page that cannot subscribe still works on reload.

export function useThreadLive(topic: string | null, onMessage: () => void): void {
  const latest = useRef(onMessage)
  useEffect(() => {
    latest.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!topic) return
    let cancelled = false
    let cleanup: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    void (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        if (cancelled) return
        const supabase = createClient()
        await supabase.realtime.setAuth()
        if (cancelled) return
        const channel = supabase
          .channel(topic, { config: { private: true } })
          .on('broadcast', { event: 'message' }, () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => latest.current(), 300)
          })
          .subscribe()
        cleanup = () => {
          void supabase.removeChannel(channel)
        }
        if (cancelled) cleanup()
      } catch {
        // Reload still shows everything.
      }
    })()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      cleanup?.()
    }
  }, [topic])
}

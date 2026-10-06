'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { consumeLocalEcho, showRemoteRewardToast } from '@/components/zap-toast'

// Cross-device reward feedback (LIVE-671). Every Zap and Gem reward lands in a ledger whose
// trigger (migration 20270346002200, private.broadcast_member_reward) sends a Realtime Broadcast
// to the member's PRIVATE topic `member:<profileId>`; a Realtime policy lets only that member
// receive it. This listens, raises the reward toast, and refreshes the page so the balances move,
// on every device the member has open, without a reload.
//
// The Supabase client is imported lazily inside the effect, so the shell's eager chunk carries
// none of it (check:shell-weight). A reward this tab already toasted itself is not repeated.
// Renders nothing.

type RewardPayload = { kind?: string; amount?: number; action?: string }

export function RewardLive({ profileId }: { profileId: string }) {
  const router = useRouter()
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | null = null

    void (async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        if (cancelled) return
        const supabase = createClient()
        // Private channels authorize with the member's own access token (realtime.messages RLS).
        await supabase.realtime.setAuth()
        if (cancelled) return
        const channel = supabase
          .channel(`member:${profileId}`, { config: { private: true } })
          .on('broadcast', { event: 'reward' }, ({ payload }: { payload: RewardPayload }) => {
            const amount = Math.floor(Number(payload?.amount ?? 0))
            if (!Number.isFinite(amount) || amount <= 0) return
            const kind = payload?.kind === 'gems' ? 'gems' : 'zaps'
            if (!consumeLocalEcho(kind, amount)) {
              showRemoteRewardToast({ amount, kind, label: 'Earned on another device' })
            }
            // Several ledger rows can land together (a capture paying Zaps and Gems): one refresh.
            if (refreshTimer.current) clearTimeout(refreshTimer.current)
            refreshTimer.current = setTimeout(() => router.refresh(), 800)
          })
          .subscribe()
        cleanup = () => {
          void supabase.removeChannel(channel)
        }
        if (cancelled) cleanup()
      } catch {
        // Realtime is an enhancement: a page that cannot subscribe still works on reload.
      }
    })()

    return () => {
      cancelled = true
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      cleanup?.()
    }
  }, [profileId, router])

  return null
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Gem, Zap } from 'lucide-react'
import { Toast } from '@/components/ui/toast'

// Lightweight "you earned zaps" toast. Mirrors the achievement-toast pattern: a
// global container listens for a window CustomEvent; showZapToast() dispatches it.
// Used for realtime reward feedback on verified practice / captures (Phase 3).
//
// The CARD is components/ui/toast.tsx now — this file keeps only what is actually
// zap-specific: the event name, the reward shape, the copy, and the 4s dwell. The
// shell, the slide-up, the timer and the `role="status"` announcement are the kit's.

export interface ZapReward {
  amount: number
  label?: string
  /** Gems ride the same lane (LIVE-671, a reward pushed from another device). Default 'zaps'. */
  kind?: 'zaps' | 'gems'
}

const EVENT = 'zaps-earned'

function ZapToastCard({ reward, onDismiss }: { reward: ZapReward; onDismiss: () => void }) {
  return (
    <Toast
      icon={reward.kind === 'gems' ? <Gem className="h-5 w-5" strokeWidth={2.5} /> : <Zap className="h-5 w-5" strokeWidth={2.5} />}
      title={`+${reward.amount} ${reward.kind === 'gems' ? 'Gems' : 'Zaps'}`}
      tone="primary"
      duration={4000}
      onDismiss={onDismiss}
    >
      {reward.label ?? (reward.kind === 'gems' ? 'Reward earned' : 'Verified practice')}
    </Toast>
  )
}

export function ZapToastContainer() {
  const [toasts, setToasts] = useState<{ key: number; reward: ZapReward }[]>([])

  useEffect(() => {
    function handle(e: Event) {
      const reward = (e as CustomEvent<ZapReward>).detail
      if (!reward || reward.amount <= 0) return
      setToasts((prev) => [...prev, { key: Date.now() + Math.random(), reward }])
    }
    window.addEventListener(EVENT, handle)
    return () => window.removeEventListener(EVENT, handle)
  }, [])

  const dismiss = useCallback((key: number) => {
    setToasts((prev) => prev.filter((t) => t.key !== key))
  }, [])

  return (
    // The lane itself is <ToastLane> in app/(main)/layout.tsx — ONE fixed column shared with the
    // achievement stack. This container used to declare its own `fixed bottom-32 right-4 z-50 …
    // md:bottom-24`, byte-identical to the achievement toast's, so two independent boxes claimed
    // the same rect and DOM order decided which one a member could read. Worse, both sat at z-50
    // alongside the Vera panel and BELOW it in DOM order, so a "+15 Zaps" toast fired while the
    // panel was open was awarded to a member who never saw it. See components/toast-lane.tsx.
    <div className="flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <ZapToastCard key={t.key} reward={t.reward} onDismiss={() => dismiss(t.key)} />
      ))}
    </div>
  )
}

// The toasts this tab raised itself, briefly remembered so the cross-device feed
// (components/reward-live.tsx) does not repeat a reward the member is already looking at.
const recentLocal: { kind: 'zaps' | 'gems'; amount: number; at: number }[] = []
const ECHO_WINDOW_MS = 15_000

export function showZapToast(reward: ZapReward) {
  if (typeof window === 'undefined' || reward.amount <= 0) return
  const now = Date.now()
  recentLocal.push({ kind: reward.kind ?? 'zaps', amount: reward.amount, at: now })
  while (recentLocal.length > 20 || (recentLocal[0] && now - recentLocal[0].at > ECHO_WINDOW_MS)) recentLocal.shift()
  window.dispatchEvent(new CustomEvent(EVENT, { detail: reward }))
}

/** Did this tab just show this reward itself? Consumes the match, so a second real reward of the
 *  same size still shows. PURE apart from that one-shot memory. */
export function consumeLocalEcho(kind: 'zaps' | 'gems', amount: number, now = Date.now()): boolean {
  const i = recentLocal.findIndex((r) => r.kind === kind && r.amount === amount && now - r.at <= ECHO_WINDOW_MS)
  if (i === -1) return false
  recentLocal.splice(i, 1)
  return true
}

/** Raise a reward toast that arrived from elsewhere, without recording it as local. */
export function showRemoteRewardToast(reward: ZapReward) {
  if (typeof window === 'undefined' || reward.amount <= 0) return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: reward }))
}

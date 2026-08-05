'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap } from 'lucide-react'
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
}

const EVENT = 'zaps-earned'

function ZapToastCard({ reward, onDismiss }: { reward: ZapReward; onDismiss: () => void }) {
  return (
    <Toast
      icon={<Zap className="h-5 w-5" strokeWidth={2.5} />}
      title={`+${reward.amount} Zaps`}
      tone="primary"
      duration={4000}
      onDismiss={onDismiss}
    >
      {reward.label ?? 'Verified practice'}
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

export function showZapToast(reward: ZapReward) {
  if (typeof window === 'undefined' || reward.amount <= 0) return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: reward }))
}

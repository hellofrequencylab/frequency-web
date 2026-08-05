'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap } from 'lucide-react'

// Lightweight "you earned zaps" toast. Mirrors the achievement-toast pattern: a
// global container listens for a window CustomEvent; showZapToast() dispatches it.
// Used for realtime reward feedback on verified practice / captures (Phase 3).

export interface ZapReward {
  amount: number
  label?: string
}

const EVENT = 'zaps-earned'

function ZapToastCard({ reward, onDismiss }: { reward: ZapReward; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-primary-bg bg-surface lift-3 px-4 py-3 animate-[slideUp_0.4s_ease-out]">
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-bg text-primary-strong shrink-0">
        <Zap className="w-5 h-5" strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <p className="text-body-sm font-bold text-text leading-none">+{reward.amount} Zaps</p>
        <p className="text-meta text-muted mt-1">{reward.label ?? 'Verified practice'}</p>
      </div>
    </div>
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

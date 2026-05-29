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
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-primary-bg bg-surface shadow-xl px-4 py-3 animate-[slideUp_0.4s_ease-out]">
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-bg text-primary-strong shrink-0">
        <Zap className="w-5 h-5" strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-text leading-none">+{reward.amount} zaps</p>
        <p className="text-xs text-muted mt-1">{reward.label ?? 'Verified practice'}</p>
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
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
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

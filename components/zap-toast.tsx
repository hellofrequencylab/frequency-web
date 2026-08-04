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
        <p className="text-sm font-bold text-text leading-none">+{reward.amount} Zaps</p>
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
    // The TOAST LANE of the bottom-right stacking contract (see the comment in
    // components/sidebar/game-stats-dock.tsx): lg keeps it above the Vault dock chip
    // (bottom-32), md above the chat edge pill (bottom-20) — a "+15 Zaps" toast must
    // never cover the Zaps counter at the exact reward moment. On mobile the lane clears
    // the bottom tab bar (h-14) at bottom-20, matching achievement-toast: at bottom-4 a
    // reward toast landed BEHIND the tab bar, which is the one moment it must be readable.
    // BOTTOM-RIGHT LANE, and the arithmetic behind it (verified 2026-08-04).
    // Mobile: the chat edge pill sits at bottom-20 with h-11, so it occupies 80-124px, and
    // the tab bar is 3.5rem + env(safe-area-inset-bottom) = up to ~90px on a home-indicator
    // phone. bottom-32 (128px) is the first lane clearing BOTH; the previous bottom-20 sat
    // on top of the pill and, with the inset, back inside the bar.
    // md and up: the tab bar is gone and the pill drops to bottom-6 (24-68px), so bottom-20
    // clears it by 12px. Deliberately LOWER than mobile, because the pill is what has to be
    // cleared and the pill is higher on mobile.
    // The old lg:bottom-32 reserved 128px for GameStatsDockClient, which has had zero mount
    // sites since the Vault moved back into the rail.
    <div className="pointer-events-none fixed bottom-32 right-4 z-50 flex flex-col gap-2 items-end md:bottom-24">
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

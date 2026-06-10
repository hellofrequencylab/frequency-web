'use client'

import { useEffect } from 'react'
import { showZapToast } from '@/components/zap-toast'

// Global surfacing for ZAP Surprises (ADR-210). Mounted once in the app shell, it
// asks /api/surprises/recent for any fresh Zap surprise grants and replays them as
// the existing zap toast. Decoupled on purpose: the real-world acts that earn a Zap
// surprise fire gamification fire-and-forget (and a referral surprise lands for the
// referrer while they're off elsewhere), so there is no in-flow result to ride.
//
// Dedup is per-device via localStorage of seen rule_keys — showing a delight toast
// at most once per device is the right grain; the grant itself is idempotent
// server-side, so a re-show on another device costs nothing real. It checks on
// mount, when the tab regains focus/visibility, and on a gentle visible-only
// interval (surprises are rare, so this stays cheap).

const SEEN_KEY = 'frequency.surprises.seen'
const POLL_MS = 90_000

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function rememberSeen(keys: string[]) {
  try {
    const seen = readSeen()
    for (const k of keys) seen.add(k)
    // Keep the list bounded — only the most recent matter for dedup.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-100)))
  } catch {
    // localStorage unavailable (private mode) — dedup degrades, never throws.
  }
}

interface RecentSurprise {
  key: string
  amount: number
  label: string
}

export function SurpriseToaster() {
  useEffect(() => {
    let cancelled = false

    async function check() {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/surprises/recent', { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const { surprises } = (await res.json()) as { surprises?: RecentSurprise[] }
        if (cancelled || !surprises?.length) return

        const seen = readSeen()
        const fresh = surprises.filter((s) => !seen.has(s.key))
        if (!fresh.length) return

        // Oldest first, so multiple stack in the order they were earned.
        for (const s of [...fresh].reverse()) {
          showZapToast({ amount: s.amount, label: s.label })
        }
        rememberSeen(fresh.map((s) => s.key))
      } catch {
        // Network hiccup — try again on the next trigger.
      }
    }

    check()
    const onVisible = () => check()
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    const id = window.setInterval(check, POLL_MS)

    return () => {
      cancelled = true
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(id)
    }
  }, [])

  return null
}

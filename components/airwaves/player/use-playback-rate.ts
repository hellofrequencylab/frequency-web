'use client'

// The speed preference, persisted (Airwaves plan §7b, item 6). One value in localStorage under
// RATE_STORAGE_KEY, read on mount and written on every change, so the chosen speed carries across
// Recordings and reloads. (The plan also names a per-member `member_prefs` row for cross-device
// sync — that is the data layer's job; this hook owns the instant-apply localStorage half.)

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_RATE,
  RATE_STORAGE_KEY,
  clampRate,
  cycleRate,
  type PlaybackRate,
} from './playback'

interface UsePlaybackRate {
  rate: PlaybackRate
  /** Set an explicit rate (snapped onto the fixed set). */
  setRate: (rate: number) => void
  /** Advance one step in the cycle (default faster); wraps 3x -> 0.5x. */
  cycle: (dir?: 1 | -1) => void
}

function readStoredRate(): PlaybackRate {
  if (typeof window === 'undefined') return DEFAULT_RATE
  try {
    const raw = window.localStorage.getItem(RATE_STORAGE_KEY)
    if (raw == null) return DEFAULT_RATE
    return clampRate(Number(raw))
  } catch {
    return DEFAULT_RATE
  }
}

export function usePlaybackRate(): UsePlaybackRate {
  // Start at the default so server and first client render agree (no hydration mismatch); the
  // stored value is applied in an effect right after mount.
  const [rate, setRateState] = useState<PlaybackRate>(DEFAULT_RATE)

  useEffect(() => {
    // Client-only localStorage read after mount (server render stays at the default, so hydration
    // matches). A one-shot sync from an external store, not a cascading render.
    const stored = readStoredRate()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== DEFAULT_RATE) setRateState(stored)
  }, [])

  const persist = useCallback((next: PlaybackRate) => {
    setRateState(next)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(RATE_STORAGE_KEY, String(next))
    } catch {
      // A blocked / full localStorage must never break playback; the rate still applies in-session.
    }
  }, [])

  const setRate = useCallback((value: number) => persist(clampRate(value)), [persist])
  const cycle = useCallback((dir: 1 | -1 = 1) => persist(cycleRate(rate, dir)), [persist, rate])

  return { rate, setRate, cycle }
}

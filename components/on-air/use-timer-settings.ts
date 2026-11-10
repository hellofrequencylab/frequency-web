'use client'

// The client half of the one timer settings model (LIVE-2240, lib/on-air/timer-settings.ts):
// read the member's copy once on mount (local over server), and save every change the moment it
// happens: localStorage at once, the server after a short quiet gap, flushed on unmount so a
// setting changed just before Close still lands. Both engines and the door use this and nothing
// else to remember a choice.

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveOnAirPrefs } from '@/app/(main)/on-air/actions'
import type { OnAirPrefs } from '@/lib/on-air'
import {
  diffSettings,
  readTimerSettings,
  settingsFromPrefs,
  writeTimerSettings,
  type TimerSettings,
  type TimerSettingsPatch,
} from '@/lib/on-air/timer-settings'

/** How long a run of changes (a slider drag) is allowed to settle before one server write. */
const SERVER_SAVE_QUIET_MS = 800

export function useTimerSettings(prefs: Partial<OnAirPrefs> | null | undefined): {
  initial: TimerSettings
  save: (patch: TimerSettingsPatch) => void
} {
  const [initial] = useState(() => readTimerSettings(settingsFromPrefs(prefs)))
  const pending = useRef<Partial<OnAirPrefs>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length === 0) return
    // Remembering a setting is a nicety, never a blocker: a failed save is silent here.
    void saveOnAirPrefs(patch).catch(() => undefined)
  }, [])

  useEffect(() => flush, [flush])

  const save = useCallback(
    (patch: TimerSettingsPatch) => {
      Object.assign(pending.current, writeTimerSettings(patch))
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, SERVER_SAVE_QUIET_MS)
    },
    [flush],
  )

  return { initial, save }
}

/** Save only what changed since the last render, and nothing on mount (the first render carries
 *  the seeded values, not a choice). `enabled` false skips a render whose values are not the
 *  member's own, such as a resume running the remaining minutes. */
export function useSaveOnChange(next: TimerSettingsPatch, save: (patch: TimerSettingsPatch) => void, enabled = true): void {
  const prev = useRef<TimerSettingsPatch | null>(null)
  useEffect(() => {
    if (prev.current === null) {
      prev.current = next
      return
    }
    if (!enabled) {
      prev.current = next
      return
    }
    const patch = diffSettings(prev.current, next)
    prev.current = next
    if (patch) save(patch)
  })
}

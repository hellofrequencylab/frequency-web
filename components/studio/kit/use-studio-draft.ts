'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isError, type ActionResult } from '@/lib/action-result'

// The Studio autosave engine (kit). Every builder gets the same "autosaves as you
// go" behavior: a save-state indicator (idle → saving → saved, auto-reverting),
// a debounced patch save for identity/field edits, and a `run` wrapper for
// immediate optimistic ops (add/remove/reorder) that resyncs on failure. See
// docs/STUDIO.md §2. Pass STABLE `save`/`onError` (wrap in useCallback) so the
// returned callbacks stay stable.

export type SaveState = 'idle' | 'saving' | 'saved'

export function useStudioDraft<TPatch>(opts: {
  /** Persist a debounced field patch (e.g. (patch) => saveJourneyMeta(id, patch)). */
  save: (patch: TPatch) => Promise<ActionResult<unknown>>
  /** Called after a failed immediate op, to resync the optimistic UI (e.g. router.refresh). */
  onError?: () => void
  debounceMs?: number
}) {
  const { save, onError, debounceMs = 600 } = opts
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-revert the "Saved" badge to idle (no ref in the save path).
  useEffect(() => {
    if (saveState !== 'saved') return
    const t = setTimeout(() => setSaveState('idle'), 1800)
    return () => clearTimeout(t)
  }, [saveState])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const flagSaved = useCallback(() => setSaveState('saved'), [])

  /** Run an immediate op; the caller updates local state optimistically first. */
  const run = useCallback(
    async (fn: () => Promise<ActionResult<unknown>>) => {
      setSaveState('saving')
      setError(null)
      const res = await fn()
      if (isError(res)) {
        setError(res.error)
        setSaveState('idle')
        onError?.()
        return false
      }
      flagSaved()
      return true
    },
    [flagSaved, onError],
  )

  /** Debounced field/identity save. */
  const queueSave = useCallback(
    (patch: TPatch) => {
      setSaveState('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        const res = await save(patch)
        if (isError(res)) { setError(res.error); setSaveState('idle') } else flagSaved()
      }, debounceMs)
    },
    [save, flagSaved, debounceMs],
  )

  return { saveState, error, setError, run, queueSave, flagSaved }
}

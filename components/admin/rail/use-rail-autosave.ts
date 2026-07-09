'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// ── The one autosave engine for the admin rail (docs/ADMIN-RAIL.md — save-model unification) ──────────
// Every rail editor used to pick its OWN save model: some had a Save button, some auto-saved on blur,
// some mixed both inside one panel (the owner complaint: "some sections you save by hitting save, some
// auto save"). This hook is the single model: an edit COMMITS automatically (debounced for text, instant
// for toggles/selects), the save state is one shared cue, and on success it calls `router.refresh()` so
// the page BEHIND the slide-over re-renders with the new data — the "edits appear on the page in real
// time" directive. Server actions already `revalidatePath` their route, so the refresh is what makes the
// change paint live without a manual reload.
//
// The action stays the entity's EXISTING full-form mutation (it takes the whole FormData); nothing on the
// server changes. Fail-safe: an action that throws leaves the prior data intact and surfaces one inline
// reason, never a false "Saved".

export type RailSaveState = 'idle' | 'saving' | 'saved' | 'error'

const DEBOUNCE_MS = 600
const SAVED_MS = 1500

export interface RailAutosave {
  /** The shared save cue state, rendered once per module by `RailSaveRow`. */
  state: RailSaveState
  /** A human reason when `state === 'error'`. */
  error: string | null
  /** Commit a FormData snapshot. `immediate` skips the debounce (toggles / selects); text fields debounce. */
  commit: (fd: FormData, immediate?: boolean) => void
}

/**
 * Wrap a full-form server action in the unified rail save model. `action` is the entity's existing
 * mutation bound to its ids (e.g. `updateHubSettings.bind(null, id, slug)`); it either resolves or throws.
 */
export function useRailAutosave(
  action: (fd: FormData) => Promise<unknown>,
  opts?: { debounceMs?: number; errorFallback?: string },
): RailAutosave {
  const router = useRouter()
  const [state, setState] = useState<RailSaveState>('idle')
  const [error, setError] = useState<string | null>(null)

  // Timers live in refs so a rapid sequence of edits collapses to one debounced save and the "Saved"
  // flash never lingers past the next edit. Cleared on unmount so a mid-debounce edit is flushed-or-dropped
  // deterministically (we flush on unmount to never silently lose the last keystroke).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<FormData | null>(null)
  // Keep the latest action in a ref so a debounced save that fires AFTER the action identity changed still
  // calls the current one. Synced in an effect (never assigned during render — the react-hooks/refs rule).
  const actionRef = useRef(action)
  useEffect(() => {
    actionRef.current = action
  }, [action])

  const run = useCallback(
    (fd: FormData) => {
      pendingRef.current = null
      setState('saving')
      setError(null)
      void (async () => {
        try {
          await actionRef.current(fd)
          setState('saved')
          router.refresh()
          if (savedRef.current) clearTimeout(savedRef.current)
          savedRef.current = setTimeout(() => setState('idle'), SAVED_MS)
        } catch (err) {
          setState('error')
          setError(err instanceof Error ? err.message : opts?.errorFallback ?? 'Could not save. Try again.')
        }
      })()
    },
    [router, opts?.errorFallback],
  )

  const commit = useCallback(
    (fd: FormData, immediate = false) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (immediate) {
        run(fd)
        return
      }
      pendingRef.current = fd
      debounceRef.current = setTimeout(() => run(fd), opts?.debounceMs ?? DEBOUNCE_MS)
    },
    [run, opts?.debounceMs],
  )

  // Flush a pending debounced edit on unmount (close the rail mid-type → the last edit still lands).
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (savedRef.current) clearTimeout(savedRef.current)
      const pending = pendingRef.current
      if (pending) void actionRef.current(pending).catch(() => {})
    }
  }, [])

  return { state, error, commit }
}

/** Which fields autosave on BLUR (debounced) — free-text the user types into. */
function isTextLike(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  return [
    'text', 'number', 'url', 'email', 'tel', 'search', 'password',
    'date', 'datetime-local', 'time', 'month', 'week',
  ].includes(type)
}

/** Which fields autosave INSTANTLY on change — toggles, radios, and selects (a discrete choice). */
function isInstant(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.tagName === 'SELECT') return true
  if (el.tagName !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  return type === 'checkbox' || type === 'radio'
}

export { isInstant, isTextLike }

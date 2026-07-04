'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { RowDef } from '@/lib/entity-blocks/layout'
import { deriveBench, type BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { saveMemberGridLayout } from '@/app/(main)/settings/profile/spotlight-actions'

// THE SHARED PROFILE-LAYOUT CONTEXT (ADR-516 Phase C). Our admin rail is a SAME-ROUTE slide-over over the
// profile page (not an iframe), so the in-rail builder and the live page preview share ONE client store —
// no postMessage, no round-trip. Mounted in the app shell so it wraps BOTH the page body (`{children}`,
// where the owner's LiveProfileGrid lives) AND the admin rail (where the builder lives). It is INERT until
// something seeds it (only the owner's profile builder / preview does), so on every other route it holds
// nothing and costs nothing.
//
// Data flow: whoever mounts first (the builder module or the LiveProfileGrid) SEEDS the store from the
// persisted layout (resolveRows → RowDef[]). Every edit calls `apply`, which repaints subscribers at 0ms
// AND schedules a debounced (~600ms) save through saveMemberGridLayout (session-derived + sanitized, so
// the wire is never trusted). Structural edits (reorder / columns / place / bench / hide) need NO
// router.refresh — the block nodes are already rendered in the DOM; the grid just rearranges them.

const SAVE_DEBOUNCE_MS = 600

interface ProfileLayoutContextValue {
  /** Whether the store has been seeded from a persisted layout (else it is inert). */
  seeded: boolean
  rows: RowDef[]
  hidden: string[]
  /** The derived "not shown" tray for the member kind (palette − placed − hidden). */
  bench: string[]
  /** Apply a new working layout: repaint now, persist debounced. */
  apply: (next: BuilderLayout) => void
  /** Seed the store from the persisted layout. Idempotent — only the FIRST seed wins per mount. */
  seed: (rows: RowDef[], hidden: string[]) => void
  saving: boolean
  error: string | null
}

const ProfileLayoutCtx = createContext<ProfileLayoutContextValue | null>(null)

export function ProfileLayoutProvider({ children }: { children: ReactNode }) {
  const [seeded, setSeeded] = useState(false)
  const [rows, setRows] = useState<RowDef[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The latest layout to persist, so a flush on unmount always writes the most recent edit.
  const pending = useRef<BuilderLayout | null>(null)
  // A ref guard so the FIRST seed wins (the builder + the live preview both try; whoever mounts first).
  const seededRef = useRef(false)

  const flush = useCallback(async () => {
    const next = pending.current
    if (!next) return
    pending.current = null
    setSaving(true)
    setError(null)
    try {
      const res = await saveMemberGridLayout({ rows: next.rows, hidden: next.hidden })
      if (res?.error) setError(res.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your layout.')
    } finally {
      setSaving(false)
    }
  }, [])

  const apply = useCallback(
    (next: BuilderLayout) => {
      seededRef.current = true
      setRows(next.rows)
      setHidden(next.hidden)
      setSeeded(true)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

  const seed = useCallback((r: RowDef[], h: string[]) => {
    if (seededRef.current) return
    seededRef.current = true
    setRows(r)
    setHidden(h)
    setSeeded(true)
  }, [])

  // Flush any pending save on unmount / navigation so a mid-debounce edit is never lost.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      void flush()
    }
  }, [flush])

  const bench = deriveBench({ rows, hidden }, 'member')

  return (
    <ProfileLayoutCtx.Provider value={{ seeded, rows, hidden, bench, apply, seed, saving, error }}>
      {children}
    </ProfileLayoutCtx.Provider>
  )
}

/** Read the shared profile-layout store. Returns null when no provider is mounted (fail-safe: a consumer
 *  outside the shell renders its own server layout). */
export function useProfileLayout(): ProfileLayoutContextValue | null {
  return useContext(ProfileLayoutCtx)
}

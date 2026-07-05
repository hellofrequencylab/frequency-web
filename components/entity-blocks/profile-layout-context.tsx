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
import { usePathname } from 'next/navigation'
import type { RowDef } from '@/lib/entity-blocks/layout'
import type { BlockStyle } from '@/lib/entity-blocks/block-content'
import type { EntityKind } from '@/lib/entity-blocks/registry'
import { deriveBench, type BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { adminScopeFor, railArchetypeFor } from '@/lib/layout/page-chrome'
import { saveMemberGridLayout } from '@/app/(main)/settings/profile/spotlight-actions'
import { saveSpaceGridLayout } from '@/app/(main)/spaces/[slug]/settings/profile/actions'

// THE SHARED ENTITY-LAYOUT CONTEXT (ADR-516 Phase C member; Phase D generalized to Space). Our admin rail
// is a SAME-ROUTE slide-over over the profile/space page (not an iframe), so the in-rail builder and the
// live page preview share ONE client store — no postMessage, no round-trip. Mounted in the app shell so it
// wraps BOTH the page body (`{children}`, where the owner's LiveProfileGrid lives) AND the admin rail
// (where the builder lives). It is INERT until something seeds it (only the owner's builder / preview
// does), so on every other route it holds nothing and costs nothing.
//
// ONE store drives both kinds. It is keyed by `kind` ('member' | 'space') and takes an injected `save`
// callback, so the member surface persists through saveMemberGridLayout (session-derived, self-only) and
// the space surface through saveSpaceGridLayout (owner-gated by slug). The APP SHELL mounts exactly ONE
// provider per route (EntityLayoutMount): the space provider on a Space profile ROOT, the member provider
// everywhere else — so a consumer never reads the wrong kind's store.
//
// Data flow: whoever mounts first (the builder module or the LiveProfileGrid) SEEDS the store from the
// persisted layout (resolveRows → RowDef[]). Every edit calls `apply`, which repaints subscribers at 0ms
// AND schedules a debounced (~600ms) save through the injected action (server-side sanitized, so the wire
// is never trusted). Structural edits (reorder / columns / place / bench / hide) need NO router.refresh —
// the block nodes are already rendered in the DOM; the grid just rearranges them.

const SAVE_DEBOUNCE_MS = 600

/** The injected persist action: repaints happen locally, this reconciles the server truth (debounced). */
export type SaveLayout = (payload: BuilderLayout) => Promise<{ error?: string } | void>

interface EntityLayoutContextValue {
  /** Which entity kind this store drives — a builder guards on it so it never seeds the wrong store. */
  kind: EntityKind
  /** Whether the store has been seeded from a persisted layout (else it is inert). */
  seeded: boolean
  rows: RowDef[]
  hidden: string[]
  /** Per-block authored content (ADR-528), keyed by block id. */
  content: Record<string, Record<string, unknown>>
  /** Per-block style (ADR-528), keyed by block id. */
  style: Record<string, BlockStyle>
  /** The derived "not shown" tray for the kind (palette − placed − hidden). */
  bench: string[]
  /** Apply a new working layout: repaint now, persist debounced. */
  apply: (next: BuilderLayout) => void
  /** Seed the store from the persisted layout. Idempotent — only the FIRST seed wins per mount. */
  seed: (rows: RowDef[], hidden: string[], content?: Record<string, Record<string, unknown>>, style?: Record<string, BlockStyle>) => void
  saving: boolean
  error: string | null
}

const EntityLayoutCtx = createContext<EntityLayoutContextValue | null>(null)

/** The generic entity-layout store. Keyed by `kind` and persisting through an injected `save` action, so
 *  the member and space builders share ONE implementation, each mounted in the right place. */
export function EntityLayoutProvider({
  kind,
  save,
  children,
}: {
  kind: EntityKind
  save: SaveLayout
  children: ReactNode
}) {
  const [seeded, setSeeded] = useState(false)
  const [rows, setRows] = useState<RowDef[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [content, setContent] = useState<Record<string, Record<string, unknown>>>({})
  const [style, setStyle] = useState<Record<string, BlockStyle>>({})
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
      const res = await save({ rows: next.rows, hidden: next.hidden, content: next.content, style: next.style })
      if (res?.error) setError(res.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your layout.')
    } finally {
      setSaving(false)
    }
  }, [save])

  const apply = useCallback(
    (next: BuilderLayout) => {
      seededRef.current = true
      setRows(next.rows)
      setHidden(next.hidden)
      setContent(next.content ?? {})
      setStyle(next.style ?? {})
      setSeeded(true)
      pending.current = next
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

  const seed = useCallback(
    (
      r: RowDef[],
      h: string[],
      c?: Record<string, Record<string, unknown>>,
      s?: Record<string, BlockStyle>,
    ) => {
      if (seededRef.current) return
      seededRef.current = true
      setRows(r)
      setHidden(h)
      setContent(c ?? {})
      setStyle(s ?? {})
      setSeeded(true)
    },
    [],
  )

  // Flush any pending save on unmount / navigation so a mid-debounce edit is never lost.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      void flush()
    }
  }, [flush])

  const bench = deriveBench({ rows, hidden }, kind)

  return (
    <EntityLayoutCtx.Provider
      value={{ kind, seeded, rows, hidden, content, style, bench, apply, seed, saving, error }}
    >
      {children}
    </EntityLayoutCtx.Provider>
  )
}

/** The MEMBER layout provider — persists the caller's own profile grid (session-derived, self-only). */
export function ProfileLayoutProvider({ children }: { children: ReactNode }) {
  return (
    <EntityLayoutProvider kind="member" save={saveMemberGridLayout}>
      {children}
    </EntityLayoutProvider>
  )
}

/** The SPACE layout provider — persists a Space's public-page grid, owner-gated by slug server-side. */
export function SpaceLayoutProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const save = useCallback<SaveLayout>((payload) => saveSpaceGridLayout(slug, payload), [slug])
  return (
    <EntityLayoutProvider kind="space" save={save}>
      {children}
    </EntityLayoutProvider>
  )
}

/** Mount exactly ONE layout provider for the current route: the SPACE store on a Space profile ROOT
 *  (`/spaces/<slug>`, the builder archetype), the MEMBER store everywhere else. This keeps the store that
 *  wraps both the page body and the admin rail in lockstep with the page the builder edits. */
export function EntityLayoutMount({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const scope = adminScopeFor(pathname)
  if (railArchetypeFor(pathname) === 'builder' && scope?.kind === 'space' && scope.id) {
    return <SpaceLayoutProvider slug={scope.id}>{children}</SpaceLayoutProvider>
  }
  return <ProfileLayoutProvider>{children}</ProfileLayoutProvider>
}

/** Read the shared entity-layout store. Returns null when no provider is mounted (fail-safe: a consumer
 *  outside the shell renders its own server layout). Kept named `useProfileLayout` for the member
 *  consumers shipped in Phase C; `useEntityLayout` is the kind-agnostic alias. */
export function useProfileLayout(): EntityLayoutContextValue | null {
  return useContext(EntityLayoutCtx)
}

export const useEntityLayout = useProfileLayout

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
import {
  deriveBench,
  setBlockContent,
  setBlockStyle,
  type BuilderLayout,
} from '@/lib/entity-blocks/rows-ops'
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
  /** The block whose settings are focused in the rail — the SHARED selection for live-page edit mode: the
   *  live grid sets it when the owner clicks a block on the page, and the in-rail builder opens that block's
   *  settings panel for it (the email-editor click-to-select pattern). Null when nothing is selected. */
  selectedId: string | null
  select: (id: string | null) => void
  /** The derived "not shown" tray for the kind (palette − placed − hidden). */
  bench: string[]
  /** Apply a new working layout: repaint now, persist debounced. */
  apply: (next: BuilderLayout) => void
  /** Merge one block's authored content against the FRESHEST store state (ADR-542 fix for the stale-
   *  closure drop: rapid field edits each merge over the latest bag, so no earlier field is clobbered).
   *  Passing an empty/undefined bag clears the block's content. */
  applyContent: (blockId: string, props: Record<string, unknown> | undefined) => void
  /** Merge one block's style against the FRESHEST store state (same stale-closure fix as applyContent). */
  applyStyle: (blockId: string, style: BlockStyle | undefined) => void
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
  // Shared selection (live-page edit mode): the block whose settings the rail should focus. Set by the live
  // grid on a block click and read by the in-rail builder; a plain piece of client state, persisted nowhere.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The latest layout to persist, so a flush on unmount always writes the most recent edit.
  const pending = useRef<BuilderLayout | null>(null)
  // A ref guard so the FIRST seed wins (the builder + the live preview both try; whoever mounts first).
  const seededRef = useRef(false)
  // A MIRROR of the current working layout, always the freshest value (state is async). The merge-safe
  // content/style updaters read THIS, not a render-time snapshot, so a burst of field edits each fold over
  // the latest bag — the fix for "only the title saved" (a stale captured layout clobbering earlier writes).
  const latest = useRef<BuilderLayout>({ rows: [], hidden: [], content: {}, style: {} })

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
      latest.current = { rows: next.rows, hidden: next.hidden, content: next.content ?? {}, style: next.style ?? {} }
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

  // Merge-safe content/style: fold the one field bag over the FRESHEST layout (latest ref), then apply.
  // rows-ops setBlockContent/setBlockStyle are immutable + normalize, so this never clobbers a sibling
  // field that settled a beat earlier (the stale-closure bug).
  const applyContent = useCallback(
    (blockId: string, props: Record<string, unknown> | undefined) => {
      apply(setBlockContent(latest.current, blockId, props && Object.keys(props).length ? props : undefined))
    },
    [apply],
  )
  const applyStyle = useCallback(
    (blockId: string, s: BlockStyle | undefined) => {
      apply(setBlockStyle(latest.current, blockId, s && Object.keys(s).length ? s : undefined))
    },
    [apply],
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
      latest.current = { rows: r, hidden: h, content: c ?? {}, style: s ?? {} }
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

  const select = useCallback((id: string | null) => setSelectedId(id), [])

  const bench = deriveBench({ rows, hidden }, kind)

  return (
    <EntityLayoutCtx.Provider
      value={{ kind, seeded, rows, hidden, content, style, selectedId, select, bench, apply, applyContent, applyStyle, seed, saving, error }}
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
    // KEYED by slug: this mount lives ABOVE the [slug] segment in the app shell, so without a key React
    // preserves the SAME provider instance across a space->space soft navigation. The store is "first
    // mounter wins" (seed() no-ops once seeded), so Space A's rows/content/styles kept rendering on
    // Space B until a hard refresh - and worse, an edit on Space B could debounce-save Space A's layout
    // over B's. The key remounts the store per space: the old instance's unmount flush persists any
    // pending edit through its own (correctly bound) save, then the new instance seeds fresh.
    return (
      <SpaceLayoutProvider key={`space:${scope.id}`} slug={scope.id}>
        {children}
      </SpaceLayoutProvider>
    )
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

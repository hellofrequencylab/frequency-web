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
  /** Within a multi-item block (Features / Card Grid), the index of the ONE item whose settings the rail
   *  shows and the canvas highlights — the card-level analogue of `selectedId`. Null = the whole block (no
   *  single item focused). Cleared automatically whenever `selectedId` changes (a new block starts unfocused).
   *  The live canvas sets it when the owner clicks a card; the rail reads it to render only that card's fields. */
  selectedItemIndex: number | null
  selectItem: (index: number | null) => void
  /** The derived "not shown" tray for the kind (palette − placed − hidden). */
  bench: string[]
  /** Apply a new working layout: repaint now, persist debounced. */
  apply: (next: BuilderLayout) => void
  /** Revert the last change (Ctrl+Z / the Undo button). Pops the history stack and re-applies the previous
   *  working layout, then saves it like any other edit. A no-op when there is nothing to undo. */
  undo: () => void
  /** Whether there is a prior state to undo (drives the Undo button's enabled state). */
  canUndo: boolean
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
  // Card-level selection (Features / Card Grid): which single item is focused in the rail + canvas. Reset to
  // null whenever the selected BLOCK changes, so opening a new block never carries a stale card focus.
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The latest layout to persist, so a flush on unmount always writes the most recent edit.
  const pending = useRef<BuilderLayout | null>(null)
  // A ref guard so the FIRST seed wins (the builder + the live preview both try; whoever mounts first).
  const seededRef = useRef(false)
  // A MIRROR of the current working layout, always the freshest value (state is async). The merge-safe
  // content/style updaters read THIS, not a render-time snapshot, so a burst of field edits each fold over
  // the latest bag — the fix for "only the title saved" (a stale captured layout clobbering earlier writes).
  const latest = useRef<BuilderLayout>({ rows: [], hidden: [], content: {}, style: {} })

  // ── Undo (Ctrl+Z) ──────────────────────────────────────────────────────────────────────────────────
  // A stack of PRIOR working layouts. Every `apply` pushes the state it is about to replace (so the most
  // recent snapshot is the top); undo pops it back. Rapid edits within a short window COALESCE into one
  // entry, so undo reverts a whole burst of typing (or one structural change like a deleted row) at a time,
  // not one keystroke. Bounded so a long session can't grow it without limit.
  const history = useRef<BuilderLayout[]>([])
  const lastPushAt = useRef(0)
  const applyingUndo = useRef(false)
  const [canUndo, setCanUndo] = useState(false)
  const HISTORY_MAX = 100
  const COALESCE_MS = 500

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
      // Record the state we are about to replace onto the undo stack — unless this apply IS an undo, or it is
      // the very first seed (nothing meaningful to go back to). Coalesce edits landing within COALESCE_MS so a
      // burst of typing collapses into one undo step; a change after a pause starts a new one.
      if (!applyingUndo.current && seededRef.current && latest.current.rows.length) {
        const now = Date.now()
        if (now - lastPushAt.current > COALESCE_MS) {
          history.current.push(latest.current)
          if (history.current.length > HISTORY_MAX) history.current.shift()
          if (!canUndo) setCanUndo(true)
        }
        lastPushAt.current = now
      }
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

  const undo = useCallback(() => {
    const prev = history.current.pop()
    if (!prev) return
    // Re-apply the popped state WITHOUT pushing it back onto the stack (applyingUndo guards the push in
    // `apply`), and reset the coalesce clock so the next real edit starts a fresh undo step.
    applyingUndo.current = true
    apply(prev)
    applyingUndo.current = false
    lastPushAt.current = 0
    setCanUndo(history.current.length > 0)
  }, [apply])

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

  // Selecting a block clears any card-level focus (a fresh block starts on the whole-block settings). Selecting
  // a card just sets the index (the block is already selected). Both are plain client state, persisted nowhere.
  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    setSelectedItemIndex(null)
  }, [])
  const selectItem = useCallback((index: number | null) => setSelectedItemIndex(index), [])

  const bench = deriveBench({ rows, hidden }, kind)

  return (
    <EntityLayoutCtx.Provider
      value={{ kind, seeded, rows, hidden, content, style, selectedId, select, selectedItemIndex, selectItem, bench, apply, undo, canUndo, applyContent, applyStyle, seed, saving, error }}
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

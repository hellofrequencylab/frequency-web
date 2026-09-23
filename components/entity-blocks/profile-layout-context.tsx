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
  /** Merge a PARTIAL field patch into one block's authored content, folded over the FRESHEST stored bag.
   *  Use this — not applyContent — whenever a caller is writing SOME of a block's fields: applyContent
   *  REPLACES the block's bag, so a caller that rebuilds the whole bag from a render-time snapshot silently
   *  drops any sibling field written earlier in the same tick (the on-canvas photo popup writes `image` then
   *  `alt`, and the alt write used to erase the photo). A key whose value is empty (undefined / '' / []) is
   *  DELETED, so the stored bag stays sparse; a patch that empties the last key clears the block. */
  patchContent: (blockId: string, patch: Record<string, unknown>) => void
  /** Merge one block's style against the FRESHEST store state (same stale-closure fix as applyContent). */
  applyStyle: (blockId: string, style: BlockStyle | undefined) => void
  /** Seed the store from the persisted layout. Idempotent — only the FIRST seed wins per mount. */
  seed: (rows: RowDef[], hidden: string[], content?: Record<string, Record<string, unknown>>, style?: Record<string, BlockStyle>) => void
  saving: boolean
  /** An edit has landed but its debounced save has not started yet. Distinct from `saving`, which only
   *  flips once flush() is already in flight. 🔴 Without this there was a ~600ms window after every
   *  keystroke where nothing anywhere knew there was unpersisted work: a hard reload landing in it lost
   *  the edit silently, because the leave-guard reads `saving`. */
  dirty: boolean
  error: string | null
}

const EntityLayoutCtx = createContext<EntityLayoutContextValue | null>(null)

/** The generic entity-layout store. Keyed by `kind` and persisting through an injected `save` action, so
 *  the member and space builders share ONE implementation, each mounted in the right place.
 *
 *  `identity` is the store's SUBJECT (e.g. `member`, `space:acme`). When it changes, this component
 *  resets its own state in place instead of being remounted from above — see the reset block below
 *  for why the remount could not stay. Callers that only ever drive one subject (the email studio,
 *  the nurture step editor, the Space canvas editor) leave it undefined and never reset. */
export function EntityLayoutProvider({
  kind,
  identity,
  save,
  children,
}: {
  kind: EntityKind
  identity?: string
  save: SaveLayout
  children: ReactNode
}) {
  const [seeded, setSeeded] = useState(false)
  const [rows, setRows] = useState<RowDef[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [content, setContent] = useState<Record<string, Record<string, unknown>>>({})
  const [style, setStyle] = useState<Record<string, BlockStyle>>({})
  const [saving, setSaving] = useState(false)
  // See `dirty` on the context type: the debounce window, which `saving` does not cover.
  const [dirty, setDirty] = useState(false)
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

  // ── RESET IN PLACE WHEN THE SUBJECT CHANGES ────────────────────────────────────────────────
  //
  // 🔴 THIS IS WHY THE SHELL STOPPED BLINKING. `EntityLayoutMount` (below) used to return TWO
  // DIFFERENT COMPONENT TYPES from the same position — `<SpaceLayoutProvider key={slug}>` on a
  // Space builder route, `<ProfileLayoutProvider>` everywhere else — and that mount wraps the
  // WHOLE content row in the app shell: the left rail, `#main`, and the right-rail column
  // (app-shell.tsx, `<EntityLayoutMount>`). React reconciles by TYPE at a position, so flipping
  // the type unmounts and rebuilds everything under it, and the `key` did the same again on a
  // space→space navigation. Measured on the real shell by node identity: `/feed` → `/channels`
  // keeps the same rail column, rail body, left nav and `#main` nodes; `/feed` → `/spaces/acme`
  // replaced all four and re-ran the rail's mount effects. The header survived only because it
  // renders ABOVE this mount. That is the LIVE-472 two-parents shape for the third time in this
  // repo, and the rule it keeps teaching is: THE POSITION MUST NEVER CHANGE TYPE.
  //
  // So the type is fixed now and the store resets ITSELF, in two halves that are split by what the
  // lint here will allow rather than by taste.
  //
  // HALF ONE — the STATE, adjusted during render. React's documented shape for "reset state when a
  // prop changes", and the same spelling app-shell.tsx uses for the mobile drawer's Vault
  // disclosure. An effect would render the stale value once, commit it, then re-render, and
  // `react-hooks/set-state-in-effect` rejects it by name.
  const [identityWas, setIdentityWas] = useState(identity)
  if (identityWas !== identity) {
    setIdentityWas(identity)
    setSeeded(false)
    setRows([])
    setHidden([])
    setContent({})
    setStyle({})
    setSelectedId(null)
    setSelectedItemIndex(null)
    setCanUndo(false)
    setDirty(false)
    setError(null)
  }

  // HALF TWO — the REFS, reset lazily by the first callback that touches them. They cannot be
  // cleared during render (`react-hooks/refs`: "Cannot update ref during render"), and they must
  // not be cleared in an effect either, because effects are the wrong side of the one ordering that
  // matters here: a child's seed effect runs BEFORE this parent's, so a parent effect would wipe
  // the layout the new subject had just seeded. Every callback below opens with this instead, so
  // the bag is always the current subject's by the time anything reads it.
  //
  // It is also what keeps the OUTGOING flush honest. The unmount-flush effect further down depends
  // on `flush`, which depends on `save`, so a subject change re-runs it — and React runs the
  // previous effect's CLEANUP before any new setup, with the previous closure. That cleanup
  // therefore calls the OUTGOING `flush`, whose `syncSubject` is bound to the outgoing identity and
  // no-ops, so it finds the outgoing `pending` still intact and writes it through the outgoing
  // subject's own `save`. That is exactly what the deleted `key` bought — Space A's mid-debounce
  // edit must never be persisted onto Space B — and it is bought here by NOT clearing `pending`
  // early rather than by new machinery.
  const subject = useRef(identity)
  const syncSubject = useCallback(() => {
    if (subject.current === identity) return
    subject.current = identity
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    pending.current = null
    seededRef.current = false
    applyingUndo.current = false
    latest.current = { rows: [], hidden: [], content: {}, style: {} }
    history.current = []
    lastPushAt.current = 0
  }, [identity])

  const flush = useCallback(async () => {
    syncSubject()
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
      // Only clear if nothing landed WHILE this save was in flight. `flush` nulls `pending` before it
      // awaits, so a mid-flight edit repopulates it and must keep the page marked dirty.
      setDirty(pending.current !== null)
    }
  }, [save, syncSubject])

  const apply = useCallback(
    (next: BuilderLayout) => {
      syncSubject()
      // Record the state we are about to replace onto the undo stack — unless this apply IS an undo, or it is
      // the very first seed (nothing meaningful to go back to). Coalesce edits landing within COALESCE_MS so a
      // burst of typing collapses into one undo step; a change after a pause starts a new one.
      if (!applyingUndo.current && seededRef.current && latest.current.rows.length) {
        const now = Date.now()
        if (now - lastPushAt.current > COALESCE_MS) {
          history.current.push(latest.current)
          if (history.current.length > HISTORY_MAX) history.current.shift()
          // Unconditional, and it must stay that way. This read `if (!canUndo)` as a
          // cheap guard against a redundant setState, which made `apply` depend on
          // `canUndo` while its dep array is [flush] -- so the closure kept whatever
          // `canUndo` was when it was built. `undo` (below) sets canUndo back to FALSE
          // once it drains the stack, and the stale closure then still believed it was
          // true and skipped this line: history had entries, the Undo button stayed
          // disabled, and the only way out was a remount. React already bails out of a
          // re-render when the value is unchanged, so the guard was never buying
          // anything to begin with.
          setCanUndo(true)
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
      setDirty(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush, syncSubject],
  )

  // Merge-safe content/style: fold the one field bag over the FRESHEST layout (latest ref), then apply.
  // rows-ops setBlockContent/setBlockStyle are immutable + normalize, so this never clobbers a sibling
  // field that settled a beat earlier (the stale-closure bug).
  const applyContent = useCallback(
    (blockId: string, props: Record<string, unknown> | undefined) => {
      syncSubject()
      apply(setBlockContent(latest.current, blockId, props && Object.keys(props).length ? props : undefined))
    },
    [apply, syncSubject],
  )
  // The FIELD-level merge. applyContent takes a WHOLE bag, so a caller that assembles that bag from its
  // render-time `store.content` snapshot loses any field written earlier in the same tick — React has not
  // re-rendered yet, so the snapshot is a beat behind. That is exactly what dropped the on-canvas photo:
  // the popup commits `image` and then `alt`, and the alt write handed back a bag with the OLD photo.
  // patchContent folds the patch over `latest.current` (the freshest bag, updated synchronously by apply),
  // so each field lands on top of the last one no matter how fast they arrive.
  const patchContent = useCallback(
    (blockId: string, patch: Record<string, unknown>) => {
      syncSubject()
      const next = { ...(latest.current.content?.[blockId] ?? {}) }
      for (const [key, value] of Object.entries(patch)) {
        const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
        if (empty) delete next[key]
        else next[key] = value
      }
      apply(setBlockContent(latest.current, blockId, Object.keys(next).length ? next : undefined))
    },
    [apply, syncSubject],
  )
  const applyStyle = useCallback(
    (blockId: string, s: BlockStyle | undefined) => {
      syncSubject()
      apply(setBlockStyle(latest.current, blockId, s && Object.keys(s).length ? s : undefined))
    },
    [apply, syncSubject],
  )

  const undo = useCallback(() => {
    syncSubject()
    const prev = history.current.pop()
    if (!prev) return
    // Re-apply the popped state WITHOUT pushing it back onto the stack (applyingUndo guards the push in
    // `apply`), and reset the coalesce clock so the next real edit starts a fresh undo step.
    applyingUndo.current = true
    apply(prev)
    applyingUndo.current = false
    lastPushAt.current = 0
    setCanUndo(history.current.length > 0)
  }, [apply, syncSubject])

  const seed = useCallback(
    (
      r: RowDef[],
      h: string[],
      c?: Record<string, Record<string, unknown>>,
      s?: Record<string, BlockStyle>,
    ) => {
      syncSubject()
      if (seededRef.current) return
      seededRef.current = true
      latest.current = { rows: r, hidden: h, content: c ?? {}, style: s ?? {} }
      setRows(r)
      setHidden(h)
      setContent(c ?? {})
      setStyle(s ?? {})
      setSeeded(true)
    },
    [syncSubject],
  )

  // Flush any pending save on unmount / navigation so a mid-debounce edit is never lost.
  // 🔴 ITS DEPS ALSO CARRY THE SUBJECT HANDOFF. `flush` changes whenever `save` does, so a subject
  // change re-runs this effect, and React runs the previous cleanup first with the previous
  // closure — which is how the outgoing subject's pending edit reaches the outgoing subject's own
  // action. See the note on `syncSubject` above; do not narrow these deps.
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
      value={{ kind, seeded, rows, hidden, content, style, selectedId, select, selectedItemIndex, selectItem, bench, apply, undo, canUndo, applyContent, patchContent, applyStyle, seed, saving, dirty, error }}
    >
      {children}
    </EntityLayoutCtx.Provider>
  )
}

/* The two per-kind wrapper components that used to live here (`ProfileLayoutProvider`,
   `SpaceLayoutProvider`) are GONE, and their absence is the fix rather than a tidy-up. They existed
   only so `EntityLayoutMount` could pick one, and a position that picks between two component types
   is a position that remounts everything beneath it. Their bodies are now the two branches of the
   `kind` / `identity` / `save` props that mount passes to the ONE provider. Re-adding either would
   re-open the same door. */

/** Mount exactly ONE layout provider for the current route: the SPACE store on a Space profile ROOT
 *  (`/spaces/<slug>`, the builder archetype), the MEMBER store everywhere else. This keeps the store that
 *  wraps both the page body and the admin rail in lockstep with the page the builder edits.
 *
 *  🔴 ONE COMPONENT TYPE, NO KEY, EVER. This mount wraps the app shell's entire content row — left rail,
 *  `#main`, right-rail column — so ANY change of type or key at this position tears down and rebuilds the
 *  visible chrome. It used to return `<SpaceLayoutProvider key={slug}>` or `<ProfileLayoutProvider>`
 *  depending on the pathname, and navigating into or between Spaces replaced every one of those nodes
 *  (measured by node identity) while `/feed` → `/channels` replaced none. What used to be the type switch
 *  and the key is now the `identity` PROP, which `EntityLayoutProvider` resets on in place; what used to
 *  be a remount's unmount-flush is the handoff there. Both halves are documented at that reset block.
 *  Do not reintroduce a branch, a key, or a second provider component here. */
export function EntityLayoutMount({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const scope = adminScopeFor(pathname)
  // The Space builder ROOT and nothing else; null means the member store. Plain derived values, so the
  // hooks below run in the same order on every route (the branch used to be a `return`, which is what
  // made two component types possible in the first place).
  const spaceSlug =
    railArchetypeFor(pathname) === 'builder' && scope?.kind === 'space' && scope.id ? scope.id : null
  const save = useCallback<SaveLayout>(
    (payload) => (spaceSlug ? saveSpaceGridLayout(spaceSlug, payload) : saveMemberGridLayout(payload)),
    [spaceSlug],
  )
  return (
    <EntityLayoutProvider
      kind={spaceSlug ? 'space' : 'member'}
      identity={spaceSlug ? `space:${spaceSlug}` : 'member'}
      save={save}
    >
      {children}
    </EntityLayoutProvider>
  )
}

/** Read the shared entity-layout store. Returns null when no provider is mounted (fail-safe: a consumer
 *  outside the shell renders its own server layout). Kept named `useProfileLayout` for the member
 *  consumers shipped in Phase C; `useEntityLayout` is the kind-agnostic alias. */
export function useProfileLayout(): EntityLayoutContextValue | null {
  return useContext(EntityLayoutCtx)
}

export const useEntityLayout = useProfileLayout

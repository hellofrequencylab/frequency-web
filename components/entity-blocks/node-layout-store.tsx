'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import type { BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { saveSpaceGridLayout } from '@/app/(main)/spaces/[slug]/settings/profile/actions'

// THE NODE LAYOUT STORE (E0 task 12b, ADR-1835). The node-keyed twin of `profile-layout-context`: it holds
// a NodeLayout, selects a block by its node id (`selectedNid`) instead of its type, and saves the whole
// node document through an injected action. It exists as a SEPARATE store, not a mode of the live one,
// because the live store's undo stack, save pipeline and subject handoff are pinned by tests and serve
// every Space owner today; sharing those refs would put the live editor at risk for a surface that is
// switched off. The Space canvas and builders move onto this store behind `render_path_space_profile`
// (ADR-1833), and the type-keyed store is deleted when the flag is retired.
//
// One subject per provider: the caller remounts it (a `key`) for another Space. Edits go through `edit`,
// which folds over the FRESHEST layout (a ref), the lesson of the stale-closure drops in the live store:
// two edits in one tick must both land. Saves are debounced, serialized, and a failed draft is kept for
// the next edit rather than retried in a loop.

// This file is statically reachable from the app shell (EntityLayoutMount mounts it on every route), so it
// imports TYPES ONLY from the node modules: the shell-weight gate counts every phone that parses it.
const SAVE_DEBOUNCE_MS = 600
const HISTORY_MAX = 100
const COALESCE_MS = 500

function hasNode(layout: NodeLayout, nid: string): boolean {
  return (
    layout.rows.some((row) => row.cells.some((stack) => stack.some((n) => n.nid === nid))) ||
    layout.bench.some((n) => n.nid === nid)
  )
}

export type SaveNodeLayout = (layout: NodeLayout) => Promise<{ error?: string } | void>

interface NodeLayoutStoreValue {
  /** Whether a node document has been seeded; the store is inert until then. */
  seeded: boolean
  layout: NodeLayout | null
  /** The node whose settings are focused. A node id, so two Text blocks are two selections. */
  selectedNid: string | null
  select: (nid: string | null) => void
  /** Fold a change over the freshest layout, repaint now, save debounced. */
  edit: (change: (layout: NodeLayout) => NodeLayout) => void
  undo: () => void
  canUndo: boolean
  /** Seed from a persisted node document. The first seed wins. */
  seed: (layout: NodeLayout) => void
  saving: boolean
  /** An edit has landed but its save has not finished (covers the debounce window `saving` does not). */
  dirty: boolean
  error: string | null
}

const NodeLayoutCtx = createContext<NodeLayoutStoreValue | null>(null)

/** `identity` is the store's SUBJECT (e.g. `space:acme`). The mount sits at a position that must never change
 *  type or key (see EntityLayoutMount), so a subject change resets this store IN PLACE, the same way the live
 *  store does: state during render, refs lazily in the first callback that touches them. The outgoing
 *  subject's unsaved edit still reaches the outgoing subject's own `save`: the unmount-flush effect below
 *  depends on `flush`, which depends on `save`, so React runs the previous cleanup (the outgoing closure)
 *  first. Callers that drive one subject leave `identity` undefined. */
export function NodeLayoutProvider({ identity, save, children }: { identity?: string; save: SaveNodeLayout; children: ReactNode }) {
  const [layout, setLayout] = useState<NodeLayout | null>(null)
  const [selectedNid, setSelectedNid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  const [identityWas, setIdentityWas] = useState(identity)
  if (identityWas !== identity) {
    setIdentityWas(identity)
    setLayout(null)
    setSelectedNid(null)
    setSaving(false)
    setDirty(false)
    setError(null)
    setCanUndo(false)
  }

  const latest = useRef<NodeLayout | null>(null)
  const pending = useRef<NodeLayout | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const history = useRef<NodeLayout[]>([])
  const lastPushAt = useRef(0)

  const subject = useRef(identity)
  const syncSubject = useCallback(() => {
    if (subject.current === identity) return
    subject.current = identity
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    latest.current = null
    pending.current = null
    history.current = []
    lastPushAt.current = 0
  }, [identity])

  const flush = useCallback(async function flushAttempt(): Promise<void> {
    syncSubject()
    if (inFlight.current) return
    const next = pending.current
    if (!next) return
    pending.current = null
    inFlight.current = true
    setSaving(true)
    setError(null)
    let failed = false
    try {
      const res = await save(next)
      if (res?.error) {
        failed = true
        setError(res.error)
      }
    } catch (e) {
      failed = true
      setError(e instanceof Error ? e.message : 'Could not save your layout.')
    } finally {
      inFlight.current = false
      // A newer edit already holds a fuller snapshot; otherwise keep the failed one for the next edit.
      if (failed && pending.current === null) pending.current = next
      setSaving(false)
      setDirty(pending.current !== null)
      if (pending.current !== null && pending.current !== next) {
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => void flushAttempt(), SAVE_DEBOUNCE_MS)
      }
    }
  }, [save, syncSubject])

  const commit = useCallback(
    (next: NodeLayout) => {
      syncSubject()
      latest.current = next
      setLayout(next)
      // A selection that no longer exists (the node was removed) must not linger.
      setSelectedNid((cur) => (cur && !hasNode(next, cur) ? null : cur))
      pending.current = next
      setDirty(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush, syncSubject],
  )

  const edit = useCallback(
    (change: (current: NodeLayout) => NodeLayout) => {
      syncSubject()
      const current = latest.current
      if (!current) return
      const next = change(current)
      if (next === current) return
      const now = Date.now()
      if (now - lastPushAt.current > COALESCE_MS) {
        history.current.push(current)
        if (history.current.length > HISTORY_MAX) history.current.shift()
        setCanUndo(true)
      }
      lastPushAt.current = now
      commit(next)
    },
    [commit, syncSubject],
  )

  const undo = useCallback(() => {
    syncSubject()
    const prev = history.current.pop()
    if (!prev) return
    lastPushAt.current = 0
    setCanUndo(history.current.length > 0)
    commit(prev)
  }, [commit, syncSubject])

  const seed = useCallback((initial: NodeLayout) => {
    syncSubject()
    if (latest.current) return
    latest.current = initial
    setLayout(initial)
  }, [syncSubject])

  // A mid-debounce edit is never lost on unmount or navigation.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      void flush()
    }
  }, [flush])

  return (
    <NodeLayoutCtx.Provider
      value={{ seeded: layout !== null, layout, selectedNid, select: setSelectedNid, edit, undo, canUndo, seed, saving, dirty, error }}
    >
      {children}
    </NodeLayoutCtx.Provider>
  )
}

/** The node store, or null outside a provider (a consumer then renders its own server layout). */
export function useNodeLayout(): NodeLayoutStoreValue | null {
  return useContext(NodeLayoutCtx)
}

/** The mount `EntityLayoutMount` renders inside the live provider, at the same position on every route. It
 *  is a wrapper with its own name on purpose: the position never picks between provider types (LIVE-472),
 *  it always nests this one. Only the Space writer accepts a node document (ADR-1834, behind
 *  render_path_space_profile); the member writer still refuses nodes (LIVE-875), so a member-route save
 *  reports that instead of calling it. Inert until something seeds it. */
export function NodeLayoutMount({ spaceSlug, children }: { spaceSlug: string | null; children: ReactNode }) {
  const save = useCallback<SaveNodeLayout>(
    (layout) =>
      spaceSlug
        ? saveSpaceGridLayout(spaceSlug, layout as unknown as BuilderLayout)
        : Promise.resolve({ error: 'This page cannot save this layout yet.' }),
    [spaceSlug],
  )
  return (
    <NodeLayoutProvider identity={spaceSlug ? `space:${spaceSlug}` : 'member'} save={save}>
      {children}
    </NodeLayoutProvider>
  )
}

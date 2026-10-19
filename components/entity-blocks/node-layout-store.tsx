'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { findNode } from '@/lib/entity-blocks/node-ops'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'

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

const SAVE_DEBOUNCE_MS = 600
const HISTORY_MAX = 100
const COALESCE_MS = 500

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

export function NodeLayoutProvider({ save, children }: { save: SaveNodeLayout; children: ReactNode }) {
  const [layout, setLayout] = useState<NodeLayout | null>(null)
  const [selectedNid, setSelectedNid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)

  const latest = useRef<NodeLayout | null>(null)
  const pending = useRef<NodeLayout | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const history = useRef<NodeLayout[]>([])
  const lastPushAt = useRef(0)

  const flush = useCallback(async function flushAttempt(): Promise<void> {
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
  }, [save])

  const commit = useCallback(
    (next: NodeLayout) => {
      latest.current = next
      setLayout(next)
      // A selection that no longer exists (the node was removed) must not linger.
      setSelectedNid((cur) => (cur && !findNode(next, cur) ? null : cur))
      pending.current = next
      setDirty(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

  const edit = useCallback(
    (change: (current: NodeLayout) => NodeLayout) => {
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
    [commit],
  )

  const undo = useCallback(() => {
    const prev = history.current.pop()
    if (!prev) return
    lastPushAt.current = 0
    setCanUndo(history.current.length > 0)
    commit(prev)
  }, [commit])

  const seed = useCallback((initial: NodeLayout) => {
    if (latest.current) return
    latest.current = initial
    setLayout(initial)
  }, [])

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

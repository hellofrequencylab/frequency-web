// DEBOUNCED DRAFT WRITER — E0 task 18 (docs/EDITOR-E0.md §7, "Debounced snapshot").
//
// Turns a stream of Y.Doc edits into a trickle of draft saves. After the doc has been quiet for
// `waitMs` it reads the SANITIZED tree through the snapshot boundary (snapshot.ts) and hands it to
// `save`. A doc that sanitizes to nothing is skipped, so the previous draft stays. An unchanged
// tree is not saved twice. A save that fails is retried on the next change or flush, never lost
// silently: `onError` hears about it.
//
// What `save` writes is the caller's: today the existing per-kind draft actions take a plain
// NodeLayout (page_versions stores trees, never Yjs state). This module imports no Supabase and no
// React. Editor only: no visitor bundle may import it.

import type * as Y from 'yjs'
import type { EntityKind } from '../entity-blocks/registry'
import type { NodeLayout } from '../entity-blocks/node-tree'
import { snapshotForStorage } from './snapshot'

interface DraftWriterOptions {
  doc: Y.Doc
  kind: EntityKind
  /** Persist the sanitized tree as the draft. Rejecting counts as a failed save. */
  save: (tree: NodeLayout) => Promise<void>
  /** Quiet time before a save, in ms. Default 2000. */
  waitMs?: number
  onError?: (error: unknown) => void
}

interface DraftWriter {
  /** Save now if the tree changed since the last successful save. Resolves once settled. */
  flush(): Promise<void>
  /** Stop listening; a pending timer is cleared. Call flush() first to keep the last edit. */
  dispose(): void
}

export function createDraftWriter({ doc, kind, save, waitMs = 2000, onError }: DraftWriterOptions): DraftWriter {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastSaved: string | null = null
  let inFlight: Promise<void> = Promise.resolve()
  let disposed = false

  const run = (): Promise<void> => {
    const snap = snapshotForStorage(doc, kind)
    if (!snap) return Promise.resolve()
    const key = JSON.stringify(snap.tree)
    if (key === lastSaved) return Promise.resolve()
    // One save at a time: a later save waits for the earlier one, so drafts land in order.
    inFlight = inFlight.then(async () => {
      try {
        await save(snap.tree)
        lastSaved = key
      } catch (e) {
        onError?.(e)
      }
    })
    return inFlight
  }

  const onUpdate = () => {
    if (disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void run()
    }, waitMs)
  }
  doc.on('update', onUpdate)

  return {
    flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      return run()
    },
    dispose() {
      disposed = true
      if (timer) clearTimeout(timer)
      timer = null
      doc.off('update', onUpdate)
    },
  }
}

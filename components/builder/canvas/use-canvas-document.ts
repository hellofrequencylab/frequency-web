'use client'

// THE CANVAS ON A REAL DOCUMENT (PROG-E5B). Holds the page's nodes as the server sent them, which one is selected,
// and the save state. An inspector edit lands on the selected node at once (the frame redraws from it) and is saved
// to the Space's draft a moment later through the one server action, one node at a time, each save carrying the
// base the last one returned. A conflict stops saving for good: the tab is stale and only a reload is honest.
// Given no document it does nothing, so the canvas keeps its local demo block.

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveCanvasNodeDraft } from '@/app/(main)/pages/canvas/document-actions'
import type { CanvasDocumentView, CanvasNodeValues, CanvasNodeView } from '@/lib/builder/canvas-document'
import { nodeDeviceValues, withDeviceValues } from '@/lib/builder/node-responsive'

export type CanvasSaveState = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict' | 'read-only'

/** Quiet time after the last edit before a save, in ms. */
const SAVE_WAIT_MS = 700

type StoredNode = CanvasNodeView['node']

/** Only the values the inspector draws cross to the server: strings and booleans. */
function wireValues(node: StoredNode): CanvasNodeValues {
  const out: Record<string, Record<string, string | boolean>> = {}
  for (const [device, bag] of Object.entries(nodeDeviceValues(node))) {
    out[device] = Object.fromEntries(Object.entries(bag ?? {}).filter((entry): entry is [string, string | boolean] => typeof entry[1] === 'string' || typeof entry[1] === 'boolean'))
  }
  return out
}

export function useCanvasDocument(document: CanvasDocumentView | undefined) {
  const [nodes, setNodes] = useState<ReadonlyMap<string, StoredNode>>(() => new Map(document?.nodes.map((n) => [n.nid, n.node])))
  const [selectedId, setSelectedId] = useState<string | null>(document?.nodes[0]?.nid ?? null)
  const [save, setSave] = useState<CanvasSaveState>(document?.canSave ? 'saved' : 'read-only')
  const [problem, setProblem] = useState<string | null>(null)

  const latest = useRef(nodes)
  const base = useRef(document?.base)
  const dirty = useRef(new Set<string>())
  const edits = useRef(0)
  const busy = useRef(false)
  const stopped = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(async () => {
    if (!document?.canSave || busy.current || stopped.current) return
    busy.current = true
    try {
      while (dirty.current.size && !stopped.current) {
        const nid: string = dirty.current.values().next().value!
        const node = latest.current.get(nid)
        dirty.current.delete(nid)
        if (!node || !base.current) continue
        const sentAt = edits.current
        setSave('saving')
        const result = await saveCanvasNodeDraft({ spaceId: document.spaceId, nid, base: base.current, values: wireValues(node) }).catch(() => null)
        if (!result || !result.ok) {
          // A conflict is final for this tab. Anything else keeps the edit queued: the next change tries again.
          if (result?.conflict) stopped.current = true
          else dirty.current.add(nid)
          setProblem(result?.error ?? 'Could not reach the server. Your next change tries again.')
          setSave(result?.conflict ? 'conflict' : 'error')
          return
        }
        base.current = result.base
        setProblem(null)
        // Take the stored form (sanitized) only if nothing was typed while the save was in flight.
        if (edits.current === sentAt) {
          const next = new Map(latest.current).set(nid, result.node)
          latest.current = next
          setNodes(next)
        }
      }
      setSave(dirty.current.size ? 'unsaved' : 'saved')
    } finally {
      // An edit made while a save was in flight is already in `dirty`, so the loop above saved it too.
      busy.current = false
    }
  }, [document])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const edit = useCallback((values: CanvasNodeValues) => {
    if (!selectedId) return
    const current = latest.current.get(selectedId)
    if (!current) return
    const next = new Map(latest.current).set(selectedId, withDeviceValues({ ...current }, values))
    latest.current = next
    setNodes(next)
    if (!document?.canSave || stopped.current) return
    edits.current += 1
    dirty.current.add(selectedId)
    setSave((state) => (state === 'saving' ? state : 'unsaved'))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; void flush() }, SAVE_WAIT_MS)
  }, [document, flush, selectedId])

  const view = document?.nodes.find((n) => n.nid === selectedId)
  const node = selectedId ? nodes.get(selectedId) : undefined
  return {
    /** The selected node with its controls, or null (no document, or nothing selected). */
    selected: view && node ? { ...view, node } : null,
    selectedId,
    select: setSelectedId,
    edit,
    save,
    problem,
  }
}

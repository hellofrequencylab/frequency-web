'use client'

// THE CANVAS ON A REAL DOCUMENT (PROG-E5B). Holds the page's nodes as the server sent them, which one is selected,
// and the save state. An inspector edit lands on the selected node at once (the frame redraws from it) and is saved
// to the Space's draft a moment later through the one server action, one node at a time, each save carrying the
// base the last one returned. A conflict stops saving for good: the tab is stale and only a reload is honest.
// Given no document it does nothing, so the canvas keeps its local demo block.
//
// The page's shape (PROG-E6B). A move in the layer tree, a spacing step on the selected block and an insert go
// through the same action and the same base, in the order they were made, ahead of any field edit still waiting.
// A move and a spacing step show at once; an insert shows when the server has stored it. After a move or an
// insert the server sends the page's shape again and the tab takes it. A change the server refuses is put back.
//
// Duplicate, hide, remove and undo (PROG-E6C). The first three ride the same queue; each shows once the server has
// stored it, and a copy or a removal moves the selection to the block it names. Undo walks back the page's shape:
// every change above queues its opposite as it is sent (lib/builder/canvas-tree.ts undoChange), and an add queues
// its own removal once the server has named the new block. An undo is one more change through the same write.
// Typing is not on this stack: a field keeps the browser's own text undo.

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveCanvasNodeDraft } from '@/app/(main)/pages/canvas/document-actions'
import type { CanvasDocumentView, CanvasNodeValues, CanvasNodeView } from '@/lib/builder/canvas-document'
import { moveInTree, spacingStepOf, treeLayers, undoChange, undoWords, UNDO_ADD, withSpacing, type CanvasChange, type LayerSlot, type LayerTree, type SpacingEdge, type SpacingStep } from '@/lib/builder/canvas-tree'
import { nodeDeviceValues, withDeviceValues } from '@/lib/builder/node-responsive'

export type CanvasSaveState = 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict' | 'read-only'

/** Quiet time after the last edit before a save, in ms. */
const SAVE_WAIT_MS = 700

type StoredNode = CanvasNodeView['node']
/** What changes when the page's structure does. `views` are the blocks with their controls. */
type Shape = Pick<CanvasDocumentView, 'layers' | 'tree' | 'inserter'> & { views: CanvasNodeView[] }
type Job = { nid: string; change: CanvasChange; undoing?: true }
/** One step the Undo button can take back: the change that reverses it, on the block it names. `job` is the change
 *  it reverses, so a refused change takes its undo with it. */
type UndoStep = { nid: string; change: CanvasChange; job: Job }
/** How many steps back Undo can go. */
const UNDO_DEPTH = 30

/** Only the values the inspector draws cross to the server: strings and booleans. */
function wireValues(node: StoredNode): CanvasNodeValues {
  const out: Record<string, Record<string, string | boolean>> = {}
  for (const [device, bag] of Object.entries(nodeDeviceValues(node))) {
    out[device] = Object.fromEntries(Object.entries(bag ?? {}).filter((entry): entry is [string, string | boolean] => typeof entry[1] === 'string' || typeof entry[1] === 'boolean'))
  }
  return out
}

/** Whether a block is hidden from the page, as the tree reads. */
const hiddenIn = (tree: LayerTree | undefined, nid: string | null) => !!(nid && tree && treeLayers(tree).find((layer) => layer.id === nid)?.hidden)

function withStyle(node: StoredNode, style: StoredNode['style']): StoredNode {
  const next = { ...node }
  if (style) next.style = style
  else delete next.style
  return next
}

export function useCanvasDocument(document: CanvasDocumentView | undefined) {
  const [nodes, setNodes] = useState<ReadonlyMap<string, StoredNode>>(() => new Map(document?.nodes.map((n) => [n.nid, n.node])))
  const [shape, setShape] = useState<Shape>(() => ({ layers: document?.layers ?? [], tree: document?.tree, inserter: document?.inserter, views: document?.nodes ?? [] }))
  const [selectedId, setSelectedId] = useState<string | null>(document?.nodes[0]?.nid ?? null)
  const [save, setSave] = useState<CanvasSaveState>(document?.canSave ? 'saved' : 'read-only')
  const [problem, setProblem] = useState<string | null>(null)

  const latest = useRef(nodes)
  const shown = useRef(shape)
  // What the server last confirmed: the shape and the nodes a refused change goes back to.
  const settled = useRef(shape)
  const confirmed = useRef(nodes)
  const base = useRef(document?.base)
  const dirty = useRef(new Set<string>())
  const jobs = useRef<Job[]>([])
  const edits = useRef(0)
  const busy = useRef(false)
  const stopped = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undos = useRef<UndoStep[]>([])
  const [undoLabel, setUndoLabel] = useState<string | null>(null)
  const remember = useCallback((step: UndoStep) => {
    undos.current = [...undos.current, step].slice(-UNDO_DEPTH)
    setUndoLabel(undoWords(step.change))
  }, [])
  const forget = useCallback((dropped: readonly Job[]) => {
    undos.current = undos.current.filter((step) => !dropped.includes(step.job))
    const top = undos.current.at(-1)
    setUndoLabel(top ? undoWords(top.change) : null)
  }, [])

  const show = useCallback((next: Shape) => { shown.current = next; setShape(next) }, [])
  const put = useCallback((nid: string, node: StoredNode) => {
    const next = new Map(latest.current).set(nid, node)
    latest.current = next
    setNodes(next)
  }, [])

  const flush = useCallback(async () => {
    if (!document?.canSave || busy.current || stopped.current) return
    busy.current = true
    try {
      while ((jobs.current.length || dirty.current.size) && !stopped.current) {
        // The page's shape goes first, in the order it was changed; then one waiting field edit.
        const job = jobs.current.shift()
        const nid: string = job ? job.nid : dirty.current.values().next().value!
        if (!job) dirty.current.delete(nid)
        const node = latest.current.get(nid)
        if (!base.current || (!job && !node)) continue
        const sentAt = edits.current
        setSave('saving')
        const result = await saveCanvasNodeDraft({ spaceId: document.spaceId, nid, base: base.current, values: job || !node ? {} : wireValues(node), ...(job ? { change: job.change } : {}) }).catch(() => null)
        if (!result || !result.ok) {
          // A conflict is final for this tab. Anything else keeps the edit queued: the next change tries again.
          if (result?.conflict) stopped.current = true
          else if (!job) dirty.current.add(nid)
          else if (!result) jobs.current.unshift(job)
          else {
            // The server said no to this change: show the page as it is stored, and drop what was built on it.
            forget([job, ...jobs.current])
            jobs.current = []
            show(settled.current)
            const kept = confirmed.current.get(nid)
            if (job.change.kind === 'spacing' && node && kept) put(nid, withStyle(node, kept.style))
          }
          setProblem(result?.error ?? 'Could not reach the server. Your next change tries again.')
          setSave(result?.conflict ? 'conflict' : 'error')
          return
        }
        base.current = result.base
        setProblem(null)
        if (result.view) {
          // A move or an insert: take the stored shape, keeping any block still being typed in as it is here.
          const stored = new Map(result.view.nodes.map((n) => [n.nid, n.node]))
          const next = new Map(result.view.nodes.map((n) => [n.nid, (dirty.current.has(n.nid) && latest.current.get(n.nid)) || n.node]))
          confirmed.current = stored
          latest.current = next
          setNodes(next)
          settled.current = { layers: result.view.layers, tree: result.view.tree, inserter: result.view.inserter, views: result.view.nodes }
          // Moves made since this one was sent are still queued: keep them on screen.
          let tree = settled.current.tree
          for (const waiting of jobs.current) if (tree && waiting.change.kind === 'move') tree = moveInTree(tree, waiting.nid, waiting.change.to)
          show(tree && tree !== settled.current.tree ? { ...settled.current, tree, layers: treeLayers(tree) } : settled.current)
          if (job && job.change.kind !== 'move' && job.change.kind !== 'hide') setSelectedId(result.node.nid)
          // An add is undone by taking the new block away, and only now is its id known.
          if (job && !job.undoing && (job.change.kind === 'insert' || job.change.kind === 'duplicate')) remember({ nid: result.node.nid, change: UNDO_ADD, job })
        } else {
          confirmed.current = new Map(confirmed.current).set(nid, result.node)
          // Take the stored form (sanitized) only if nothing was typed while the save was in flight.
          if (edits.current === sentAt) put(nid, result.node)
        }
      }
      setSave(dirty.current.size || jobs.current.length ? 'unsaved' : 'saved')
    } finally {
      // An edit made while a save was in flight is already in `dirty`, so the loop above saved it too.
      busy.current = false
    }
  }, [document, forget, put, remember, show])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const edit = useCallback((values: CanvasNodeValues) => {
    if (!selectedId) return
    const current = latest.current.get(selectedId)
    if (!current) return
    put(selectedId, withDeviceValues({ ...current }, values))
    if (!document?.canSave || stopped.current) return
    edits.current += 1
    dirty.current.add(selectedId)
    setSave((state) => (state === 'saving' ? state : 'unsaved'))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; void flush() }, SAVE_WAIT_MS)
  }, [document, flush, put, selectedId])

  /** Queue one change to the page's shape and send it now. Unless it is itself an undo, its opposite goes on the
   *  undo stack, worked out from the page as it is shown before the change. */
  const send = useCallback((job: Job) => {
    if (!document?.canSave || stopped.current) return
    if (!job.undoing && shown.current.tree) {
      const top = undos.current.at(-1)
      const sameEdge = job.change.kind === 'spacing' && top?.nid === job.nid && top.change.kind === 'spacing' && top.change.edge === job.change.edge
      const hidden = treeLayers(shown.current.tree).find((layer) => layer.id === job.nid)?.hidden
      const back = sameEdge ? null : undoChange(shown.current.tree, job.nid, job.change, { style: latest.current.get(job.nid)?.style, hidden })
      if (back) remember({ nid: job.nid, change: back, job })
    }
    edits.current += 1
    jobs.current.push(job)
    setSave((state) => (state === 'saving' ? state : 'unsaved'))
    void flush()
  }, [document, flush, remember])

  /** Move a block to a slot in the layer tree. Shown at once; saved when the viewer can save. */
  const move = useCallback((nid: string, to: LayerSlot, undoing?: true) => {
    const before = shown.current
    const tree = before.tree && moveInTree(before.tree, nid, to)
    if (!tree || tree === before.tree) return
    // The undo is worked out from the page before the move, so send it before the new tree is shown.
    send({ nid, change: { kind: 'move', to }, ...(undoing ? { undoing } : {}) })
    show({ ...before, tree, layers: treeLayers(tree) })
  }, [send, show])

  /** Set one spacing step on a block (the selected one unless named). Steps made faster than they save collapse
   *  into the last one. */
  const spaceOn = useCallback((nid: string | null, edge: SpacingEdge, step: SpacingStep, undoing?: true) => {
    const current = nid ? latest.current.get(nid) : undefined
    if (!nid || !current || spacingStepOf(current.style, edge) === step) return
    const job: Job = { nid, change: { kind: 'spacing', edge, step }, ...(undoing ? { undoing } : {}) }
    // The undo reads the step before this one, so it is worked out before the new step is put on the block.
    send(job)
    put(nid, withStyle(current, withSpacing(current.style, edge, step)))
    jobs.current = jobs.current.filter((queued) => queued === job || !(queued.nid === nid && queued.change.kind === 'spacing' && queued.change.edge === edge))
  }, [put, send])
  const space = useCallback((edge: SpacingEdge, step: SpacingStep) => spaceOn(selectedId, edge, step), [selectedId, spaceOn])

  /** Add a preset or a blank block under the selected block. It appears once the server has stored it. */
  const insert = useCallback((source: 'preset' | 'blank', id: string) => {
    if (selectedId) send({ nid: selectedId, change: { kind: 'insert', source, id } })
  }, [selectedId, send])

  /** A copy of the selected block, words and all, right under it. It is selected once the server has stored it. */
  const duplicate = useCallback(() => {
    if (selectedId) send({ nid: selectedId, change: { kind: 'duplicate' } })
  }, [selectedId, send])

  /** Hide the selected block from the page, or show it again. It stays in its place in Layers either way. */
  const toggleHidden = useCallback(() => {
    if (selectedId) send({ nid: selectedId, change: { kind: 'hide', hidden: !hiddenIn(shown.current.tree, selectedId) } })
  }, [selectedId, send])

  /** Take the selected block off the page. It is kept in the Space page builder's tray, so Undo can put it back. */
  const remove = useCallback(() => {
    if (selectedId) send({ nid: selectedId, change: { kind: 'remove', keep: true } })
  }, [selectedId, send])

  /** Take back the last change to the page's shape. */
  const undo = useCallback(() => {
    const step = undos.current.at(-1)
    if (!step || !document?.canSave || stopped.current) return
    undos.current = undos.current.slice(0, -1)
    const top = undos.current.at(-1)
    setUndoLabel(top ? undoWords(top.change) : null)
    const { nid, change } = step
    if (change.kind === 'move') return move(nid, change.to, true)
    if (change.kind === 'spacing') return spaceOn(nid, change.edge, change.step, true)
    setSelectedId(nid)
    send({ nid, change, undoing: true })
  }, [document, move, send, spaceOn])

  const view = shape.views.find((n) => n.nid === selectedId)
  const node = selectedId ? nodes.get(selectedId) : undefined
  return {
    /** The selected node with its controls, or null (no document, or nothing selected). */
    selected: view && node ? { ...view, node } : null,
    selectedId,
    select: setSelectedId,
    edit,
    layers: shape.layers,
    tree: shape.tree,
    inserter: shape.inserter,
    move,
    space,
    insert,
    duplicate,
    toggleHidden,
    remove,
    undo,
    /** What Undo would take back, in words, or null when there is nothing to undo. */
    undoLabel,
    /** Whether the selected block is hidden from the page. */
    selectedHidden: hiddenIn(shape.tree, selectedId),
    save,
    problem,
  }
}

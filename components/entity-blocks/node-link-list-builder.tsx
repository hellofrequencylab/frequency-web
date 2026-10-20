'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { entityBlockById, blockSupportsKind, type EntityBlockDef } from '@/lib/entity-blocks/registry'
import {
  addNode,
  benchNode,
  canPlaceType,
  hideNode,
  placeNode,
  removeNode,
  setNodeContent,
  setNodeStyle,
  unhideNode,
} from '@/lib/entity-blocks/node-ops'
import { addNodeRow, moveNodeRow, removeNodeRow } from '@/lib/entity-blocks/node-row-ops'
import { upgradeLayout, type BlockNode, type NodeLayout } from '@/lib/entity-blocks/node-tree'
import type { BlockStyle } from '@/lib/entity-blocks/block-content'
import { useNodeLayout } from './node-layout-store'
import { BlockEditPanel } from './block-edit-panel'
import { BlockPill, label, type BuilderRailData } from './profile-page-builder'
import { capsLabel } from '@/components/ui/caps-label'

// THE NODE LINK LIST (E0 task 12b, ADR-1854). The one-column half of the builder on the node store: the
// Space Spotlight's editor, `EntityPageBuilder` with `maxColumns={1}` for nodes. No rows or columns are shown;
// each placed node is a strip with on/off, up/down and a menu, and an "Add a block" row adds a new node or
// puts a benched one back. Under the strips a node is one row of one column, which is the shape the
// Spotlight stores (spotlight.ts), so a move is a row move.
//
// The Spotlight preview carries no Space slug, so block text is edited in the rail here (contentOnCanvas is
// off) and the page's inline editors never turn on. A node id is a key and a comparison here, never a
// property name written through: CodeQL js/remote-property-injection.
//
// DORMANT: nothing mounts this until the Spotlight page picks it behind `render_path_spotlight`.

const EMPTY: NodeLayout = { rows: [], bench: [] }

function seedLayout(d: BuilderRailData): NodeLayout {
  return d.nodeLayout ?? upgradeLayout({ rows: d.rows, hidden: d.hidden, content: d.content, style: d.style }) ?? EMPTY
}

/** Drop rows with no node, so a benched or removed block never leaves a gap in the list. */
function pruneEmptyRows(layout: NodeLayout): NodeLayout {
  return layout.rows
    .filter((r) => r.cells.every((stack) => stack.length === 0))
    .reduce((acc, r) => removeNodeRow(acc, r.id), layout)
}

/** The placed nodes in reading order, each with the index of the row it sits in. */
function placedNodes(layout: NodeLayout): { node: BlockNode; rowIndex: number }[] {
  return layout.rows.flatMap((row, rowIndex) => row.cells.flat().map((node) => ({ node, rowIndex })))
}

export function NodeLinkListBuilder({
  pageId,
  loadRailData,
  seed,
  paletteBlockIds,
  editHrefFor,
}: {
  /** The Space slug; guarded against the seed's matchId. */
  pageId: string
  loadRailData: () => Promise<BuilderRailData | null>
  /** A pre-fetched seed (ADR-550); `undefined` self-fetches through loadRailData. */
  seed?: BuilderRailData | null
  /** The palette, in this order (the Spotlight's, lib/spaces/spotlight.ts). */
  paletteBlockIds: readonly string[]
  editHrefFor?: (blockId: string) => string | null
}) {
  const store = useNodeLayout()
  const [loading, setLoading] = useState(true)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [lockedIds, setLockedIds] = useState<string[]>([])
  const [pickerData, setPickerData] = useState<NonNullable<BuilderRailData['pickerData']>>({})
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [grabbed, setGrabbed] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const dragNid = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const apply = (d: BuilderRailData | null) => {
      if (!active) return
      setMatchId(d?.matchId ?? null)
      setLockedIds(d?.lockedIds ?? [])
      setPickerData(d?.pickerData ?? {})
      if (d && store) store.seed(seedLayout(d))
      setLoading(false)
    }
    if (seed !== undefined) {
      apply(seed)
      return () => {
        active = false
      }
    }
    loadRailData().then(apply)
    return () => {
      active = false
    }
  }, [store, loadRailData, seed])

  const say = (msg: string) => setAnnounce(msg)
  const mutate = (change: (l: NodeLayout) => NodeLayout) => store?.edit(change)

  if (loading) return <div className="h-40 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  if (!store || !store.seeded || !store.layout || !matchId || matchId !== pageId) return null

  const layout = store.layout
  const selectedNid = store.selectedNid
  const lockedSet = new Set(lockedIds)
  const palette: EntityBlockDef[] = paletteBlockIds
    .map((id) => entityBlockById(id))
    .filter((b): b is EntityBlockDef => !!b && blockSupportsKind(b, 'space') && !lockedSet.has(b.id))
  const paletteTypes = new Set(palette.map((b) => b.id))
  const placed = placedNodes(layout)
  const nameOf = (node: BlockNode) => label(node.type)

  // "Add a block": a benched node of a palette type comes back first, else a new node of each type that is
  // not at its cap.
  const benched = layout.bench.filter((n) => paletteTypes.has(n.type))
  const benchedTypes = new Set(benched.map((n) => n.type))
  const addable = palette.filter((b) => !benchedTypes.has(b.id) && canPlaceType(layout, b.id))

  function withNewRow(change: (l: NodeLayout, rowId: string) => NodeLayout, done: string) {
    if (addNodeRow(layout).rows.length === layout.rows.length) {
      say('That is the maximum number of blocks.')
      return
    }
    mutate((l) => {
      const withRow = addNodeRow(l)
      return change(withRow, withRow.rows[withRow.rows.length - 1].id)
    })
    say(done)
  }

  function onAddType(type: string) {
    withNewRow((l, rowId) => addNode(l, type, rowId, 0).layout, `${label(type)} added.`)
  }
  function onPutBack(node: BlockNode) {
    withNewRow((l, rowId) => placeNode(l, node.nid, rowId, 0), `${nameOf(node)} added.`)
  }
  function onMoveBy(node: BlockNode, delta: -1 | 1) {
    const at = placed.findIndex((p) => p.node.nid === node.nid)
    const to = placed[at + delta]
    if (at < 0 || !to) return
    mutate((l) => moveNodeRow(l, placed[at].rowIndex, to.rowIndex))
    say(`${nameOf(node)} moved ${delta < 0 ? 'up' : 'down'}.`)
  }
  function onToggleHide(node: BlockNode) {
    const hidden = node.hidden === true
    mutate((l) => (hidden ? unhideNode(l, node.nid) : hideNode(l, node.nid)))
    say(`${nameOf(node)} ${hidden ? 'shown' : 'hidden'}.`)
    setOpenMenu(null)
  }
  function onBench(node: BlockNode) {
    mutate((l) => pruneEmptyRows(benchNode(l, node.nid)))
    say(`${nameOf(node)} moved to Add a block.`)
    setOpenMenu(null)
  }
  function onDelete(node: BlockNode) {
    mutate((l) => pruneEmptyRows(removeNode(l, node.nid)))
    say(`${nameOf(node)} removed.`)
    setConfirmDelete(null)
    setOpenMenu(null)
  }
  function onDropOn(target: BlockNode) {
    const from = dragNid.current
    dragNid.current = null
    const a = placed.find((p) => p.node.nid === from)
    const b = placed.find((p) => p.node.nid === target.nid)
    if (a && b && a.rowIndex !== b.rowIndex) mutate((l) => moveNodeRow(l, a.rowIndex, b.rowIndex))
  }
  function handleKey(e: KeyboardEvent, node: BlockNode) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setGrabbed((g) => (g === node.nid ? null : node.nid))
      say(grabbed === node.nid ? `${nameOf(node)} dropped.` : `Grabbed ${nameOf(node)}. Use the arrow keys to move it.`)
      return
    }
    if (grabbed !== node.nid) return
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      onMoveBy(node, -1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      onMoveBy(node, 1)
    } else if (e.key === 'Escape') {
      setGrabbed(null)
    }
  }

  return (
    <section className="min-w-0 space-y-3" aria-label="Spotlight builder">
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-body-sm font-bold text-text">Your page</h3>
          <p className="text-meta text-muted">Add the blocks you want and put them in order. Changes save on their own.</p>
        </div>
        {store.saving ? (
          <span className="flex items-center gap-1 text-2xs text-muted" role="status" aria-live="polite">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving
          </span>
        ) : (
          <span className="flex items-center gap-1 text-2xs text-muted" role="status" aria-live="polite">
            <Check className="h-3 w-3 text-success" aria-hidden /> Saved
          </span>
        )}
      </header>

      {store.error && (
        <p className="rounded-control bg-danger-bg px-3 py-2 text-meta font-medium text-danger" role="alert">
          {store.error}
        </p>
      )}

      {placed.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-3 py-6 text-center text-meta text-muted">
          No blocks on your page yet. Add one below.
        </p>
      ) : (
        <ol className="space-y-2">
          {placed.map(({ node }, index) => (
            <li key={node.nid} onDragOver={(e) => dragNid.current && e.preventDefault()} onDrop={() => onDropOn(node)}>
              <BlockPill
                id={node.nid}
                type={node.type}
                hidden={node.hidden === true}
                grabbed={grabbed === node.nid}
                menuOpen={openMenu === `block:${node.nid}`}
                editing={selectedNid === node.nid}
                canUp={index > 0}
                canDown={index < placed.length - 1}
                sections={[]}
                currentRowId={null}
                confirmDelete={confirmDelete === node.nid}
                onDragStart={() => (dragNid.current = node.nid)}
                onDragEnd={() => (dragNid.current = null)}
                onHandleKey={(e) => handleKey(e, node)}
                onEdit={() => store.select(selectedNid === node.nid ? null : node.nid)}
                onUp={() => onMoveBy(node, -1)}
                onDown={() => onMoveBy(node, 1)}
                onToggleMenu={() => setOpenMenu((m) => (m === `block:${node.nid}` ? null : `block:${node.nid}`))}
                onMoveToSection={() => {}}
                onMoveToNewSection={() => {}}
                onToggleHide={() => onToggleHide(node)}
                onBench={() => onBench(node)}
                onAskDelete={() => setConfirmDelete(node.nid)}
                onCancelDelete={() => setConfirmDelete(null)}
                onConfirmDelete={() => onDelete(node)}
              />
              {selectedNid === node.nid && (
                <BlockEditPanel
                  id={node.type}
                  content={node.content ?? {}}
                  style={node.style ?? {}}
                  hidden={node.hidden === true}
                  editHref={editHrefFor?.(node.type) ?? null}
                  pickerData={pickerData[node.type]}
                  loomScope={pageId}
                  reseedSlug={pageId}
                  onContent={(props) => mutate((l) => setNodeContent(l, node.nid, Object.keys(props).length ? props : undefined))}
                  onStyle={(s: BlockStyle) => mutate((l) => setNodeStyle(l, node.nid, Object.keys(s).length ? s : undefined))}
                  onToggleHide={() => onToggleHide(node)}
                />
              )}
            </li>
          ))}
        </ol>
      )}

      {(benched.length > 0 || addable.length > 0) && (
        <section aria-label="Add a block" className="space-y-2 rounded-card border border-border bg-surface-elevated/40 p-2">
          <p className={capsLabel('px-1 text-2xs font-semibold text-muted')}>Add a block</p>
          <ul className="flex flex-wrap gap-1.5">
            {benched.map((node) => (
              <li key={node.nid}>
                <AddChip text={nameOf(node)} onClick={() => onPutBack(node)} />
              </li>
            ))}
            {addable.map((b) => (
              <li key={b.id}>
                <AddChip text={label(b.id)} onClick={() => onAddType(b.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}

function AddChip({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-pill border border-dashed border-border bg-surface px-2.5 py-1 text-2xs font-semibold text-text transition-colors hover:border-primary hover:text-primary-strong"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden /> {text}
    </button>
  )
}

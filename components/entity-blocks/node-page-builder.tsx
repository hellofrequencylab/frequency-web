'use client'

import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  Loader2,
} from 'lucide-react'
import { entityBlockById, blockSupportsKind, profilePaletteForKind, type EntityBlockDef } from '@/lib/entity-blocks/registry'
import {
  addNode,
  benchNode,
  canPlaceType,
  hideNode,
  nudgeNode,
  placeNode,
  removeNode,
  setNodeContent,
  setNodeStyle,
  unhideNode,
} from '@/lib/entity-blocks/node-ops'
import {
  addNodeRow,
  moveNodeRow,
  removeNodeRow,
  setNodeRowColumns,
  setNodeRowHeaderOn,
  setNodeRowMargin,
  setNodeRowRatio,
  setNodeRowTitle,
} from '@/lib/entity-blocks/node-row-ops'
import { upgradeLayout, type BlockNode, type NodeLayout } from '@/lib/entity-blocks/node-tree'
import type { BlockStyle, MarginStep } from '@/lib/entity-blocks/block-content'
import { MarginControl } from './controls/field-controls'
import { useNodeLayout } from './node-layout-store'
import { setSpaceEditMode } from './space-edit-mode'
import { BlockPicker } from './block-picker'
import { BlockEditPanel } from './block-edit-panel'
import { BlockPill, BlocksTray, Menu, MenuItem, RowLayoutPicker, label, type BuilderRailData } from './profile-page-builder'
import { Input } from '@/components/ui/field'
import { capsLabel } from '@/components/ui/caps-label'

// THE NODE PAGE BUILDER (E0 task 12b, ADR-1850). The in-rail outline editor for a Space page, on the node
// store (ADR-1835): the Space half of `EntityPageBuilder`, where every block is a NODE. Selection, move,
// hide, bench, remove and the content/style bags all address a node id, so two Text blocks are two blocks
// with two bags, and benching a block keeps its words. The pills, tray, menus and layout picker are the
// legacy builder's own (exported from it), so the two builders look and behave alike.
//
// Space only: the member list, the Spotlight and the email studio keep the legacy builder until their own
// slices. DORMANT: nothing mounts this yet. `SpacePageBuilder` picks it behind `render_path_space_profile`
// once the owner preview picks the node grid too (ADR-1833).
//
// A node id is a key here (React keys, the refs Map, comparisons) and never a property name written
// through: CodeQL js/remote-property-injection.

/** Data blocks the picker offers a way to start when the Space has none yet. */
const SETUP_FIRST: ReadonlySet<string> = new Set(['offerings'])

type Grab = { kind: 'row'; id: string } | { kind: 'block'; id: string } | null

const EMPTY: NodeLayout = { rows: [], bench: [] }

function seedLayout(d: BuilderRailData): NodeLayout {
  return d.nodeLayout ?? upgradeLayout({ rows: d.rows, hidden: d.hidden, content: d.content, style: d.style }) ?? EMPTY
}

function nodeOf(layout: NodeLayout, nid: string): BlockNode | null {
  for (const row of layout.rows) for (const stack of row.cells) for (const n of stack) if (n.nid === nid) return n
  return layout.bench.find((n) => n.nid === nid) ?? null
}

export function NodePageBuilder({
  pageId,
  loadRailData,
  seed,
  editHrefFor,
  kind = 'space',
}: {
  /** The Space slug (or the member handle); guarded against the seed's matchId. */
  pageId: string
  loadRailData: () => Promise<BuilderRailData | null>
  /** A pre-fetched seed from the rail bundle (ADR-550); `undefined` self-fetches through loadRailData. */
  seed?: BuilderRailData | null
  editHrefFor?: (blockId: string) => string | null
  /** Whose page this arranges: its palette and what it may hold. Defaults to a Space. */
  kind?: 'space' | 'member'
}) {
  const store = useNodeLayout()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [lockedIds, setLockedIds] = useState<string[]>([])
  const [pickerData, setPickerData] = useState<NonNullable<BuilderRailData['pickerData']>>({})
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [addingAt, setAddingAt] = useState<{ rowId: string; col: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [grab, setGrab] = useState<Grab>(null)
  const [announce, setAnnounce] = useState('')
  const [dragKind, setDragKind] = useState<null | 'row' | 'block'>(null)
  const [dragRowId, setDragRowId] = useState<string | null>(null)
  const dragBlock = useRef<string | null>(null)
  const dragRow = useRef<string | null>(null)
  const activePanelRef = useRef<HTMLDivElement | null>(null)
  const prevSelected = useRef<string | null>(null)

  // A DATA block's authored header/body is server-rendered from live data, so its edit needs one server
  // refresh once the save lands (same reconcile as the legacy builder).
  const dataDirty = useRef(false)
  const wasSaving = useRef(false)
  const [reconciling, setReconciling] = useState(false)
  useEffect(() => {
    const saving = !!store?.saving
    if (wasSaving.current && !saving && dataDirty.current) {
      dataDirty.current = false
      wasSaving.current = saving
      router.refresh()
      const t = setTimeout(() => setReconciling(false), 500)
      return () => clearTimeout(t)
    }
    wasSaving.current = saving
  }, [store?.saving, router])

  // Seed the node store from the owner-gated rail data (the first seed wins).
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

  // Mounting past the owner guard turns the page's inline editors on; unmounting turns them off.
  const builderActive = !loading && !!store?.seeded && matchId != null && matchId === pageId
  useEffect(() => {
    setSpaceEditMode(builderActive)
    return () => setSpaceEditMode(false)
  }, [builderActive])

  // Ctrl/Cmd+Z undo while live-editing; ignored in text fields so it never fights the browser's own undo.
  useEffect(() => {
    if (!builderActive || !store) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      e.preventDefault()
      store.undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [builderActive, store])

  // The rail follows the page: a new selection scrolls its open settings panel into view.
  const selectedNid = store?.selectedNid ?? null
  useEffect(() => {
    if (selectedNid && selectedNid !== prevSelected.current) {
      activePanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    prevSelected.current = selectedNid
  }, [selectedNid])

  const say = useCallback((msg: string) => setAnnounce(msg), [])
  // Every mutation folds over the FRESHEST layout (the store's `edit`), not this render's snapshot.
  const mutate = useCallback((change: (l: NodeLayout) => NodeLayout) => store?.edit(change), [store])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!store || !store.seeded || !store.layout || !matchId || matchId !== pageId) return null

  const layout = store.layout
  const typeOf = (nid: string): string => nodeOf(layout, nid)?.type ?? nid
  const nameOf = (nid: string): string => label(typeOf(nid))
  const lockedSet = new Set(lockedIds)
  const palette: EntityBlockDef[] = profilePaletteForKind(kind).filter((b) => !lockedSet.has(b.id))
  const paletteTypes = new Set(palette.map((b) => b.id))
  // Services has no data until the first one exists, so the picker offers a way to start it instead of nothing.
  const setupLinks = kind === 'space'
    ? lockedIds.flatMap((id) => {
        const href = SETUP_FIRST.has(id) ? editHrefFor?.(id) : null
        const def = entityBlockById(id)
        return href && def ? [{ id, label: def.label, description: 'Add your first one to put it on your page.', href }] : []
      })
    : []
  // Types the picker greys out: a data block already on the page (the per-type cap, block-limits.ts).
  const atCap = new Set(palette.filter((b) => !canPlaceType(layout, b.id)).map((b) => b.id))
  const bench = layout.bench.filter((n) => paletteTypes.has(n.type) && blockSupportsKind(entityBlockById(n.type)!, kind)).map((n) => n.nid)
  const emptySlots = layout.rows.flatMap((r, ri) => r.cells.map((_s, ci) => ({ rowId: r.id, ri, ci })))
  const moveTargets = layout.rows.map((r, ri) => ({ rowId: r.id, ri, full: false }))
  const slotSeq = layout.rows.flatMap((r) => r.cells.flatMap((stack) => stack.map((n) => n.nid)))

  // ── Row actions ──
  function onAddRow() {
    mutate((l) => addNodeRow(l))
    say('Row added.')
  }
  function onRemoveRow(rowId: string, index: number) {
    mutate((l) => removeNodeRow(l, rowId))
    say(`Row ${index + 1} removed. Its blocks moved to Blocks.`)
    setOpenMenu(null)
  }
  function onMoveRow(from: number, to: number) {
    if (to < 0 || to >= layout.rows.length || to === from) return
    mutate((l) => moveNodeRow(l, from, to))
    say(`Row moved to position ${to + 1} of ${layout.rows.length}.`)
  }
  function onSetRowLayout(rowId: string, choice: 'full' | 'even' | 'lead') {
    mutate((l) => {
      const next = setNodeRowColumns(l, rowId, choice === 'full' ? 1 : 2)
      return choice === 'full' ? next : setNodeRowRatio(next, rowId, choice)
    })
    say(
      choice === 'full'
        ? 'Row set to full width.'
        : choice === 'lead'
          ? 'Row split into a main and a side column.'
          : 'Row split into two even columns.',
    )
  }

  // ── Block actions ──
  function onPlace(nid: string, rowId: string, col: number) {
    mutate((l) => placeNode(l, nid, rowId, col))
    say(`${nameOf(nid)} placed.`)
    setOpenMenu(null)
  }
  function onAddType(type: string, rowId: string, col: number) {
    mutate((l) => addNode(l, type, rowId, col).layout)
    say(`${label(type)} added.`)
    setAddingAt(null)
  }
  function onBench(nid: string) {
    mutate((l) => benchNode(l, nid))
    say(`${nameOf(nid)} moved to Blocks.`)
    setOpenMenu(null)
  }
  function onToggleHide(nid: string) {
    const hidden = nodeOf(layout, nid)?.hidden === true
    mutate((l) => (hidden ? unhideNode(l, nid) : hideNode(l, nid)))
    say(`${nameOf(nid)} ${hidden ? 'shown' : 'hidden'}.`)
    setOpenMenu(null)
  }
  function onEditContent(nid: string, props: Record<string, unknown>) {
    mutate((l) => setNodeContent(l, nid, Object.keys(props).length ? props : undefined))
    if (entityBlockById(typeOf(nid))?.category === 'data') {
      dataDirty.current = true
      setReconciling(true)
    }
  }
  function onEditStyle(nid: string, style: BlockStyle) {
    mutate((l) => setNodeStyle(l, nid, Object.keys(style).length ? style : undefined))
  }
  function onDelete(nid: string) {
    const name = nameOf(nid)
    mutate((l) => removeNode(l, nid))
    say(`${name} removed.`)
    setConfirmDelete(null)
    setOpenMenu(null)
  }
  function onMoveToSection(nid: string, rowId: string) {
    const ri = layout.rows.findIndex((r) => r.id === rowId)
    if (ri < 0) return
    mutate((l) => placeNode(l, nid, rowId, 0))
    say(`${nameOf(nid)} moved to section ${ri + 1}.`)
    setOpenMenu(null)
  }
  function onMoveToNewSection(nid: string) {
    if (addNodeRow(layout).rows.length === layout.rows.length) {
      say('That is the maximum number of sections.')
      setOpenMenu(null)
      return
    }
    mutate((l) => {
      const withRow = addNodeRow(l)
      return placeNode(withRow, nid, withRow.rows[withRow.rows.length - 1].id, 0)
    })
    say(`${nameOf(nid)} moved to a new section.`)
    setOpenMenu(null)
  }

  // Up/down: nudge within the column stack, otherwise carry the block to the adjacent row, or spawn a
  // full-width row at the edge so a block sharing its row can never dead-end.
  function moveBlockBy(nid: string, delta: -1 | 1) {
    let ri = -1
    let ci = -1
    let pi = -1
    for (let r = 0; r < layout.rows.length && ri < 0; r++) {
      for (let c = 0; c < layout.rows[r].cells.length; c++) {
        const idx = layout.rows[r].cells[c].findIndex((n) => n.nid === nid)
        if (idx >= 0) {
          ri = r
          ci = c
          pi = idx
          break
        }
      }
    }
    if (ri < 0) return
    const stack = layout.rows[ri].cells[ci]
    if ((delta < 0 && pi > 0) || (delta > 0 && pi < stack.length - 1)) {
      mutate((l) => nudgeNode(l, nid, delta))
      say(`${nameOf(nid)} moved ${delta < 0 ? 'up' : 'down'}.`)
      return
    }
    const targetRow = layout.rows[ri + delta]
    if (!targetRow) {
      if (layout.rows[ri].columns === 1 && stack.length === 1) return
      const insertAt = delta < 0 ? ri : ri + 1
      if (addNodeRow(layout, insertAt).rows.length === layout.rows.length) {
        say('That is the maximum number of sections.')
        return
      }
      mutate((l) => {
        const withRow = addNodeRow(l, insertAt)
        return placeNode(withRow, nid, withRow.rows[insertAt].id, 0)
      })
      say(`${nameOf(nid)} moved to a new full-width section.`)
      return
    }
    const targetCol = Math.min(ci, targetRow.columns - 1)
    const at = delta < 0 ? (targetRow.cells[targetCol]?.length ?? 0) : 0
    mutate((l) => placeNode(l, nid, targetRow.id, targetCol, at))
    say(`${nameOf(nid)} moved to section ${ri + delta + 1}.`)
  }

  // ── Drag and drop ──
  function dropOnSlot(e: DragEvent, rowId: string, col: number) {
    e.preventDefault()
    e.stopPropagation()
    const nid = dragBlock.current
    dragBlock.current = null
    setDragKind(null)
    if (nid) onPlace(nid, rowId, col)
  }
  function dropOnRow(e: DragEvent, toIndex: number) {
    e.preventDefault()
    const rowId = dragRow.current
    dragRow.current = null
    setDragRowId(null)
    setDragKind(null)
    if (rowId) {
      const from = layout.rows.findIndex((r) => r.id === rowId)
      if (from >= 0) onMoveRow(from, toIndex)
    }
  }
  function rowHandleKey(e: KeyboardEvent, rowId: string, index: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (grab?.kind === 'row' && grab.id === rowId) {
        setGrab(null)
        say('Row dropped.')
      } else {
        setGrab({ kind: 'row', id: rowId })
        say(`Grabbed row ${index + 1}. Use the arrow keys to move it, Enter to drop, Escape to cancel.`)
      }
      return
    }
    if (grab?.kind === 'row' && grab.id === rowId) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onMoveRow(index, index - 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        onMoveRow(index, index + 1)
      } else if (e.key === 'Escape') {
        setGrab(null)
        say('Move cancelled.')
      }
    }
  }
  function blockHandleKey(e: KeyboardEvent, nid: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (grab?.kind === 'block' && grab.id === nid) {
        setGrab(null)
        say('Block dropped.')
      } else {
        setGrab({ kind: 'block', id: nid })
        say(`Grabbed ${nameOf(nid)}. Use the arrow keys to move it, Enter to drop, Escape to cancel.`)
      }
      return
    }
    if (grab?.kind === 'block' && grab.id === nid) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveBlockBy(nid, -1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveBlockBy(nid, 1)
      } else if (e.key === 'Escape') {
        setGrab(null)
        say('Move cancelled.')
      }
    }
  }

  // The settings panel of the selected node. The Space page is the editing canvas, so the rail is
  // SETTINGS-ONLY (`contentOnCanvas`): text and photos are edited on the page.
  const editPanelFor = (node: BlockNode) =>
    selectedNid === node.nid ? (
      <BlockEditPanel
        id={node.type}
        content={node.content ?? {}}
        style={node.style ?? {}}
        hidden={node.hidden === true}
        editHref={editHrefFor?.(node.type) ?? null}
        pickerData={pickerData[node.type]}
        loomScope={pageId}
        reseedSlug={pageId}
        contentOnCanvas
        onContent={(props) => onEditContent(node.nid, props)}
        onStyle={(s) => onEditStyle(node.nid, s)}
        onToggleHide={() => onToggleHide(node.nid)}
      />
    ) : null

  return (
    <section className="min-w-0 space-y-3" aria-label="Space page builder">
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-body-sm font-bold text-text">Your page</h3>
          <p className="text-meta text-muted">Arrange the blocks on your page into rows and columns. Changes save on their own.</p>
        </div>
        {store.saving || reconciling ? (
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

      <button
        type="button"
        onClick={onAddRow}
        className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border py-2.5 text-body-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add row
      </button>

      <ol className="space-y-2">
        {layout.rows.map((row, index) => {
          const isCollapsed = collapsed.has(row.id)
          const grabbed = grab?.kind === 'row' && grab.id === row.id
          return (
            <li
              key={row.id}
              onDragOver={(e) => dragRow.current && e.preventDefault()}
              onDrop={(e) => dropOnRow(e, index)}
              className={`rounded-card border bg-surface transition-colors ${
                grabbed
                  ? 'border-primary ring-1 ring-primary'
                  : dragKind === 'row' && dragRowId !== row.id
                    ? 'border-dashed border-primary/40'
                    : 'border-border'
              }`}
            >
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button
                  type="button"
                  draggable
                  onDragStart={() => {
                    dragRow.current = row.id
                    setDragRowId(row.id)
                    setDragKind('row')
                  }}
                  onDragEnd={() => {
                    dragRow.current = null
                    setDragRowId(null)
                    setDragKind(null)
                  }}
                  onKeyDown={(e) => rowHandleKey(e, row.id, index)}
                  aria-label={`Reorder row ${index + 1}. Press Enter to grab, then use the arrow keys.`}
                  aria-pressed={grabbed}
                  className="shrink-0 cursor-grab rounded-control border border-border p-1 text-subtle transition-colors hover:border-border-strong hover:bg-surface-elevated hover:text-text active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((s) => {
                      const n = new Set(s)
                      if (n.has(row.id)) n.delete(row.id)
                      else n.add(row.id)
                      return n
                    })
                  }
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? `Expand row ${index + 1}` : `Collapse row ${index + 1}`}
                  className="shrink-0 rounded p-1 text-subtle hover:bg-surface-elevated hover:text-text"
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                </button>
                <RowLayoutPicker index={index} columns={row.columns} ratio={row.ratio} onChoose={(choice) => onSetRowLayout(row.id, choice)} />
                <Input
                  variant="seamless"
                  type="text"
                  value={row.title ?? ''}
                  placeholder={`Row ${index + 1}`}
                  aria-label={`Title for row ${index + 1}`}
                  onChange={(e) => mutate((l) => setNodeRowTitle(l, row.id, e.target.value))}
                  className="min-w-0 flex-1 truncate rounded border border-transparent px-1 py-0.5 text-2xs text-text hover:border-border focus:border-border-strong"
                />
                <button
                  type="button"
                  aria-label={row.headerOn ? `Hide row ${index + 1} header on the live page` : `Show row ${index + 1} header on the live page`}
                  aria-pressed={!!row.headerOn}
                  title={row.headerOn ? 'Header shows on the live page' : 'Header hidden on the live page'}
                  disabled={!row.title}
                  onClick={() => {
                    mutate((l) => setNodeRowHeaderOn(l, row.id, !row.headerOn))
                    say(row.headerOn ? `Row ${index + 1} header hidden on the live page.` : `Row ${index + 1} header shown on the live page.`)
                  }}
                  className={`shrink-0 rounded p-1 transition-colors disabled:opacity-30 ${row.headerOn ? 'text-primary-strong' : 'text-subtle hover:text-text'}`}
                >
                  {row.headerOn ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
                </button>
                <button
                  type="button"
                  aria-label={`Move row ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => onMoveRow(index, index - 1)}
                  className="shrink-0 rounded p-1 text-subtle hover:bg-surface-elevated hover:text-text disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move row ${index + 1} down`}
                  disabled={index === layout.rows.length - 1}
                  onClick={() => onMoveRow(index, index + 1)}
                  className="shrink-0 rounded p-1 text-subtle hover:bg-surface-elevated hover:text-text disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-label={`Row ${index + 1} menu`}
                    aria-expanded={openMenu === `row:${row.id}`}
                    onClick={() => setOpenMenu((m) => (m === `row:${row.id}` ? null : `row:${row.id}`))}
                    className="rounded p-1 text-subtle hover:bg-surface-elevated hover:text-text"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>
                  {openMenu === `row:${row.id}` && (
                    <Menu>
                      <div className="space-y-1.5 px-2.5 py-2">
                        <p className={capsLabel('text-3xs font-semibold text-muted')}>Spacing</p>
                        <MarginControl
                          top={row.mt ?? 'none'}
                          bottom={row.mb ?? 'none'}
                          onTop={(v: MarginStep) => mutate((l) => setNodeRowMargin(l, row.id, 'mt', v))}
                          onBottom={(v: MarginStep) => mutate((l) => setNodeRowMargin(l, row.id, 'mb', v))}
                        />
                      </div>
                      <MenuItem onClick={() => onRemoveRow(row.id, index)} danger>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete row
                      </MenuItem>
                    </Menu>
                  )}
                </div>
              </div>

              {!isCollapsed && (
                <div className={`grid gap-1.5 px-2 pb-2 ${row.columns > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {row.cells.map((stack, col) => (
                    <div
                      key={`${row.id}-${col}`}
                      className={`space-y-1.5 rounded-control transition-colors ${dragKind === 'block' ? 'bg-primary/5 ring-1 ring-inset ring-primary/40' : ''}`}
                      onDragOver={(e) => dragBlock.current && e.preventDefault()}
                      onDrop={(e) => dropOnSlot(e, row.id, col)}
                    >
                      {stack.map((node) => {
                        const nid = node.nid
                        return (
                          <div key={nid} ref={selectedNid === nid ? activePanelRef : undefined}>
                            <BlockPill
                              id={nid}
                              type={node.type}
                              hidden={node.hidden === true}
                              grabbed={grab?.kind === 'block' && grab.id === nid}
                              menuOpen={openMenu === `block:${nid}`}
                              editing={selectedNid === nid}
                              canUp={slotSeq.indexOf(nid) > 0}
                              canDown={slotSeq.indexOf(nid) < slotSeq.length - 1}
                              sections={moveTargets}
                              currentRowId={row.id}
                              confirmDelete={confirmDelete === nid}
                              onDragStart={() => {
                                dragBlock.current = nid
                                setDragKind('block')
                              }}
                              onDragEnd={() => {
                                dragBlock.current = null
                                setDragKind(null)
                              }}
                              onHandleKey={(e) => blockHandleKey(e, nid)}
                              onEdit={() => store.select(selectedNid === nid ? null : nid)}
                              onUp={() => moveBlockBy(nid, -1)}
                              onDown={() => moveBlockBy(nid, 1)}
                              onToggleMenu={() => setOpenMenu((m) => (m === `block:${nid}` ? null : `block:${nid}`))}
                              onMoveToSection={(rid) => onMoveToSection(nid, rid)}
                              onMoveToNewSection={() => onMoveToNewSection(nid)}
                              onToggleHide={() => onToggleHide(nid)}
                              onBench={() => onBench(nid)}
                              onAskDelete={() => setConfirmDelete(nid)}
                              onCancelDelete={() => setConfirmDelete(null)}
                              onConfirmDelete={() => onDelete(nid)}
                            />
                            {editPanelFor(node)}
                          </div>
                        )
                      })}
                      {addingAt && addingAt.rowId === row.id && addingAt.col === col ? (
                        <BlockPicker palette={palette} taken={atCap} setup={setupLinks} onPick={(type) => onAddType(type, row.id, col)} onClose={() => setAddingAt(null)} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingAt({ rowId: row.id, col })}
                          className={`flex w-full items-center justify-center gap-1 rounded-control border border-dashed px-2 py-3 text-meta font-medium transition-colors hover:border-primary hover:text-text ${
                            dragKind === 'block' ? 'border-primary text-primary-strong' : 'border-border text-muted'
                          }`}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden /> {dragKind === 'block' ? 'Drop here' : 'Add block'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <BlocksTray
        bench={bench}
        typeOf={typeOf}
        emptySlots={emptySlots}
        openMenu={openMenu}
        onToggleMenu={(nid) => setOpenMenu((m) => (m === `bench:${nid}` ? null : `bench:${nid}`))}
        onDragStart={(nid) => {
          dragBlock.current = nid
          setDragKind('block')
        }}
        onDragEnd={() => {
          dragBlock.current = null
          setDragKind(null)
        }}
        onPlace={(nid, t) => onPlace(nid, t.rowId, t.ci)}
      />
    </section>
  )
}

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
  Inbox,
  MoveRight,
  Check,
  Loader2,
} from 'lucide-react'
import { blocksForKind, entityBlockById, MEMBER_CHROME_BLOCK_IDS, type EntityKind } from '@/lib/entity-blocks/registry'
import {
  starterRows,
  STARTER_LAYOUTS,
  maxColumnsForKind,
  type RowDef,
  type RowColumns,
  type RowRatio,
  type StarterId,
} from '@/lib/entity-blocks/layout'
import {
  addRow,
  removeRow,
  moveRow,
  setRowColumns,
  setRowRatio,
  placeBlock,
  benchBlock,
  hideBlock,
  unhideBlock,
  removeBlock,
  swapCells,
  setBlockContent,
  setBlockStyle,
  placedIds,
  type BuilderLayout,
} from '@/lib/entity-blocks/rows-ops'
import type { BlockStyle } from '@/lib/entity-blocks/block-content'
import { getMemberLayoutRailData } from '@/app/(main)/settings/rail-getters'
import { getSpaceLayoutRailData } from '@/app/(main)/spaces/[slug]/manage/rail-getters'
import { useProfileLayout } from './profile-layout-context'
import { BlockPicker } from './block-picker'
import { BlockEditPanel } from './block-edit-panel'

// THE IN-RAIL ENTITY PAGE BUILDER (ADR-516 Phase C member; Phase D generalized to Space; ADR-526 split the
// two kinds). An OUTLINE editor, not a mini-canvas: the live profile/space page behind this same-route
// slide-over is the WYSIWYG surface (LiveProfileGrid). Everything edits the SHARED entity-layout store, so a
// change repaints the page instantly and persists debounced.
//
// ONE component, TWO shapes keyed off maxColumnsForKind(kind):
//   • MEMBER (max 1 column) — a simple single-column BLOCK LIST (ADR-526 P1). No layout editor: no column
//     control, no rows, no ratio. Each block is a strip with on/off, up/down, and a remove-to-bench control;
//     an "Add block" picker appends one; a Bench tray holds the rest. The member profile is always a stacked
//     list, so the chrome (header image, identity, Standing card) owns the frame and the list owns content.
//   • SPACE (max 2 columns) — the freeform ROWS editor (ADR-526 P2): collapsible row strips with a drag
//     handle, a [1][2] column control, a 50/50 · 66/33 ratio toggle on a 2-column row, a collapse chevron
//     and a row menu; each column slot is a pill holding a block (its own control cluster) or a "+ Add
//     block" picker. A Bench tray holds the blocks not shown.
//
// Reorder is available THREE ways — drag, up/down arrows, and a "Move to" menu — with a real keyboard grab +
// aria-live pattern (the primary touch / AT path). Guards on the store's `kind` so it never seeds the wrong
// store. Space blocks locked behind a function the space lacks are held out of the picker + bench
// (lockedIds). Semantic DAWN tokens, no hex, voice canon (no em dashes).

const label = (id: string): string => entityBlockById(id)?.label ?? id

type Grab = { kind: 'row'; id: string } | { kind: 'block'; id: string } | null

/** The serializable seed the builder self-fetches: the resolved rows + hidden set, whether the surface has
 *  ever been customized, the owner-match id (the page it may edit), and any function-locked block ids. */
export interface BuilderRailData {
  matchId: string | null
  rows: RowDef[]
  hidden: string[]
  customized: boolean
  lockedIds?: string[]
}

export function EntityPageBuilder({
  pageId,
  kind,
  loadRailData,
  editHrefFor,
}: {
  /** The page this builder edits (member handle / space slug); guarded against the seed's matchId. */
  pageId: string
  kind: EntityKind
  /** Read-gated seed loader; returns null when the viewer cannot edit (fail-safe → renders nothing). */
  loadRailData: () => Promise<BuilderRailData | null>
  /** For a DATA block, the href of that feature's own manager (the edit panel's "Manage" link). */
  editHrefFor?: (blockId: string) => string | null
}) {
  const store = useProfileLayout()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [lockedIds, setLockedIds] = useState<string[]>([])
  const [customized, setCustomized] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [addingAt, setAddingAt] = useState<{ rowId: string; col: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [grab, setGrab] = useState<Grab>(null)
  const [announce, setAnnounce] = useState('')

  const dragBlock = useRef<string | null>(null)
  const dragRow = useRef<string | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Content / style edits change what a block RENDERS (not just where it sits), so the server-rendered
  // live-preview nodes need to re-render. Debounce a router.refresh past the store's save window so the
  // preview reconciles after the edit persists (structural edits stay instant and never refresh).
  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), 900)
  }, [router])
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }, [])

  // Seed the shared store from the persisted layout (idempotent — the live preview may have seeded first).
  // Only seed a store of the SAME kind, so a builder mounted beside the wrong provider never pollutes it.
  useEffect(() => {
    let active = true
    loadRailData().then((d) => {
      if (!active) return
      setMatchId(d?.matchId ?? null)
      setLockedIds(d?.lockedIds ?? [])
      setCustomized(!!d?.customized)
      if (d && store?.kind === kind) store.seed(d.rows, d.hidden)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [store, kind, loadRailData])

  const say = useCallback((msg: string) => setAnnounce(msg), [])
  const mutate = useCallback(
    (next: BuilderLayout) => {
      store?.apply(next)
      setCustomized(true)
    },
    [store],
  )

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  // Owner + kind gate: the builder edits THIS page's layout, so it mounts only on the page whose match id
  // the read-gated seed returned (your own /people/<handle>, or a Space you manage), and only against a
  // store of its own kind (fail-safe: a non-owner / wrong-kind store renders nothing).
  if (!store || store.kind !== kind || !matchId || matchId !== pageId) return null

  const maxColumns = maxColumnsForKind(kind)
  const lockedSet = new Set(lockedIds)
  const palette = blocksForKind(kind).filter((b) => !lockedSet.has(b.id))
  const layout: BuilderLayout = {
    rows: store.rows,
    hidden: store.hidden,
    content: store.content,
    style: store.style,
  }
  // The derived bench, minus any function-locked block the space cannot offer yet (never on the page).
  const bench = store.bench.filter((id) => !lockedSet.has(id))
  const placed = placedIds(layout.rows)

  // Every empty slot, as a move target (reading order) — powers the "Move to" menus + bench "Place in".
  const emptySlots = layout.rows.flatMap((r, ri) =>
    r.slots.flatMap((id, ci) => (id === null ? [{ rowId: r.id, ri, ci }] : [])),
  )

  // ── Row actions ──
  function onAddRow(at?: number) {
    mutate(addRow(layout, at))
    say('Row added.')
  }
  function onRemoveRow(rowId: string, index: number) {
    mutate(removeRow(layout, rowId))
    say(`Row ${index + 1} removed. Its blocks moved to the bench.`)
    setOpenMenu(null)
  }
  function onMoveRow(from: number, to: number) {
    if (to < 0 || to >= layout.rows.length || to === from) return
    mutate(moveRow(layout, from, to))
    say(`Row moved to position ${to + 1} of ${layout.rows.length}.`)
  }
  function onSetColumns(rowId: string, n: 1 | 2 | 3 | 4) {
    mutate(setRowColumns(layout, rowId, n))
    say(`Row set to ${n} ${n === 1 ? 'column' : 'columns'}.`)
  }
  function onSetRatio(rowId: string, ratio: RowRatio) {
    mutate(setRowRatio(layout, rowId, ratio))
    say(ratio === 'lead' ? 'Row split to two thirds and one third.' : 'Row split evenly.')
  }

  // ── Block actions ──
  function onPlace(blockId: string, rowId: string, col: number) {
    mutate(placeBlock(layout, blockId, rowId, col))
    say(`${label(blockId)} placed.`)
    setAddingAt(null)
    setOpenMenu(null)
  }
  function onBench(blockId: string) {
    mutate(benchBlock(layout, blockId))
    say(`${label(blockId)} moved to the bench.`)
    setOpenMenu(null)
  }
  function onToggleHide(blockId: string) {
    const hidden = layout.hidden.includes(blockId)
    mutate(hidden ? unhideBlock(layout, blockId) : hideBlock(layout, blockId))
    say(`${label(blockId)} ${hidden ? 'shown' : 'hidden'}.`)
    setOpenMenu(null)
  }
  // Content / style edits (ADR-528): persist + refresh the preview (the block's render changes).
  function onEditContent(blockId: string, props: Record<string, unknown>) {
    mutate(setBlockContent(layout, blockId, Object.keys(props).length ? props : undefined))
    refreshSoon()
  }
  function onEditStyle(blockId: string, style: BlockStyle) {
    mutate(setBlockStyle(layout, blockId, Object.keys(style).length ? style : undefined))
    refreshSoon()
  }
  function onDelete(blockId: string) {
    mutate(removeBlock(layout, blockId))
    say(`${label(blockId)} removed.`)
    setConfirmDelete(null)
    setOpenMenu(null)
  }

  // Block up/down = swap with the previous / next slot in reading order.
  const slotSeq = layout.rows.flatMap((r) => r.slots.map((id, ci) => ({ rowId: r.id, ci, id })))
  function moveBlockBy(blockId: string, delta: -1 | 1) {
    const idx = slotSeq.findIndex((s) => s.id === blockId)
    const to = idx + delta
    if (idx < 0 || to < 0 || to >= slotSeq.length) return
    const a = slotSeq[idx]
    const b = slotSeq[to]
    mutate(swapCells(layout, a.rowId, a.ci, b.rowId, b.ci))
    say(`${label(blockId)} moved ${delta < 0 ? 'up' : 'down'}.`)
  }

  // Member (single-column list): add a block as a new 1-column row at the end. No rows UI is exposed, so
  // the member never manages rows directly — placing a block just appends its strip to the list.
  function onAddMemberBlock(blockId: string) {
    const withRow = addRow(layout)
    const newRow = withRow.rows[withRow.rows.length - 1]
    mutate(placeBlock(withRow, blockId, newRow.id, 0))
    say(`${label(blockId)} added.`)
    setAddingAt(null)
  }

  function onStarter(id: StarterId) {
    mutate({ rows: starterRows(kind, id), hidden: [] })
    say(`Started from the ${id} layout.`)
  }
  function onBlank() {
    mutate({ rows: [{ id: `r${Math.random().toString(36).slice(2, 8)}`, columns: 1, slots: [null] }], hidden: [] })
    say('Started from blank.')
  }

  // ── Drag and drop ──
  function dropOnSlot(e: DragEvent, rowId: string, col: number) {
    e.preventDefault()
    e.stopPropagation()
    const id = dragBlock.current
    dragBlock.current = null
    if (id) onPlace(id, rowId, col)
  }
  function dropOnRow(e: DragEvent, toIndex: number) {
    e.preventDefault()
    const rowId = dragRow.current
    dragRow.current = null
    if (rowId) {
      const from = layout.rows.findIndex((r) => r.id === rowId)
      if (from >= 0) onMoveRow(from, toIndex)
    }
  }

  // ── Keyboard grab (rows + blocks share the Enter-grab / arrow-move / Escape-cancel pattern) ──
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
  function blockHandleKey(e: KeyboardEvent, blockId: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (grab?.kind === 'block' && grab.id === blockId) {
        setGrab(null)
        say('Block dropped.')
      } else {
        setGrab({ kind: 'block', id: blockId })
        say(`Grabbed ${label(blockId)}. Use the arrow keys to move it, Enter to drop, Escape to cancel.`)
      }
      return
    }
    if (grab?.kind === 'block' && grab.id === blockId) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveBlockBy(blockId, -1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveBlockBy(blockId, 1)
      } else if (e.key === 'Escape') {
        setGrab(null)
        say('Move cancelled.')
      }
    }
  }

  // The inline edit panel for a block (ADR-528): content fields (content block) / on-off + quick fields +
  // manage link (data block), plus style controls. Rendered right under the block's pill when it is open.
  const editPanelFor = (id: string) =>
    editingId === id ? (
      <BlockEditPanel
        id={id}
        content={store.content[id] ?? {}}
        style={store.style[id] ?? {}}
        hidden={layout.hidden.includes(id)}
        editHref={editHrefFor?.(id) ?? null}
        onContent={(props) => onEditContent(id, props)}
        onStyle={(s) => onEditStyle(id, s)}
        onToggleHide={() => onToggleHide(id)}
      />
    ) : null

  // Starters (the wireframe seeds) are a SPACE affordance only — the member profile is a fixed single-
  // column list with no layout to seed, so it never shows them.
  const showStarters =
    maxColumns > 1 && (!customized || layout.rows.every((r) => r.slots.every((s) => s === null)))

  // The MEMBER list: the placed blocks in reading order (each is its own 1-column row). Drives the simple
  // block-list view; empty when the member has benched everything.
  const memberBlocks = layout.rows
    .map((r) => r.slots[0] ?? null)
    .filter((s): s is string => s !== null)

  // Member drag-reorder: dropping a dragged block onto another moves its row to that block's position.
  function memberDropOn(targetBlockId: string) {
    const id = dragBlock.current
    dragBlock.current = null
    if (!id || id === targetBlockId) return
    const from = layout.rows.findIndex((r) => r.slots[0] === id)
    const to = layout.rows.findIndex((r) => r.slots[0] === targetBlockId)
    if (from < 0 || to < 0) return
    mutate(moveRow(layout, from, to))
    say(`${label(id)} moved.`)
  }

  const header = (
    <header className="flex items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold text-text">Your page</h3>
        <p className="text-xs text-muted">
          {maxColumns > 1
            ? 'Arrange the blocks on your page into rows and columns. Changes save on their own.'
            : 'Turn blocks on or off and set their order. Changes save on their own.'}
        </p>
      </div>
      {store.saving ? (
        <span className="flex items-center gap-1 text-2xs text-subtle">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving
        </span>
      ) : (
        <span className="flex items-center gap-1 text-2xs text-subtle">
          <Check className="h-3 w-3 text-success" aria-hidden /> Saved
        </span>
      )}
    </header>
  )

  return (
    <section className="min-w-0 space-y-3" aria-label="Profile page builder">
      {/* Live region — reorder + placement announcements (the primary AT path). */}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {header}

      {store.error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger" role="alert">
          {store.error}
        </p>
      )}

      {/* Starters — schematic wireframe thumbnails, shown on a default / empty layout (no lock). */}
      {showStarters && (
        <div className="space-y-2 rounded-2xl border border-border bg-surface-elevated/40 p-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Start with a layout</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(STARTER_LAYOUTS[kind]) as StarterId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onStarter(id)}
                className="group rounded-lg border border-border bg-surface p-1.5 text-left transition-colors hover:border-primary"
              >
                <StarterThumb rows={STARTER_LAYOUTS[kind][id]} />
                <span className="mt-1 block text-center text-2xs font-medium capitalize text-muted group-hover:text-text">
                  {id}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onBlank}
            className="text-xs font-medium text-primary-strong hover:underline"
          >
            Start from blank
          </button>
        </div>
      )}

      {/* MEMBER (single-column block LIST, ADR-526 P1): no rows, no columns. Each placed block is a strip
          with on/off + up/down + a menu; an "Add block" row appends an unplaced one. */}
      {maxColumns === 1 && (
        <div className="space-y-3">
          {memberBlocks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
              No blocks on your page yet. Add one below.
            </p>
          ) : (
            <ol className="space-y-2">
              {memberBlocks.map((id, index) => (
                <li
                  key={id}
                  onDragOver={(e) => dragBlock.current && e.preventDefault()}
                  onDrop={() => memberDropOn(id)}
                >
                  <BlockPill
                    id={id}
                    hidden={layout.hidden.includes(id)}
                    grabbed={grab?.kind === 'block' && grab.id === id}
                    menuOpen={openMenu === `block:${id}`}
                    editing={editingId === id}
                    canUp={index > 0}
                    canDown={index < memberBlocks.length - 1}
                    emptySlots={[]}
                    confirmDelete={confirmDelete === id}
                    onDragStart={() => (dragBlock.current = id)}
                    onDragEnd={() => (dragBlock.current = null)}
                    onHandleKey={(e) => blockHandleKey(e, id)}
                    onEdit={() => setEditingId((m) => (m === id ? null : id))}
                    onUp={() => moveBlockBy(id, -1)}
                    onDown={() => moveBlockBy(id, 1)}
                    onToggleMenu={() => setOpenMenu((m) => (m === `block:${id}` ? null : `block:${id}`))}
                    onMoveTo={() => {}}
                    onToggleHide={() => onToggleHide(id)}
                    onBench={() => onBench(id)}
                    onAskDelete={() => setConfirmDelete(id)}
                    onCancelDelete={() => setConfirmDelete(null)}
                    onConfirmDelete={() => onDelete(id)}
                  />
                  {editPanelFor(id)}
                </li>
              ))}
            </ol>
          )}

          {bench.length > 0 && (
            <section
              aria-label="Add a block"
              className="space-y-2 rounded-2xl border border-border bg-surface-elevated/40 p-2"
            >
              <p className="px-1 text-2xs font-semibold uppercase tracking-wide text-subtle">Add a block</p>
              <ul className="flex flex-wrap gap-1.5">
                {bench.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onAddMemberBlock(id)}
                      className="flex items-center gap-1 rounded-full border border-dashed border-border bg-surface px-2.5 py-1 text-2xs font-semibold text-text transition-colors hover:border-primary hover:text-primary-strong"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden /> {label(id)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* SPACE (rows + up-to-2 columns, ADR-526 P2): the freeform rows editor. */}
      {maxColumns > 1 && (
        <>
      {/* The rows outline. */}
      <ol className="space-y-2">
        {layout.rows.map((row, index) => {
          const isCollapsed = collapsed.has(row.id)
          const grabbed = grab?.kind === 'row' && grab.id === row.id
          return (
            <li
              key={row.id}
              onDragOver={(e) => dragRow.current && e.preventDefault()}
              onDrop={(e) => dropOnRow(e, index)}
              className={`rounded-2xl border bg-surface ${grabbed ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
            >
              {/* Row strip */}
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button
                  type="button"
                  draggable
                  onDragStart={() => (dragRow.current = row.id)}
                  onDragEnd={() => (dragRow.current = null)}
                  onKeyDown={(e) => rowHandleKey(e, row.id, index)}
                  aria-label={`Reorder row ${index + 1}. Press Enter to grab, then use the arrow keys.`}
                  aria-pressed={grabbed}
                  className="shrink-0 cursor-grab rounded p-1 text-subtle hover:bg-surface-elevated hover:text-text"
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

                {/* Segmented column-count control (capped at the kind's max: space = [1][2]). */}
                <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label={`Columns for row ${index + 1}`}>
                  {Array.from({ length: maxColumns }, (_, i) => (i + 1) as RowColumns).map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={row.columns === n}
                      onClick={() => onSetColumns(row.id, n)}
                      className={`px-1.5 py-0.5 text-2xs font-semibold ${
                        row.columns === n ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-surface-elevated'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                {/* Split control (2-column rows only): 1/2 even, or a 2/3 lead column on either side. */}
                {row.columns === 2 && (
                  <div
                    className="flex overflow-hidden rounded-md border border-border"
                    role="group"
                    aria-label={`Column split for row ${index + 1}`}
                  >
                    {(
                      [
                        { r: 'even' as const, label: '1/2', aria: 'Even halves' },
                        { r: 'lead' as const, label: '2/3', aria: 'Two thirds, then one third' },
                        { r: 'trail' as const, label: '1/3', aria: 'One third, then two thirds' },
                      ]
                    ).map(({ r, label: lbl, aria }) => {
                      const active = r === 'even' ? row.ratio !== 'lead' && row.ratio !== 'trail' : row.ratio === r
                      return (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={active}
                          aria-label={`${aria} for row ${index + 1}`}
                          onClick={() => onSetRatio(row.id, r)}
                          className={`px-1.5 py-0.5 text-2xs font-semibold ${
                            active ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-surface-elevated'
                          }`}
                        >
                          {lbl}
                        </button>
                      )
                    })}
                  </div>
                )}

                <span className="min-w-0 flex-1 truncate px-1 text-2xs text-subtle">
                  Row {index + 1}
                </span>

                {/* Row up/down */}
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

                {/* Row menu */}
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
                      <MenuItem onClick={() => onRemoveRow(row.id, index)} danger>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete row
                      </MenuItem>
                      <p className="px-2.5 pt-1.5 text-3xs font-semibold uppercase tracking-wide text-subtle">Move to position</p>
                      <div className="flex flex-wrap gap-1 px-2 pb-1.5 pt-1">
                        {layout.rows.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            disabled={i === index}
                            onClick={() => {
                              onMoveRow(index, i)
                              setOpenMenu(null)
                            }}
                            className="h-6 w-6 rounded border border-border text-2xs font-semibold text-muted hover:border-primary hover:text-text disabled:opacity-30"
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    </Menu>
                  )}
                </div>
              </div>

              {/* Slots */}
              {!isCollapsed && (
                <div className={`grid gap-1.5 px-2 pb-2 ${row.columns > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {row.slots.map((id, col) => (
                    <div
                      key={`${row.id}-${col}`}
                      onDragOver={(e) => dragBlock.current && id === null && e.preventDefault()}
                      onDrop={(e) => id === null && dropOnSlot(e, row.id, col)}
                    >
                      {id ? (
                        <>
                          <BlockPill
                            id={id}
                            hidden={layout.hidden.includes(id)}
                            grabbed={grab?.kind === 'block' && grab.id === id}
                            menuOpen={openMenu === `block:${id}`}
                            editing={editingId === id}
                            canUp={slotSeq.findIndex((s) => s.id === id) > 0}
                            canDown={slotSeq.findIndex((s) => s.id === id) < slotSeq.length - 1}
                            emptySlots={emptySlots}
                            confirmDelete={confirmDelete === id}
                            onDragStart={() => (dragBlock.current = id)}
                            onDragEnd={() => (dragBlock.current = null)}
                            onHandleKey={(e) => blockHandleKey(e, id)}
                            onEdit={() => setEditingId((m) => (m === id ? null : id))}
                            onUp={() => moveBlockBy(id, -1)}
                            onDown={() => moveBlockBy(id, 1)}
                            onToggleMenu={() => setOpenMenu((m) => (m === `block:${id}` ? null : `block:${id}`))}
                            onMoveTo={(t) => onPlace(id, t.rowId, t.ci)}
                            onToggleHide={() => onToggleHide(id)}
                            onBench={() => onBench(id)}
                            onAskDelete={() => setConfirmDelete(id)}
                            onCancelDelete={() => setConfirmDelete(null)}
                            onConfirmDelete={() => onDelete(id)}
                          />
                          {editPanelFor(id)}
                        </>
                      ) : addingAt && addingAt.rowId === row.id && addingAt.col === col ? (
                        <BlockPicker
                          palette={palette}
                          taken={new Set([...placed, ...layout.hidden])}
                          onPick={(bid) => onPlace(bid, row.id, col)}
                          onClose={() => setAddingAt(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingAt({ rowId: row.id, col })}
                          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border px-2 py-3 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-text"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden /> Add block
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Inline add-row on hover between rows. */}
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={() => onAddRow(index + 1)}
                  aria-label={`Add a row after row ${index + 1}`}
                  className="rounded-full p-0.5 text-subtle opacity-0 transition-opacity hover:bg-surface-elevated hover:text-text focus:opacity-100 group-hover:opacity-100"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </li>
          )
        })}
      </ol>

      {/* Persistent add-row */}
      <button
        type="button"
        onClick={() => onAddRow()}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add row
      </button>

      {/* Bench tray */}
      <Bench
        bench={bench}
        emptySlots={emptySlots}
        openMenu={openMenu}
        onToggleMenu={(id) => setOpenMenu((m) => (m === `bench:${id}` ? null : `bench:${id}`))}
        onDragStart={(id) => (dragBlock.current = id)}
        onDragEnd={() => (dragBlock.current = null)}
        onPlace={(id, t) => onPlace(id, t.rowId, t.ci)}
      />
        </>
      )}
    </section>
  )
}

/** The MEMBER page builder — the caller's own /people/<handle> layout. Kept as the Phase C export name so
 *  the personal Layout rail module + its wiring are unchanged; it adapts the member seed getter into the
 *  generic shape (matchId = the handle). The chrome-owned blocks (about/stats, ADR-522) are locked out of
 *  the palette + bench so a member cannot add a duplicate of the bio / Standing card the profile already
 *  renders. */
export function ProfilePageBuilder({ pageHandle }: { pageHandle: string }) {
  const load = useCallback(async (): Promise<BuilderRailData | null> => {
    const d = await getMemberLayoutRailData()
    return d
      ? { matchId: d.handle, rows: d.rows, hidden: d.hidden, customized: d.customized, lockedIds: [...MEMBER_CHROME_BLOCK_IDS] }
      : null
  }, [])
  return <EntityPageBuilder pageId={pageHandle} kind="member" loadRailData={load} />
}

/** The SPACE page builder — a Space's public-profile layout, mounted in the `space.layout` rail surface on
 *  the Space profile ROOT (ADR-516 Phase D). Adapts the owner-gated space seed getter (matchId = the slug;
 *  function-locked blocks are held out of the picker + bench). */
export function SpacePageBuilder({ slug }: { slug: string }) {
  const load = useCallback(async (): Promise<BuilderRailData | null> => {
    const d = await getSpaceLayoutRailData(slug)
    return d
      ? { matchId: d.slug, rows: d.rows, hidden: d.hidden, customized: d.customized, lockedIds: d.lockedIds }
      : null
  }, [slug])
  return (
    <EntityPageBuilder
      pageId={slug}
      kind="space"
      loadRailData={load}
      // A DATA block's "Manage" link points at the Space management console, where every feature's own
      // editor lives (deep content stays in that manager; the rail edits arrangement + quick fields).
      editHrefFor={(blockId) => (entityBlockById(blockId)?.category === 'data' ? `/spaces/${slug}/manage` : null)}
    />
  )
}

// ── The per-block control cluster ──
function BlockPill({
  id,
  hidden,
  grabbed,
  menuOpen,
  editing,
  canUp,
  canDown,
  emptySlots,
  confirmDelete,
  onDragStart,
  onDragEnd,
  onHandleKey,
  onEdit,
  onUp,
  onDown,
  onToggleMenu,
  onMoveTo,
  onToggleHide,
  onBench,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  id: string
  hidden: boolean
  grabbed: boolean
  menuOpen: boolean
  editing: boolean
  canUp: boolean
  canDown: boolean
  emptySlots: { rowId: string; ri: number; ci: number }[]
  confirmDelete: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onHandleKey: (e: KeyboardEvent) => void
  onEdit: () => void
  onUp: () => void
  onDown: () => void
  onToggleMenu: () => void
  onMoveTo: (t: { rowId: string; ci: number }) => void
  onToggleHide: () => void
  onBench: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded-lg border bg-surface-elevated/60 px-1.5 py-1.5 ${
        grabbed ? 'border-primary ring-1 ring-primary' : 'border-border'
      } ${hidden ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onKeyDown={onHandleKey}
        aria-label={`Reorder ${label(id)}. Press Enter to grab, then use the arrow keys.`}
        aria-pressed={grabbed}
        className="shrink-0 cursor-grab rounded p-0.5 text-subtle hover:text-text"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      {/* The label is a button: clicking a block opens its inline EDIT panel (content + style). */}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${label(id)}`}
        aria-expanded={editing}
        className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-text transition-colors hover:text-primary-strong"
      >
        {label(id)}
        {hidden && <span className="ml-1 text-2xs font-normal text-subtle">(hidden)</span>}
      </button>
      <button
        type="button"
        aria-label={`Move ${label(id)} up`}
        disabled={!canUp}
        onClick={onUp}
        className="shrink-0 rounded p-0.5 text-subtle hover:text-text disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Move ${label(id)} down`}
        disabled={!canDown}
        onClick={onDown}
        className="shrink-0 rounded p-0.5 text-subtle hover:text-text disabled:opacity-30"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label={`${label(id)} menu`}
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
          className="rounded p-0.5 text-subtle hover:text-text"
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
        </button>
        {menuOpen && (
          <Menu>
            {confirmDelete ? (
              <div className="px-2.5 py-2">
                <p className="mb-1.5 text-xs text-text">Remove {label(id)} for good?</p>
                <div className="flex gap-1.5">
                  <button type="button" onClick={onConfirmDelete} className="rounded-md bg-danger px-2 py-1 text-2xs font-semibold text-on-primary">
                    Remove
                  </button>
                  <button type="button" onClick={onCancelDelete} className="rounded-md border border-border px-2 py-1 text-2xs font-medium text-muted">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {emptySlots.length > 0 && (
                  <>
                    <p className="px-2.5 pt-1.5 text-3xs font-semibold uppercase tracking-wide text-subtle">Move to</p>
                    {emptySlots.map((t) => (
                      <MenuItem key={`${t.rowId}-${t.ci}`} onClick={() => onMoveTo(t)}>
                        <MoveRight className="h-3.5 w-3.5" aria-hidden /> Row {t.ri + 1}, column {t.ci + 1}
                      </MenuItem>
                    ))}
                  </>
                )}
                <MenuItem onClick={onToggleHide}>
                  {hidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
                  {hidden ? 'Show' : 'Hide'}
                </MenuItem>
                <MenuItem onClick={onBench}>
                  <Inbox className="h-3.5 w-3.5" aria-hidden /> Move to bench
                </MenuItem>
                <MenuItem onClick={onAskDelete} danger>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>
    </div>
  )
}

// ── The Bench tray ──
function Bench({
  bench,
  emptySlots,
  openMenu,
  onToggleMenu,
  onDragStart,
  onDragEnd,
  onPlace,
}: {
  bench: string[]
  emptySlots: { rowId: string; ri: number; ci: number }[]
  openMenu: string | null
  onToggleMenu: (id: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onPlace: (id: string, t: { rowId: string; ci: number }) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-2xl border border-border bg-surface-elevated/40 p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-1 py-0.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text">
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          Bench (not shown)
          <span className="rounded-full bg-surface px-1.5 py-0.5 text-3xs font-semibold text-muted">{bench.length}</span>
        </span>
      </button>
      {open && (
        <div className="mt-1.5">
          {bench.length === 0 ? (
            <p className="px-1 py-1 text-2xs text-muted">Every block is on your page.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {bench.map((id) => (
                <div key={id} className="relative">
                  <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1">
                    <button
                      type="button"
                      draggable
                      onDragStart={() => onDragStart(id)}
                      onDragEnd={onDragEnd}
                      aria-label={`Drag ${label(id)} onto an empty slot`}
                      className="cursor-grab text-subtle hover:text-text"
                    >
                      <GripVertical className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span className="text-2xs font-semibold text-text">{label(id)}</span>
                    <button
                      type="button"
                      aria-label={`Place ${label(id)}`}
                      aria-expanded={openMenu === `bench:${id}`}
                      onClick={() => onToggleMenu(id)}
                      className="text-subtle hover:text-text"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  {openMenu === `bench:${id}` && (
                    <Menu>
                      <p className="px-2.5 pt-1.5 text-3xs font-semibold uppercase tracking-wide text-subtle">Place in</p>
                      {emptySlots.length === 0 ? (
                        <p className="px-2.5 py-1.5 text-2xs text-muted">No empty slots. Add a row or widen one.</p>
                      ) : (
                        emptySlots.map((t) => (
                          <MenuItem key={`${t.rowId}-${t.ci}`} onClick={() => onPlace(id, t)}>
                            <MoveRight className="h-3.5 w-3.5" aria-hidden /> Row {t.ri + 1}, column {t.ci + 1}
                          </MenuItem>
                        ))
                      )}
                    </Menu>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Small primitives ──
function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-0 z-20 mt-1 min-w-44 rounded-xl border border-border bg-surface p-1 shadow-lg">
      {children}
    </div>
  )
}
function MenuItem({ children, onClick, danger = false }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
        danger ? 'text-danger hover:bg-danger-bg' : 'text-text hover:bg-surface-elevated'
      }`}
    >
      {children}
    </button>
  )
}

/** A schematic wireframe of a starter layout: each row a strip, split into its column count. */
function StarterThumb({ rows }: { rows: readonly RowDef[] }) {
  return (
    <div className="flex flex-col gap-0.5" aria-hidden>
      {rows.map((row) => (
        <div key={row.id} className="flex gap-0.5">
          {Array.from({ length: row.columns }).map((_, i) => (
            <div key={i} className="h-2 flex-1 rounded-sm bg-primary/30" />
          ))}
        </div>
      ))}
    </div>
  )
}

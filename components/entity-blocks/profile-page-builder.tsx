'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
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
import { blocksForKind, entityBlockById, type EntityBlockDef } from '@/lib/entity-blocks/registry'
import {
  starterRows,
  STARTER_LAYOUTS,
  type RowDef,
  type StarterId,
} from '@/lib/entity-blocks/layout'
import {
  addRow,
  removeRow,
  moveRow,
  setRowColumns,
  placeBlock,
  benchBlock,
  hideBlock,
  unhideBlock,
  removeBlock,
  swapCells,
  placedIds,
  type BuilderLayout,
} from '@/lib/entity-blocks/rows-ops'
import { getMemberLayoutRailData } from '@/app/(main)/settings/rail-getters'
import { useProfileLayout } from './profile-layout-context'
import { BlockPicker } from './block-picker'

// THE IN-RAIL PROFILE PAGE BUILDER (ADR-516 Phase C). An OUTLINE editor, not a mini-canvas: the live
// profile page behind this same-route slide-over is the WYSIWYG surface (LiveProfileGrid). Rows are
// collapsible strips with a drag handle, a [1][2][3][4] column control, a collapse chevron and a row menu;
// each column slot is a pill holding a block (with its own control cluster) or a "+ Add block" picker. A
// Bench tray holds the blocks not shown. Everything edits the SHARED ProfileLayoutContext, so a change
// repaints the page instantly and persists debounced. Reorder is available THREE ways — drag, up/down
// arrows, and a "Move to" menu — with a real keyboard grab + aria-live pattern (the primary touch / AT
// path). Member-only this phase. Semantic DAWN tokens, no hex, voice canon (no em dashes).

const label = (id: string): string => entityBlockById(id)?.label ?? id

type Grab = { kind: 'row'; id: string } | { kind: 'block'; id: string } | null

export function ProfilePageBuilder({ pageHandle }: { pageHandle: string }) {
  const store = useProfileLayout()
  const palette = useMemo<EntityBlockDef[]>(() => blocksForKind('member'), [])

  const [loading, setLoading] = useState(true)
  const [ownHandle, setOwnHandle] = useState<string | null>(null)
  const [customized, setCustomized] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [addingAt, setAddingAt] = useState<{ rowId: string; col: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [grab, setGrab] = useState<Grab>(null)
  const [announce, setAnnounce] = useState('')

  const dragBlock = useRef<string | null>(null)
  const dragRow = useRef<string | null>(null)

  // Seed the shared store from the persisted layout (idempotent — the live preview may have seeded first).
  useEffect(() => {
    let active = true
    getMemberLayoutRailData().then((d) => {
      if (!active) return
      setOwnHandle(d?.handle ?? null)
      setCustomized(!!d?.customized)
      if (d) store?.seed(d.rows, d.hidden)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [store])

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
  // Own profile only: the builder edits YOUR page, so it belongs on your own /people/<handle> (fail-safe).
  if (!store || !ownHandle || ownHandle !== pageHandle) return null

  const layout: BuilderLayout = { rows: store.rows, hidden: store.hidden }
  const bench = store.bench
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

  function onStarter(id: StarterId) {
    mutate({ rows: starterRows('member', id), hidden: [] })
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

  const showStarters = !customized || layout.rows.every((r) => r.slots.every((s) => s === null))

  return (
    <section className="min-w-0 space-y-3" aria-label="Profile page builder">
      {/* Live region — reorder + placement announcements (the primary AT path). */}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-text">Your page</h3>
          <p className="text-xs text-muted">Arrange the blocks on your profile. Changes save on their own.</p>
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
            {(Object.keys(STARTER_LAYOUTS.member) as StarterId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onStarter(id)}
                className="group rounded-lg border border-border bg-surface p-1.5 text-left transition-colors hover:border-primary"
              >
                <StarterThumb rows={STARTER_LAYOUTS.member[id]} />
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

                {/* Segmented column-count control */}
                <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label={`Columns for row ${index + 1}`}>
                  {([1, 2, 3, 4] as const).map((n) => (
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
                        <BlockPill
                          id={id}
                          hidden={layout.hidden.includes(id)}
                          grabbed={grab?.kind === 'block' && grab.id === id}
                          menuOpen={openMenu === `block:${id}`}
                          canUp={slotSeq.findIndex((s) => s.id === id) > 0}
                          canDown={slotSeq.findIndex((s) => s.id === id) < slotSeq.length - 1}
                          emptySlots={emptySlots}
                          confirmDelete={confirmDelete === id}
                          onDragStart={() => (dragBlock.current = id)}
                          onDragEnd={() => (dragBlock.current = null)}
                          onHandleKey={(e) => blockHandleKey(e, id)}
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
    </section>
  )
}

// ── The per-block control cluster ──
function BlockPill({
  id,
  hidden,
  grabbed,
  menuOpen,
  canUp,
  canDown,
  emptySlots,
  confirmDelete,
  onDragStart,
  onDragEnd,
  onHandleKey,
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
  canUp: boolean
  canDown: boolean
  emptySlots: { rowId: string; ri: number; ci: number }[]
  confirmDelete: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onHandleKey: (e: KeyboardEvent) => void
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
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text">
        {label(id)}
        {hidden && <span className="ml-1 text-2xs font-normal text-subtle">(hidden)</span>}
      </span>
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

'use client'

import { useState, type ReactNode } from 'react'
import {
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Check,
  Loader2,
} from 'lucide-react'
import { profilePaletteForKind, entityBlockById } from '@/lib/entity-blocks/registry'
import type { RowDef } from '@/lib/entity-blocks/layout'
import type { BlockStyle } from '@/lib/entity-blocks/block-content'
import {
  addRow,
  removeRow,
  moveRow,
  setRowColumns,
  setRowRatio,
  placeBlock,
  nudgeBox,
  hideBlock,
  unhideBlock,
  removeBlock,
  setBlockContent,
  setBlockStyle,
  placedIds,
  type BuilderLayout,
} from '@/lib/entity-blocks/rows-ops'
import { canMoveBoxDown, canMoveBoxUp } from '@/lib/entity-blocks/box-position'
import { useProfileLayout } from './profile-layout-context'
import { BlockPicker } from './block-picker'
import { BlockEditPanel } from './block-edit-panel'

// THE ON-PAGE WYSIWYG SPACE EDITOR (ADR-542). The owner builds their space page RIGHT WHERE THEY SEE IT:
// this overlays large, obvious editing chrome on the live LiveProfileGrid, driven by the shared entity-
// layout store (useProfileLayout). Every edit calls `apply(op(currentLayout, ...))` — the store repaints
// the page instantly and saves debounced (server-sanitized), so the page rearranges as blocks move.
//
// Structure mirrors the render geometry (rows → columns → a STACK of boxes), with chrome per level:
//   • ROW: a control bar to pick the layout (1 column / 2 equal / Main + Side — with tiny visual diagrams),
//     reorder the row (up / down), and delete it.
//   • COLUMN: an "Add block" button at the foot of each stack, opening the curated space palette.
//   • BOX: a hover toolbar to move the block up / down within its column, show / hide it, edit its content
//     and style, or remove it. Its inline edit panel opens under the block.
// Only the OWNER ever sees this (LiveProfileGrid renders it solely when `editable`, and the space live
// preview is owner-gated). The visitor render is untouched. Semantic DAWN tokens, no hex, voice canon.

/** The 2-column split class (space max is 2 columns): even 50/50, `lead` = Main/Side (66/33). Stacks on
 *  mobile. Mirrors entity-grid's columnsClass for the two-column case. */
function columnsClass(columns: number, ratio: string | undefined): string {
  if (columns === 2) return ratio === 'lead' || ratio === 'trail' ? 'sm:grid-cols-[2fr_1fr]' : 'sm:grid-cols-2'
  return ''
}

/** The three layout choices the owner picks from, each with a small diagram. Collapses "column count" and
 *  "split" into ONE legible control so there is never a hidden second step to reason about. */
type LayoutChoice = 'one' | 'even' | 'lead'

function layoutChoiceOf(row: RowDef): LayoutChoice {
  if (row.columns === 1) return 'one'
  return row.ratio === 'lead' || row.ratio === 'trail' ? 'lead' : 'even'
}

/** The admin-area path for a Space DATA block (mirrors the rail builder's map) — the edit panel's "Manage"
 *  link points a data block at its own manager. A content block gets none. */
const SPACE_BLOCK_ADMIN_PATH: Record<string, string> = {
  about: 'settings/basics',
  contact: 'settings/basics',
  reviews: 'settings/basics',
  offerings: 'settings/offerings',
  booking: 'settings/availability',
  team: 'settings/members',
}
function spaceBlockAdminHref(slug: string, blockId: string): string | null {
  const path = SPACE_BLOCK_ADMIN_PATH[blockId]
  if (path) return `/spaces/${slug}/${path}`
  return entityBlockById(blockId)?.category === 'data' ? `/spaces/${slug}/manage` : null
}

const label = (id: string): string => entityBlockById(id)?.label ?? id

export function OnPageEditor({
  renderBlock,
  slug,
  lockedIds = [],
}: {
  /** Render the real, styled block node by id (the WYSIWYG body under the chrome). */
  renderBlock: (blockId: string) => ReactNode
  /** The space slug — builds each data block's "Manage" deep-link in the edit panel. */
  slug: string
  /** Block ids the space cannot offer yet (a function is off) — held out of the Add-block palette. */
  lockedIds?: string[]
}) {
  const store = useProfileLayout()
  const [addingAt, setAddingAt] = useState<{ rowId: string; col: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')

  if (!store) return null

  const layout: BuilderLayout = {
    rows: store.rows,
    hidden: store.hidden,
    content: store.content,
    style: store.style,
  }
  const say = (m: string) => setAnnounce(m)
  const mutate = (next: BuilderLayout) => store.apply(next)

  const lockedSet = new Set(lockedIds)
  const palette = profilePaletteForKind('space').filter((b) => !lockedSet.has(b.id))
  const placed = placedIds(layout.rows)
  const taken = new Set<string>([...placed, ...layout.hidden])

  // ── Row layout picker ──
  function onChooseLayout(rowId: string, choice: LayoutChoice) {
    if (choice === 'one') {
      mutate(setRowColumns(layout, rowId, 1))
      say('Row set to one column.')
      return
    }
    // Widen to two columns first, then set the split.
    const two = setRowColumns(layout, rowId, 2)
    mutate(setRowRatio(two, rowId, choice === 'lead' ? 'lead' : 'even'))
    say(choice === 'lead' ? 'Row set to a main and side column.' : 'Row set to two equal columns.')
  }
  function onMoveRow(from: number, to: number) {
    if (to < 0 || to >= layout.rows.length || to === from) return
    mutate(moveRow(layout, from, to))
    say(`Row moved to position ${to + 1} of ${layout.rows.length}.`)
  }
  function onDeleteRow(rowId: string, index: number) {
    mutate(removeRow(layout, rowId))
    say(`Row ${index + 1} removed.`)
  }
  function onAddRow() {
    mutate(addRow(layout))
    say('Row added.')
  }

  // ── Box actions ──
  function onPlace(blockId: string, rowId: string, col: number) {
    mutate(placeBlock(layout, blockId, rowId, col))
    say(`${label(blockId)} added.`)
    setAddingAt(null)
  }
  function onNudge(blockId: string, delta: -1 | 1) {
    mutate(nudgeBox(layout, blockId, delta))
    say(`${label(blockId)} moved ${delta < 0 ? 'up' : 'down'}.`)
  }
  function onToggleHide(blockId: string) {
    const hidden = layout.hidden.includes(blockId)
    mutate(hidden ? unhideBlock(layout, blockId) : hideBlock(layout, blockId))
    say(`${label(blockId)} ${hidden ? 'shown' : 'hidden'}.`)
  }
  function onRemove(blockId: string) {
    mutate(removeBlock(layout, blockId))
    say(`${label(blockId)} removed.`)
    setConfirmId(null)
    setEditingId((m) => (m === blockId ? null : m))
  }
  function onEditContent(blockId: string, props: Record<string, unknown>) {
    mutate(setBlockContent(layout, blockId, Object.keys(props).length ? props : undefined))
  }
  function onEditStyle(blockId: string, style: BlockStyle) {
    mutate(setBlockStyle(layout, blockId, Object.keys(style).length ? style : undefined))
  }

  return (
    <div className="@container space-y-4" aria-label="Edit your page">
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {/* A small always-on banner so the owner knows they are editing on the page, plus the save state. */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-elevated/60 px-3 py-2">
        <p className="text-xs font-medium text-muted">
          You are editing your page. Hover any section to move, edit, or remove it.
        </p>
        {store.saving ? (
          <span className="flex shrink-0 items-center gap-1 text-2xs text-subtle">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-2xs text-subtle">
            <Check className="h-3 w-3 text-success" aria-hidden /> Saved
          </span>
        )}
      </div>

      {store.error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger" role="alert">
          {store.error}
        </p>
      )}

      {layout.rows.map((row, index) => (
        <section
          key={row.id}
          className="rounded-2xl border border-dashed border-border p-2"
          aria-label={`Row ${index + 1}`}
        >
          {/* ROW CONTROL BAR */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <LayoutPicker current={layoutChoiceOf(row)} onChoose={(c) => onChooseLayout(row.id, c)} />
            <span className="flex-1" />
            <button
              type="button"
              aria-label={`Move row ${index + 1} up`}
              disabled={index === 0}
              onClick={() => onMoveRow(index, index - 1)}
              className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Move row ${index + 1} down`}
              disabled={index === layout.rows.length - 1}
              onClick={() => onMoveRow(index, index + 1)}
              className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Delete row ${index + 1}`}
              onClick={() => onDeleteRow(row.id, index)}
              className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:bg-danger-bg hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {/* COLUMNS — each a stack of boxes + an Add block foot. */}
          <div className={`grid gap-4 ${row.columns > 1 ? `grid-cols-1 ${columnsClass(row.columns, row.ratio)}` : 'grid-cols-1'}`}>
            {row.cells.map((stack, col) => (
              <div key={`${row.id}-${col}`} className="space-y-4">
                {stack.map((id) => {
                  const hidden = layout.hidden.includes(id)
                  const isData = entityBlockById(id)?.category === 'data'
                  return (
                    <div key={id}>
                      <div className="group/box relative rounded-xl outline-2 -outline-offset-2 outline-transparent transition-[outline-color] hover:outline-primary/40">
                        {/* BOX TOOLBAR (on hover / focus within) */}
                        <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5 opacity-0 shadow-sm transition-opacity group-hover/box:pointer-events-auto group-hover/box:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
                          <BoxButton
                            label={`Move ${label(id)} up`}
                            disabled={!canMoveBoxUp(layout.rows, id)}
                            onClick={() => onNudge(id, -1)}
                          >
                            <ChevronUp className="h-4 w-4" aria-hidden />
                          </BoxButton>
                          <BoxButton
                            label={`Move ${label(id)} down`}
                            disabled={!canMoveBoxDown(layout.rows, id)}
                            onClick={() => onNudge(id, 1)}
                          >
                            <ChevronDown className="h-4 w-4" aria-hidden />
                          </BoxButton>
                          <BoxButton
                            label={hidden ? `Show ${label(id)}` : `Hide ${label(id)}`}
                            onClick={() => onToggleHide(id)}
                          >
                            {hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                          </BoxButton>
                          <BoxButton
                            label={`Edit ${label(id)}`}
                            active={editingId === id}
                            onClick={() => setEditingId((m) => (m === id ? null : id))}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </BoxButton>
                          <BoxButton
                            label={`Remove ${label(id)}`}
                            danger
                            onClick={() => setConfirmId(id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </BoxButton>
                        </div>

                        {/* The real, live block (dimmed + labelled when hidden from visitors). */}
                        <div className={hidden ? 'opacity-40' : ''}>{renderBlock(id)}</div>
                        {hidden && (
                          <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-surface px-1.5 py-0.5 text-2xs font-semibold text-subtle shadow-sm">
                            Hidden from visitors
                          </span>
                        )}
                      </div>

                      {/* Remove confirm */}
                      {confirmId === id && (
                        <div className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-surface-elevated/60 px-3 py-2">
                          <span className="flex-1 text-xs text-text">Remove {label(id)} from your page?</span>
                          <button
                            type="button"
                            onClick={() => onRemove(id)}
                            className="rounded-md bg-danger px-2.5 py-1 text-2xs font-semibold text-on-primary"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="rounded-md border border-border px-2.5 py-1 text-2xs font-medium text-muted hover:text-text"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Inline edit panel (content + style + show/hide for data blocks). */}
                      {editingId === id && (
                        <BlockEditPanel
                          id={id}
                          content={store.content[id] ?? {}}
                          style={store.style[id] ?? {}}
                          hidden={hidden}
                          editHref={isData ? spaceBlockAdminHref(slug, id) : null}
                          onContent={(props) => onEditContent(id, props)}
                          onStyle={(s) => onEditStyle(id, s)}
                          onToggleHide={() => onToggleHide(id)}
                        />
                      )}
                    </div>
                  )
                })}

                {/* ADD BLOCK at the foot of the column stack. */}
                {addingAt && addingAt.rowId === row.id && addingAt.col === col ? (
                  <BlockPicker
                    palette={palette}
                    taken={taken}
                    onPick={(bid) => onPlace(bid, row.id, col)}
                    onClose={() => setAddingAt(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingAt({ rowId: row.id, col })}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-4 text-sm font-medium text-muted transition-colors hover:border-primary hover:text-text"
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Add block
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* ADD ROW after the last row. */}
      <button
        type="button"
        onClick={onAddRow}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-4 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add row
      </button>
    </div>
  )
}

// ── The per-box toolbar button ──
function BoxButton({
  label: aria,
  onClick,
  disabled = false,
  active = false,
  danger = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-30 ${
        active
          ? 'bg-primary text-on-primary'
          : danger
            ? 'text-muted hover:bg-danger-bg hover:text-danger'
            : 'text-muted hover:bg-surface-elevated hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

// ── The legible layout picker: three choices, each a tiny visual diagram ──
function LayoutPicker({
  current,
  onChoose,
}: {
  current: LayoutChoice
  onChoose: (choice: LayoutChoice) => void
}) {
  const options: { c: LayoutChoice; label: string; diagram: ReactNode }[] = [
    { c: 'one', label: 'One column', diagram: <Diagram spans={[1]} /> },
    { c: 'even', label: 'Two equal columns', diagram: <Diagram spans={[1, 1]} /> },
    { c: 'lead', label: 'Main and side', diagram: <Diagram spans={[2, 1]} /> },
  ]
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Row layout">
      {options.map((o) => (
        <button
          key={o.c}
          type="button"
          aria-label={o.label}
          aria-pressed={current === o.c}
          title={o.label}
          onClick={() => onChoose(o.c)}
          className={`rounded-md px-2 py-1.5 transition-colors ${
            current === o.c ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated hover:text-text'
          }`}
        >
          {o.diagram}
        </button>
      ))}
    </div>
  )
}

/** A tiny schematic of a row's columns (each `span` is a flex weight), tinted to the button's text colour
 *  so it reads on both the selected (on-primary) and idle states. */
function Diagram({ spans }: { spans: number[] }) {
  return (
    <span className="flex h-3.5 w-8 items-stretch gap-0.5" aria-hidden>
      {spans.map((span, i) => (
        <span key={i} className="rounded-sm bg-current opacity-70" style={{ flexGrow: span }} />
      ))}
    </span>
  )
}

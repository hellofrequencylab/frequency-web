'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Plus, Settings2, Trash2 } from 'lucide-react'
import { entityBlockById, profilePaletteForKind } from '@/lib/entity-blocks/registry'
import { fieldsForBlock, type FieldDef } from '@/lib/entity-blocks/block-content'
import {
  addRow,
  removeRow,
  moveRow,
  setRowSplit,
  setRowTitle,
  setRowHeaderOn,
  placeBlock,
  removeBlock,
  nudgeBox,
  placedIds,
  type BuilderLayout,
  type RowSplit,
} from '@/lib/entity-blocks/rows-ops'
import { useProfileLayout } from '@/components/entity-blocks/profile-layout-context'
import { FieldEditor, type UploadImage } from '@/components/entity-blocks/block-edit-panel'
import { SpaceCanvasBlock, isCanvasTextField } from './space-canvas-block'

// THE ON-CANVAS WYSIWYG SPACE PAGE EDITOR — the space mirror of the Email Studio canvas editor. A two-pane
// surface over the SHARED entity-layout store (same provider, seed, debounced save + sanitize as the
// existing arranger; nothing about persistence changes):
//   • LEFT (settings-only rail) — the page as a compact list of SECTIONS. A section IS a store row, so it
//     supports the same split-column layout the page already has (its columns are the row's cells). Each
//     section has an editable TITLE (blank renders nothing on the live page), a Full / 50-50 / Main+Side /
//     Side+Main layout picker (the last = the new skinny-left/wide-right column option), and reorder / add /
//     remove. Inside a column, each block is a compact tile that EXPANDS IN PLACE to its STRUCTURAL settings
//     only (url / image / links / toggle / enum primitives / picker) — NO text content is edited here (that
//     happens on the canvas), exactly the isCoreField split the email rail uses.
//   • RIGHT (live canvas) — the space page rendered with every TEXT field an inline-editable slot: click the
//     copy and type. Clicking a block on the canvas AUTO-SELECTS its rail tile and opens its settings (shared
//     `selectedId`); the rail translates so the selected tile lines up with the block on the canvas
//     (railOffset). Photos, links, and structural options are set in the rail.
// Semantic DAWN tokens (no hex), voice canon (no em dashes).

const label = (id: string) => entityBlockById(id)?.label ?? id

/** A field belongs in the settings-only rail when it is NOT inline-editable text on the canvas. Mirrors the
 *  email `isCoreField` split: text / textarea move to the canvas; everything structural (url / image / links
 *  / toggle / the enum primitives / picker) — and the Features / Cards item STRUCTURE — stays in the rail. */
function isRailField(f: FieldDef): boolean {
  return !isCanvasTextField(f)
}

/** The canvas column grid for a section, matching the live EntityGrid (even 50/50, lead 66/33, trail
 *  33/66). Stacks on mobile either way. */
function columnsClass(columns: number, ratio: string | undefined): string {
  if (columns === 2) {
    if (ratio === 'lead') return 'sm:grid-cols-[2fr_1fr]'
    if (ratio === 'trail') return 'sm:grid-cols-[1fr_2fr]'
    return 'sm:grid-cols-2'
  }
  return ''
}

export function SpaceCanvasEditor({ uploadImage }: { uploadImage?: UploadImage }) {
  const store = useProfileLayout()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addingAt, setAddingAt] = useState<{ rowId: string; col: number } | null>(null)

  // Vertical rail alignment (railOffset): when a block is selected (usually by clicking it on the canvas),
  // the LEFT section list translates so the selected tile sits on the SAME horizontal line as the block on
  // the canvas. Measured from layout coordinates (offsetTop / getBoundingClientRect against the shared grid),
  // so it is stable across page scroll; recomputed on selection change, on a tile expanding, and on resize.
  const tileRefs = useRef<Record<string, HTMLLIElement | null>>({})
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const gridRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLOListElement | null>(null)
  const [railOffset, setRailOffset] = useState(0)

  // The blocks not yet on the page: the curated space palette minus what is already placed.
  const placed = useMemo(() => placedIds(store?.rows ?? []), [store?.rows])
  const addable = useMemo(
    () => profilePaletteForKind('space').filter((b) => !placed.has(b.id)),
    [placed],
  )

  useLayoutEffect(() => {
    const align = () => {
      const grid = gridRef.current
      const list = listRef.current
      const tile = selectedId ? tileRefs.current[selectedId] : null
      const block = selectedId ? blockRefs.current[selectedId] : null
      if (!selectedId || !grid || !list || !tile || !block) {
        setRailOffset(0)
        return
      }
      const gridTop = grid.getBoundingClientRect().top
      const blockTopInGrid = block.getBoundingClientRect().top - gridTop
      const tileTopInList = tile.offsetTop
      const maxOffset = Math.max(0, grid.offsetHeight - list.offsetHeight)
      const next = Math.max(0, Math.min(blockTopInGrid - tileTopInList, maxOffset))
      setRailOffset(next)
    }
    align()
    window.addEventListener('resize', align)
    return () => window.removeEventListener('resize', align)
  }, [selectedId, store?.rows, store?.content])

  if (!store || !store.seeded) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-border">
        <Loader2 className="h-5 w-5 animate-spin text-subtle" aria-hidden />
      </div>
    )
  }

  const layout: BuilderLayout = { rows: store.rows, hidden: store.hidden, content: store.content, style: store.style }
  const mutate = (next: BuilderLayout) => store.apply(next)

  // Merge one content field against the freshest store bag (sparse: an empty value clears the key).
  const setField = (blockId: string, key: string, value: unknown) => {
    const props = { ...(store.content[blockId] ?? {}) }
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (empty) delete props[key]
    else props[key] = value
    store.applyContent(blockId, Object.keys(props).length ? props : undefined)
  }

  // ── Section (row) ops ──
  const onAddSection = () => {
    const withRow = addRow(layout)
    mutate(withRow)
  }
  const onRemoveSection = (rowId: string) => {
    mutate(removeRow(layout, rowId))
  }
  const onMoveSection = (from: number, to: number) => {
    if (to < 0 || to >= layout.rows.length) return
    mutate(moveRow(layout, from, to))
  }
  const onSplit = (rowId: string, split: RowSplit) => mutate(setRowSplit(layout, rowId, split))
  // The section title is WYSIWYG: setting a non-blank title also turns its live header on, so the canvas and
  // the published page show the same heading; clearing it drops both (setRowTitle + setRowHeaderOn semantics).
  const onSectionTitle = (rowId: string, value: string) => {
    const withTitle = setRowTitle(layout, rowId, value)
    mutate(setRowHeaderOn(withTitle, rowId, value.trim().length > 0))
  }

  // ── Block ops ──
  const onPlace = (blockId: string, rowId: string, col: number) => {
    mutate(placeBlock(layout, blockId, rowId, col))
    setSelectedId(blockId)
    setAddingAt(null)
  }
  const onRemoveBlock = (blockId: string) => {
    mutate(removeBlock(layout, blockId))
    if (selectedId === blockId) setSelectedId(null)
  }
  const onNudge = (blockId: string, delta: -1 | 1) => mutate(nudgeBox(layout, blockId, delta))

  const activeSplit = (columns: number, ratio: string | undefined): RowSplit =>
    columns === 1 ? 'full' : ratio === 'lead' ? 'lead' : ratio === 'trail' ? 'sidebar' : 'even'

  return (
    <div ref={gridRef} className="grid items-start gap-4 lg:grid-cols-[minmax(260px,32%)_minmax(0,1fr)]">
      {/* LEFT — the settings-only section rail. */}
      <aside className="min-w-0 space-y-3" aria-label="Sections and settings">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Sections</h3>
          <span className="flex items-center gap-1 text-2xs text-subtle" role="status" aria-live="polite">
            {store.saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving
              </>
            ) : (
              'Saved'
            )}
          </span>
        </div>

        {store.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
            This page has no sections yet. Add one below.
          </p>
        ) : (
          <ol
            ref={listRef}
            className="relative space-y-2 transition-transform duration-200 ease-out will-change-transform"
            style={{ transform: railOffset ? `translateY(${railOffset}px)` : undefined }}
          >
            {store.rows.map((row, ri) => (
              <li key={row.id} className="rounded-xl border border-border bg-surface">
                {/* Section header: reorder, layout picker, remove. */}
                <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-2xs font-semibold uppercase tracking-wide text-subtle">
                    Section {ri + 1}
                  </span>
                  <SplitPicker active={activeSplit(row.columns, row.ratio)} onChoose={(s) => onSplit(row.id, s)} />
                  <button
                    type="button"
                    aria-label={`Move section ${ri + 1} up`}
                    disabled={ri === 0}
                    onClick={() => onMoveSection(ri, ri - 1)}
                    className="shrink-0 rounded p-0.5 text-subtle hover:text-text disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move section ${ri + 1} down`}
                    disabled={ri === store.rows.length - 1}
                    onClick={() => onMoveSection(ri, ri + 1)}
                    className="shrink-0 rounded p-0.5 text-subtle hover:text-text disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove section ${ri + 1}`}
                    onClick={() => onRemoveSection(row.id)}
                    className="shrink-0 rounded p-0.5 text-subtle hover:bg-danger-bg hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>

                {/* Section title (blank renders nothing on the live page). */}
                <div className="px-2 pt-2">
                  <input
                    type="text"
                    value={row.title ?? ''}
                    placeholder="Section title (optional)"
                    aria-label={`Title for section ${ri + 1}`}
                    onChange={(e) => onSectionTitle(row.id, e.target.value)}
                    className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-text placeholder:font-normal placeholder:text-subtle hover:border-border focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Columns — each a stack of block tiles + an add-block control. */}
                <div className={`grid gap-1.5 p-2 ${row.columns > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {row.cells.map((stack, col) => (
                    <div key={`${row.id}-${col}`} className="space-y-1.5">
                      {stack.map((id, si) => (
                        <BlockTile
                          key={id}
                          id={id}
                          active={id === selectedId}
                          canUp={si > 0}
                          canDown={si < stack.length - 1}
                          tileRef={(el) => {
                            tileRefs.current[id] = el
                          }}
                          uploadImage={uploadImage}
                          content={store.content[id] ?? {}}
                          onSelect={() => setSelectedId(id === selectedId ? null : id)}
                          onUp={() => onNudge(id, -1)}
                          onDown={() => onNudge(id, 1)}
                          onField={(k, v) => setField(id, k, v)}
                          onRemove={() => onRemoveBlock(id)}
                        />
                      ))}
                      {addingAt && addingAt.rowId === row.id && addingAt.col === col ? (
                        <AddBlockPalette
                          addable={addable}
                          onPick={(bid) => onPlace(bid, row.id, col)}
                          onClose={() => setAddingAt(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingAt({ rowId: row.id, col })}
                          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border px-2 py-2 text-2xs font-medium text-muted transition-colors hover:border-primary hover:text-text"
                        >
                          <Plus className="h-3 w-3" aria-hidden /> Add block
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}

        <button
          type="button"
          onClick={onAddSection}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-semibold text-muted transition-colors hover:border-primary hover:text-text"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add section
        </button>
      </aside>

      {/* RIGHT — the live, clickable space canvas. */}
      <div className="min-w-0 overflow-x-auto rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-label="Page canvas">
        {store.rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-subtle">Add a section to start building your page.</p>
        ) : (
          <div className="space-y-8">
            {store.rows.map((row) => (
              <section key={row.id} className="space-y-4">
                {row.title && (
                  <h2 className="font-display text-xl font-bold uppercase tracking-tight text-text sm:text-2xl">
                    {row.title}
                  </h2>
                )}
                <div className={`grid gap-6 ${columnsClass(row.columns, row.ratio)}`}>
                  {row.cells.map((stack, col) => (
                    <div key={`${row.id}-${col}`} className="space-y-6">
                      {stack.map((id) => (
                        <div
                          key={id}
                          ref={(el) => {
                            blockRefs.current[id] = el
                          }}
                          role="group"
                          onMouseDown={() => setSelectedId(id)}
                          className={`rounded-lg p-2 transition-colors ${
                            id === selectedId ? 'bg-primary-bg/30' : 'hover:bg-surface-elevated/40'
                          }`}
                        >
                          <SpaceCanvasBlock id={id} props={store.content[id] ?? {}} onField={(k, v) => setField(id, k, v)} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── A block tile in the rail: select to expand its SETTINGS-ONLY fields (no text content). ──
function BlockTile({
  id,
  active,
  canUp,
  canDown,
  tileRef,
  uploadImage,
  content,
  onSelect,
  onUp,
  onDown,
  onField,
  onRemove,
}: {
  id: string
  active: boolean
  canUp: boolean
  canDown: boolean
  tileRef: (el: HTMLLIElement | null) => void
  uploadImage?: UploadImage
  content: Record<string, unknown>
  onSelect: () => void
  onUp: () => void
  onDown: () => void
  onField: (key: string, value: unknown) => void
  onRemove: () => void
}) {
  const fields = fieldsForBlock(id).filter(isRailField)
  return (
    <li
      ref={tileRef}
      className={`rounded-lg border transition-colors ${
        active ? 'border-primary bg-primary-bg/40' : 'border-border bg-surface hover:border-border-strong'
      }`}
    >
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button
          type="button"
          onClick={onSelect}
          aria-current={active}
          aria-expanded={active}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-text"
        >
          <Settings2 className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{label(id)}</span>
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
      </div>

      {active && (
        <div className="space-y-3 border-t border-border px-2.5 pb-3 pt-2">
          {fields.length === 0 ? (
            <p className="text-2xs text-muted">This block has no structural settings. Edit its text on the canvas.</p>
          ) : (
            fields.map((f) => (
              <FieldEditor
                key={f.key}
                field={f}
                value={content[f.key]}
                uploadImage={uploadImage}
                textOnCanvas
                onChange={(v) => onField(f.key, v)}
              />
            ))
          )}
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-semibold text-danger transition-colors hover:bg-danger-bg"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove block
          </button>
        </div>
      )}
    </li>
  )
}

// ── The add-block palette (the space blocks not yet placed). ──
function AddBlockPalette({
  addable,
  onPick,
  onClose,
}: {
  addable: { id: string; label: string; description?: string }[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  if (addable.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-elevated/40 p-2 text-2xs text-muted">
        Every block is on your page.{' '}
        <button type="button" onClick={onClose} className="font-semibold text-primary-strong hover:underline">
          Close
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-surface-elevated/40 p-2">
      <div className="flex items-center justify-between">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Add a block</p>
        <button type="button" onClick={onClose} className="text-2xs font-semibold text-subtle hover:text-text">
          Close
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {addable.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onPick(b.id)}
            title={b.description}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-2xs font-semibold text-muted transition-colors hover:border-primary hover:text-text"
          >
            <Plus className="h-3 w-3" aria-hidden /> {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── The section layout picker: Full / 50-50 / Main+Side / Side+Main (the new skinny-left, wide-right). ──
const SPLIT_OPTIONS: { split: RowSplit; label: string; bars: string[] }[] = [
  { split: 'full', label: 'Full width', bars: ['flex-1'] },
  { split: 'even', label: '50 / 50', bars: ['flex-1', 'flex-1'] },
  { split: 'lead', label: 'Main and side', bars: ['flex-[2]', 'flex-1'] },
  { split: 'sidebar', label: 'Side and main', bars: ['flex-1', 'flex-[2]'] },
]
function SplitPicker({ active, onChoose }: { active: RowSplit; onChoose: (s: RowSplit) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="Section layout">
      {SPLIT_OPTIONS.map(({ split, label: l, bars }) => {
        const on = active === split
        return (
          <button
            key={split}
            type="button"
            aria-pressed={on}
            aria-label={l}
            title={l}
            onClick={() => onChoose(split)}
            className={`flex min-h-[24px] w-7 items-center justify-center px-1 py-1 ${
              on ? 'bg-primary' : 'bg-surface hover:bg-surface-elevated'
            }`}
          >
            <span className="flex w-full gap-0.5" aria-hidden>
              {bars.map((b, i) => (
                <span key={i} className={`h-2.5 rounded-[1px] ${b} ${on ? 'bg-on-primary' : 'bg-border-strong'}`} />
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

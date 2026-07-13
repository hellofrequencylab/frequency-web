'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Plus, Settings2, Trash2 } from 'lucide-react'
import { emailPalette, entityBlockById } from '@/lib/entity-blocks/registry'
import { fieldsForBlock, type FieldDef } from '@/lib/entity-blocks/block-content'
import { addRow, moveRow, placeBlock, removeBlock, type BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { DEFAULT_EMAIL_COLORS as C } from '@/lib/email-studio/render'
import { useProfileLayout } from '@/components/entity-blocks/profile-layout-context'
import { FieldEditor } from '@/components/entity-blocks/block-edit-panel'
import { CanvasBlock } from './canvas/canvas-block'

// THE ON-CANVAS WYSIWYG EMAIL EDITOR (Email Studio, now the DEFAULT campaign editor). A two-pane surface that
// reuses the SHARED entity-layout store (same provider, seed, debounced save, compile + preview + test-send as
// the working editor — nothing about persistence changes):
//   • LEFT (25%)  — the block LIST plus an ADD-BLOCK palette. Click a block to select it; the clicked tile
//     EXPANDS IN PLACE to reveal its own structural settings (its non-text fields: url / toggle / align / enum
//     / features / links). Up/down reorders it (reusing the store's rows op, moveRow — no drag library); a
//     Remove control deletes it. The add palette offers every EMAIL block type not already placed, so the whole
//     email registry is reachable from here. No text-content editing in this rail (that happens on the canvas).
//   • RIGHT (75%) — a LIVE, clickable email canvas. Each block's `text` / `textarea` fields are inline slots you
//     edit in place; selecting text in a rich slot pops a Bold / Italic / Link bubble. Clicking a block on the
//     canvas AUTO-SELECTS its tile on the left AND opens that tile's settings (they share `selectedId`). Images
//     open the Loom popup.
// Semantic DAWN tokens for the app chrome; the canvas mirrors the email palette (see canvas-block). Voice canon
// (no em dashes).

/** Field types that belong in the LEFT rail (structural / composite), not as inline canvas text. A url field
 *  with `upload` is a photo slot (edited on the canvas via the Loom popup), so it is excluded here. The
 *  composite fields (features / links) and the embed URL have no inline canvas editor, so they live here too;
 *  the alt text of a photo is set inside the Loom popup, never in the rail. */
const CORE_TYPES: ReadonlySet<FieldDef['type']> = new Set([
  'url',
  'toggle',
  'align',
  'segmented',
  'height',
  'buttonOrientation',
  'color',
  'shadow',
  'margin',
  'features',
  'cards',
  'links',
  'embedUrl',
])

function isCoreField(f: FieldDef): boolean {
  if (f.type === 'url' && f.upload) return false // a photo slot — edited on the canvas via the Loom popup
  if (f.key === 'alt') return false // photo alt is set inside the Loom popup
  return CORE_TYPES.has(f.type)
}

const label = (id: string) => entityBlockById(id)?.label ?? id

export function EmailCanvasEditor() {
  const store = useProfileLayout()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Scroll the selected tile into view when the selection is driven from the canvas (issue #2), so the tile
  // that just opened its settings is actually visible in the rail.
  const tileRefs = useRef<Record<string, HTMLLIElement | null>>({})

  // The single-column email block list, in reading order (each row is one block).
  const blocks = useMemo(() => {
    const rows = store?.rows ?? []
    return rows.map((r) => r.cells[0]?.[0] ?? null).filter((s): s is string => s !== null)
  }, [store?.rows])

  // The blocks NOT yet on this email: the whole curated EMAIL palette minus what is already placed. A block id
  // is unique across the layout (rows-ops normalize), so each type is offered until it is added.
  const addable = useMemo(() => {
    const placed = new Set(blocks)
    return emailPalette().filter((b) => !placed.has(b.id))
  }, [blocks])

  useEffect(() => {
    if (!selectedId) return
    tileRefs.current[selectedId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  if (!store || !store.seeded) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-border">
        <Loader2 className="h-5 w-5 animate-spin text-subtle" aria-hidden />
      </div>
    )
  }

  const layout: BuilderLayout = { rows: store.rows, hidden: store.hidden, content: store.content, style: store.style }

  const reorder = (id: string, delta: -1 | 1) => {
    const from = store.rows.findIndex((r) => r.cells[0]?.[0] === id)
    if (from < 0) return
    store.apply(moveRow(layout, from, from + delta))
  }

  // Add one email block: append a fresh single-column row and place the block into it, then select it so its
  // settings open. rows-ops keep a block id unique, so the same type can never double-add.
  const addBlock = (blockId: string) => {
    const withRow = addRow(layout)
    const newRow = withRow.rows[withRow.rows.length - 1]
    if (!newRow) return
    store.apply(placeBlock(withRow, blockId, newRow.id, 0))
    setSelectedId(blockId)
  }

  const remove = (id: string) => {
    store.apply(removeBlock(layout, id))
    if (selectedId === id) setSelectedId(null)
  }

  // Merge one content field against the freshest store bag (sparse: an empty value clears the key).
  const setField = (blockId: string, key: string, value: unknown) => {
    const props = { ...(store.content[blockId] ?? {}) }
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (empty) delete props[key]
    else props[key] = value
    store.applyContent(blockId, Object.keys(props).length ? props : undefined)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,25%)_minmax(0,1fr)]">
      {/* LEFT — block list (each tile expands to its own settings) + the add-block palette. */}
      <aside className="min-w-0 space-y-3" aria-label="Blocks and settings">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Blocks</h3>
          <span className="flex items-center gap-1 text-2xs text-subtle" role="status" aria-live="polite">
            {store.saving ? <><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving</> : 'Saved'}
          </span>
        </div>

        {blocks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
            This email has no blocks yet. Add one below.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {blocks.map((id, i) => {
              const active = id === selectedId
              const fields = fieldsForBlock(id).filter(isCoreField)
              return (
                <li
                  key={id}
                  ref={(el) => {
                    tileRefs.current[id] = el
                  }}
                  className={`rounded-lg border transition-colors ${
                    active ? 'border-primary bg-primary-bg/40' : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  {/* The tile's header row: select (label), reorder, and the settings expand affordance. */}
                  <div className="flex items-center gap-1 px-1.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedId(active ? null : id)}
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
                      disabled={i === 0}
                      onClick={() => reorder(id, -1)}
                      className="shrink-0 rounded p-0.5 text-subtle hover:text-text disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${label(id)} down`}
                      disabled={i === blocks.length - 1}
                      onClick={() => reorder(id, 1)}
                      className="shrink-0 rounded p-0.5 text-subtle hover:text-text disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>

                  {/* The selected block's structural settings open INSIDE its own tile (never its text content,
                      which is edited on the canvas). Issue #1 + #2: the same `selectedId` a canvas click sets. */}
                  {active && (
                    <div className="space-y-3 border-t border-border px-2.5 pb-3 pt-2">
                      {fields.length === 0 ? (
                        <p className="text-2xs text-muted">
                          This block has no structural settings. Edit its text on the canvas.
                        </p>
                      ) : (
                        fields.map((f) => (
                          <FieldEditor
                            key={f.key}
                            field={f}
                            value={store.content[id]?.[f.key]}
                            textOnCanvas
                            onChange={(v) => setField(id, f.key, v)}
                          />
                        ))
                      )}
                      <button
                        type="button"
                        onClick={() => remove(id)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-semibold text-danger transition-colors hover:bg-danger-bg"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove block
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}

        {/* ADD-BLOCK palette (issue #3): every EMAIL block type not already placed, so the whole registry is
            reachable. Clicking adds the block and opens its settings tile. */}
        {addable.length > 0 && (
          <div className="space-y-1.5 rounded-2xl border border-border bg-surface-elevated/40 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Add a block</p>
            <div className="flex flex-wrap gap-1.5">
              {addable.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => addBlock(b.id)}
                  title={b.description}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-2xs font-semibold text-muted transition-colors hover:border-primary hover:text-text"
                >
                  <Plus className="h-3 w-3" aria-hidden /> {b.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* RIGHT — the live, clickable email canvas (mirrors the email palette). */}
      <div
        className="min-w-0 overflow-x-auto rounded-2xl p-4 sm:p-6"
        style={{ background: C.canvas }}
        aria-label="Email canvas"
      >
        <div
          className="mx-auto w-full max-w-[600px] rounded-2xl p-6 sm:p-9"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <div className="mb-6">
            <span className="text-xl font-black lowercase" style={{ color: C.primaryStrong }}>frequency</span>
          </div>

          {blocks.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: C.subtle }}>
              Add blocks to this email to start editing.
            </p>
          ) : (
            <div className="space-y-6">
              {blocks.map((id) => (
                // Selecting a block (mousedown) surfaces its settings in its LEFT-rail tile (issue #2), which is
                // the selection affordance. No ring is painted on the canvas: clicking into a text slot must not
                // draw an amber box around the field (owner directive), so the block wrapper stays outline-free.
                <div
                  key={id}
                  role="group"
                  onMouseDown={() => setSelectedId(id)}
                  className="rounded-lg p-2"
                >
                  <CanvasBlock id={id} props={store.content[id] ?? {}} onField={(k, v) => setField(id, k, v)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

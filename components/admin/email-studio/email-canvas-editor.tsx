'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { fieldsForBlock, type FieldDef } from '@/lib/entity-blocks/block-content'
import { moveRow, type BuilderLayout } from '@/lib/entity-blocks/rows-ops'
import { DEFAULT_EMAIL_COLORS as C } from '@/lib/email-studio/render'
import { useProfileLayout } from '@/components/entity-blocks/profile-layout-context'
import { FieldEditor } from '@/components/entity-blocks/block-edit-panel'
import { CanvasBlock } from './canvas/canvas-block'

// THE ON-CANVAS WYSIWYG EMAIL EDITOR (Email Studio prototype, Slice A). A two-pane surface that reuses the
// SHARED entity-layout store (same provider, seed, debounced save, compile + preview + test-send as the
// working editor — nothing about persistence changes):
//   • LEFT (25%)  — the block LIST. Click a block to select it; up/down reorders it (reusing the store's
//     rows op, moveRow — no drag library). The selected block's CORE / structural settings render below the
//     list: only its non-text fields (url / toggle / align / enum). No text-content editing in this rail.
//   • RIGHT (75%) — a LIVE, clickable email canvas. Each block's `text` / `textarea` fields are inline slots
//     you edit in place; selecting text in a rich slot pops a Bold / Italic / Link bubble. Images are a Slice
//     B stub.
// This is a prototype to FEEL the editing model; it is gated behind a flag so the working editor stays the
// default. Semantic DAWN tokens for the app chrome; the canvas mirrors the email palette (see canvas-block).
// Voice canon (no em dashes).

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

  // The single-column email block list, in reading order (each row is one block).
  const blocks = useMemo(() => {
    const rows = store?.rows ?? []
    return rows.map((r) => r.cells[0]?.[0] ?? null).filter((s): s is string => s !== null)
  }, [store?.rows])

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

  // Merge one content field against the freshest store bag (sparse: an empty value clears the key).
  const setField = (blockId: string, key: string, value: unknown) => {
    const props = { ...(store.content[blockId] ?? {}) }
    const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (empty) delete props[key]
    else props[key] = value
    store.applyContent(blockId, Object.keys(props).length ? props : undefined)
  }

  const selectedFields = selectedId ? fieldsForBlock(selectedId).filter(isCoreField) : []

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(200px,25%)_minmax(0,1fr)]">
      {/* LEFT — block list + the selected block's core settings. */}
      <aside className="min-w-0 space-y-3" aria-label="Blocks and settings">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">Blocks</h3>
          <span className="flex items-center gap-1 text-2xs text-subtle" role="status" aria-live="polite">
            {store.saving ? <><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving</> : 'Saved'}
          </span>
        </div>

        {blocks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
            This email has no blocks yet.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {blocks.map((id, i) => {
              const active = id === selectedId
              return (
                <li
                  key={id}
                  className={`flex items-center gap-1 rounded-lg border px-1.5 py-1.5 transition-colors ${
                    active ? 'border-primary bg-primary-bg/40' : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(id)}
                    aria-current={active}
                    className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-text"
                  >
                    {label(id)}
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
                </li>
              )
            })}
          </ol>
        )}

        {/* Core / structural settings for the selected block (never its text content). */}
        {selectedId && (
          <div className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
              {label(selectedId)} settings
            </p>
            {selectedFields.length === 0 ? (
              <p className="text-2xs text-muted">
                This block has no structural settings. Edit its text on the canvas.
              </p>
            ) : (
              selectedFields.map((f) => (
                <FieldEditor
                  key={f.key}
                  field={f}
                  value={store.content[selectedId]?.[f.key]}
                  onChange={(v) => setField(selectedId, f.key, v)}
                />
              ))
            )}
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
              {blocks.map((id) => {
                const active = id === selectedId
                return (
                  <div
                    key={id}
                    role="group"
                    onMouseDown={() => setSelectedId(id)}
                    className="rounded-lg p-2 transition-shadow"
                    style={active ? { boxShadow: `0 0 0 2px ${C.primary}` } : undefined}
                  >
                    <CanvasBlock id={id} props={store.content[id] ?? {}} onField={(k, v) => setField(id, k, v)} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

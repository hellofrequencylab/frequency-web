'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Settings2, Trash2 } from 'lucide-react'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { fieldsForBlock, type FieldDef } from '@/lib/entity-blocks/block-content'
import { DEFAULT_EMAIL_COLORS, type EmailColors } from '@/lib/email-studio/render'
import { emailFooterHtml, emailHeaderHtml, emailHeroHtml } from '@/lib/email-studio/shell'
import { useLegacyEmailModel, useNodeEmailModel, type EmailCanvasModel } from './email-canvas-model'
import { FieldEditor } from '@/components/entity-blocks/block-edit-panel'
import { CanvasBlock } from './canvas/canvas-block'
import { ProductCardEditor } from './product-picker'
import { EventCardEditor, CircleCardEditor } from './data-picker'

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

// A stand-in unsubscribe target for the EDIT canvas only. The real one-click token is injected at send; here it
// just makes the shared footer's unsubscribe read as a live link so the operator sees the compliant control.
const EDITOR_UNSUBSCRIBE_PLACEHOLDER = 'https://frequencylocal.com/unsubscribe'

/** The legacy (type-keyed) email canvas editor. */
export function EmailCanvasEditor({ colors }: { colors?: EmailColors } = {}) {
  return <EmailCanvasView model={useLegacyEmailModel()} colors={colors} />
}

/** The same editor on the node store (E0 task 12b): each block is its own node, so a type can repeat. Mounted
 *  only when the campaign carries a node document (render_path_email). */
export function NodeEmailCanvasEditor({ colors }: { colors?: EmailColors } = {}) {
  return <EmailCanvasView model={useNodeEmailModel()} colors={colors} />
}

function EmailCanvasView({ model, colors }: { model: EmailCanvasModel | null; colors?: EmailColors }) {
  // The canvas chrome (the framing canvas, the card surface/border, the brand wordmark ink) mirrors the email
  // palette so the WYSIWYG surface reads in the same colors the email will send in. Defaults to the platform
  // DAWN palette; a per-Space editor passes its brand-seeded palette (spaceEmailColors) so a business Space's
  // canvas paints in its own brand.
  const C = colors ?? DEFAULT_EMAIL_COLORS
  const store = model
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The LEFT block list stays STATIONARY (no translate-to-canvas alignment): the tiles are a plain stacked
  // list, so an expanding tile can never shift the list over the palette below it.
  // Native HTML5 drag-reorder of the LEFT block list (mirrors modules/crm/components/stage-editor.tsx, no new
  // library). `dragId` is the block being dragged; `overId` the tile currently hovered as the drop target.
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // The single-column email block list, in reading order (each row is one block).
  const blocks = store?.blocks ?? []
  const addable = store?.addable ?? []

  // The legal FOOTER chrome, built from the SAME shell builder the sent email uses (emailFooterHtml — no fork),
  // painted in this editor's brand palette. Rendered as non-editable chrome below the block canvas so the
  // WYSIWYG matches what sends; the placeholder unsubscribe URL stands in for the send-time one-click token.
  const footerHtml = useMemo(
    () => emailFooterHtml({ brand: { colors: C }, unsubscribeUrl: EDITOR_UNSUBSCRIBE_PLACEHOLDER }),
    [C],
  )
  // The brand HEADER chrome, from the SAME builder the sent email uses (emailHeaderHtml — no fork), so the
  // editor shows the identical wordmark + tagline lockup, not a hand-rolled one missing the tagline.
  const headerHtml = useMemo(
    () => emailHeaderHtml({ brand: { colors: C } }),
    [C],
  )
  // The stock hero crowns the card on the platform brand, as it does in the sent email. Pinned to the first of
  // the five so the server and client renders agree; each send picks one at random.
  const heroHtml = useMemo(() => emailHeroHtml({ brand: { colors: C }, hero: 0 }), [C])


  if (!store || !store.seeded) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-border">
        <Loader2 className="h-5 w-5 animate-spin text-subtle" aria-hidden />
      </div>
    )
  }

  const reorder = (key: string, delta: -1 | 1) => store.reorder(key, delta)

  // Drop the dragged block onto `targetId`. Keys, never list positions, so a filtered row can never misalign it.
  const reorderByDrag = (targetId: string) => {
    const source = dragId
    setDragId(null)
    setOverId(null)
    if (!source || source === targetId) return
    store.reorderTo(source, targetId)
  }

  // Add one email block, then select it so its settings open.
  const addBlock = (type: string) => {
    const key = store.add(type)
    if (key) setSelectedId(key)
  }

  const remove = (key: string) => {
    store.remove(key)
    if (selectedId === key) setSelectedId(null)
  }

  const setField = (key: string, field: string, value: unknown) => store.setField(key, field, value)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(220px,25%)_minmax(0,1fr)]">
      {/* LEFT — block list (each tile expands to its own settings) + the add-block palette. */}
      <aside className="min-w-0 space-y-3" aria-label="Blocks and settings">
        <div className="flex items-center justify-between">
          <h3 className="text-body-sm font-bold text-text">Blocks</h3>
          <span className="flex items-center gap-1 text-2xs text-muted" role="status" aria-live="polite">
            {store.saving ? <><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving</> : 'Saved'}
          </span>
        </div>

        {blocks.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-3 py-6 text-center text-meta text-muted">
            This email has no blocks yet. Add one below.
          </p>
        ) : (
          <ol className="space-y-1.5">

            {blocks.map((block, i) => {
              const id = block.key
              const type = block.type
              const active = id === selectedId
              const fields = fieldsForBlock(type).filter(isCoreField)
              return (
                <li
                  key={id}
                  onDragOver={(e) => {
                    if (!dragId || dragId === id) return
                    e.preventDefault()
                    setOverId(id)
                  }}
                  onDrop={() => reorderByDrag(id)}
                  onDragLeave={() => setOverId((cur) => (cur === id ? null : cur))}
                  className={`rounded-lg border transition-colors ${
                    active
                      ? 'border-primary bg-primary-bg/40'
                      : overId === id && dragId && dragId !== id
                        ? 'border-primary bg-primary-bg/20'
                        : 'border-border bg-surface hover:border-border-strong'
                  } ${dragId === id ? 'opacity-60' : ''}`}
                >
                  {/* The tile's header row: a drag handle, the select (label), reorder chevrons (keyboard
                      fallback), and the settings expand affordance. */}
                  <div className="flex items-center gap-1 px-1.5 py-1.5">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        setDragId(id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setOverId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' && i > 0) {
                          e.preventDefault()
                          reorder(id, -1)
                        } else if (e.key === 'ArrowDown' && i < blocks.length - 1) {
                          e.preventDefault()
                          reorder(id, 1)
                        }
                      }}
                      aria-label={`Reorder ${label(type)}. Drag, or press the up and down arrow keys to move it.`}
                      className="shrink-0 cursor-grab rounded p-0.5 text-subtle transition-colors hover:text-text active:cursor-grabbing"
                    >
                      <GripVertical className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedId(active ? null : id)}
                      aria-current={active}
                      aria-expanded={active}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-meta font-semibold text-text"
                    >
                      <Settings2 className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{label(type)}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${label(type)} up`}
                      disabled={i === 0}
                      onClick={() => reorder(id, -1)}
                      className="shrink-0 rounded p-0.5 text-subtle hover:text-text disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${label(type)} down`}
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
                      {type === 'productCard' ? (
                        // The data-bound Product card has its own search-by-owner picker (Phase 4), not the
                        // generic field list.
                        <ProductCardEditor
                          content={block.content}
                          onField={(k, v) => setField(id, k, v)}
                        />
                      ) : type === 'eventCard' ? (
                        <EventCardEditor content={block.content} onField={(k, v) => setField(id, k, v)} />
                      ) : type === 'circleCard' ? (
                        <CircleCardEditor content={block.content} onField={(k, v) => setField(id, k, v)} />
                      ) : fields.length === 0 ? (
                        <p className="text-2xs text-muted">
                          This block has no structural settings. Edit its text on the canvas.
                        </p>
                      ) : (
                        fields.map((f) => (
                          <FieldEditor
                            key={f.key}
                            field={f}
                            value={block.content[f.key]}
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

      </aside>

      {/* RIGHT — the live, clickable email canvas (mirrors the email palette), with the ADD-BLOCK palette
          BELOW the email body so adding a block reads as "append to the email" rather than a left-rail control. */}
      <div className="min-w-0 space-y-3">
      <div
        className="overflow-x-auto rounded-2xl p-4 sm:p-6"
        style={{ background: C.canvas }}
        aria-label="Email canvas"
      >
        <div
          className="mx-auto w-full max-w-[600px] overflow-hidden rounded-3xl"
          style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 1px 2px rgba(60,40,20,.04),0 22px 50px -36px rgba(80,50,20,.34)' }} // token-ok: mirrors the email card shadow
        >
          {heroHtml ? <div dangerouslySetInnerHTML={{ __html: heroHtml }} /> : null}
          <div className="p-6 sm:p-9">
          {/* Brand header — the SAME wordmark + tagline lockup the sent email renders (no hand-rolled copy). */}
          {heroHtml ? null : <div className="mb-6" dangerouslySetInnerHTML={{ __html: headerHtml }} />}

          {blocks.length === 0 ? (
            <p className="py-10 text-center text-body-sm" style={{ color: C.subtle }}>
              Add blocks to this email to start editing.
            </p>
          ) : (
            <div className="space-y-6">
              {blocks.map((block) => (
                // Selecting a block (mousedown) surfaces its settings in its LEFT-rail tile (issue #2), which is
                // the selection affordance. No ring is painted on the canvas: clicking into a text slot must not
                // draw an amber box around the field (owner directive), so the block wrapper stays outline-free.
                <div
                  key={block.key}
                  role="group"
                  onMouseDown={() => setSelectedId(block.key)}
                  className="rounded-lg p-2"
                >
                  <CanvasBlock id={block.type} props={block.content} onField={(k, v) => setField(block.key, k, v)} />
                </div>
              ))}
            </div>
          )}
          </div>
        </div>

        {/* The legal FOOTER — non-editable chrome BELOW the card, so the WYSIWYG shows the whole email (wordmark,
            Privacy/Terms/Help, address, unsubscribe) exactly as it sends. It is NOT a block in the list, so it
            can't be selected, reordered, or removed; pointer-events are off so its placeholder links stay inert.
            Same markup the send uses (emailFooterHtml), never re-wrapped at send. */}
        <div className="mx-auto mt-1 w-full max-w-[600px] px-6 sm:px-9">
          <p className="mb-1 text-center text-2xs" style={{ color: C.subtle }}>
            Legal footer, added to every email
          </p>
          <div
            className="pointer-events-none select-none"
            aria-label="Email legal footer, added automatically"
            dangerouslySetInnerHTML={{ __html: footerHtml }}
          />
        </div>
      </div>

      {/* ADD-BLOCK palette — BELOW the email body: every EMAIL block type not already placed, so the whole
          registry is reachable. Clicking appends the block and opens its settings tile in the left rail. */}
      {addable.length > 0 && (
        <div className="space-y-1.5 rounded-2xl border border-border bg-surface-elevated/40 p-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted">Add a block</p>
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
      </div>
    </div>
  )
}

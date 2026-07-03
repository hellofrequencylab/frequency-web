'use client'

import { useMemo, useState, useTransition, type DragEvent } from 'react'
import Link from 'next/link'
import { ChevronUp, ChevronDown, GripVertical, Lock, Check, Plus, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { templateMeta, slotIds, defaultSlotId, TEMPLATES, type TemplateId } from '@/lib/widgets/templates'
import type { EntityLayout } from '@/lib/entity-blocks/layout'
import type { EntityKind } from '@/lib/entity-blocks/registry'

// THE SHARED GRID BLOCK-PICKER EDITOR (ADR-508, U2b, client). One Discord/Instagram-style editor used by
// BOTH a member (Spotlight) and a space (Spaces): given the entity kind, the arrangeable palette
// (blocksForKind minus feature-locked), the effective per-slot arrangement, and the locked blocks, it
// lets the operator pick a TEMPLATE (the grid), drag blocks to reorder within a slot and move between
// slots, and toggle a block on (place) or off (send to the tray). Native HTML5 drag-and-drop (NO new
// dependency) with a full KEYBOARD-accessible fallback (move up/down, move to another slot, add, remove)
// so it works on mobile and with a keyboard/screen reader. Save is explicit via useTransition, calling a
// passed onSave action; the server re-gates + re-validates, so this UI is convenience, not the authority.
//
// A LOCKED block (a space DATA block whose feature is off) renders greyed with a one-line reason + a link
// to Features, mirroring the S3 editor, and is never arrangeable. Mobile-first, semantic DAWN tokens
// only, no hex, no fixed px type, voice canon (no em dashes).

/** One arrangeable block in the palette (its feature is on, or it needs none). */
export interface GridEditorBlock {
  id: string
  label: string
  description: string
}

/** One locked block: a space DATA block whose required feature is off. */
export interface LockedGridBlock {
  id: string
  label: string
  description: string
  /** The human label of the feature that must be turned on (e.g. "Booking"). */
  featureLabel: string
}

/** The result a save action returns to the editor. */
export interface GridSaveResult {
  error?: string
}

type Placement = Record<string, string[]>

/** Drop an id from wherever it sits in a placement (immutably). */
function withoutId(placement: Placement, id: string): Placement {
  const next: Placement = {}
  for (const [slot, ids] of Object.entries(placement)) next[slot] = ids.filter((x) => x !== id)
  return next
}

/** Insert an id into a slot at an index (end when index is omitted). */
function insertInto(placement: Placement, slot: string, id: string, index?: number): Placement {
  const base = withoutId(placement, id)
  const ids = [...(base[slot] ?? [])]
  const at = index === undefined || index < 0 || index > ids.length ? ids.length : index
  ids.splice(at, 0, id)
  return { ...base, [slot]: ids }
}

export function BlockGridEditor({
  kind,
  template: initialTemplate,
  slots: initialSlots,
  palette,
  locked = [],
  featuresHref,
  previewHref,
  onSave,
  readOnly = false,
}: {
  kind: EntityKind
  /** The effective template (from mergeEntityLayout). */
  template: TemplateId
  /** The effective placed ids per slot (visible blocks). */
  slots: Placement
  /** Every arrangeable block for this kind, with copy (blocksForKind minus locked). */
  palette: GridEditorBlock[]
  /** Blocks locked behind a feature that is off (space only). */
  locked?: LockedGridBlock[]
  /** Where the locked-block "turn on the feature" link points (space Features page). */
  featuresHref?: string
  /** Optional link to the live preview of this arrangement. */
  previewHref?: string
  /** The gated server action that persists the layout. */
  onSave: (layout: EntityLayout) => Promise<GridSaveResult>
  readOnly?: boolean
}) {
  const [template, setTemplate] = useState<TemplateId>(initialTemplate)
  const [placement, setPlacement] = useState<Placement>(initialSlots)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overSlot, setOverSlot] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const meta = templateMeta(template)
  const byId = useMemo(() => new Map(palette.map((b) => [b.id, b])), [palette])

  // The tray = arrangeable blocks not currently placed in any slot.
  const placedIds = useMemo(() => new Set(Object.values(placement).flat()), [placement])
  const tray = useMemo(() => palette.filter((b) => !placedIds.has(b.id)), [palette, placedIds])

  function mutate(next: Placement) {
    setPlacement(next)
    setDirty(true)
    setSaved(false)
  }

  function chooseTemplate(id: TemplateId) {
    if (id === template) return
    // Remap: keep every placed id, moving any in a slot the new template lacks into its default slot.
    const slots = new Set(slotIds(id))
    const def = defaultSlotId(id)
    const next: Placement = {}
    const overflow: string[] = []
    for (const [slot, ids] of Object.entries(placement)) {
      if (slots.has(slot)) next[slot] = [...ids]
      else overflow.push(...ids)
    }
    if (overflow.length) next[def] = [...(next[def] ?? []), ...overflow]
    setTemplate(id)
    mutate(next)
  }

  // ── Keyboard-accessible moves (the mobile / a11y fallback for drag-and-drop) ──
  function moveWithin(slot: string, index: number, delta: -1 | 1) {
    const ids = placement[slot] ?? []
    const to = index + delta
    if (to < 0 || to >= ids.length) return
    const copy = [...ids]
    const [row] = copy.splice(index, 1)
    copy.splice(to, 0, row)
    mutate({ ...placement, [slot]: copy })
  }
  function moveToSlot(id: string, toSlot: string) {
    mutate(insertInto(placement, toSlot, id))
  }
  function removeToTray(id: string) {
    mutate(withoutId(placement, id))
  }
  function addFromTray(id: string) {
    mutate(insertInto(placement, defaultSlotId(template), id))
  }

  // ── Native HTML5 drag-and-drop ──
  function onDragStart(e: DragEvent, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  function onDragEnd() {
    setDragId(null)
    setOverSlot(null)
  }
  function dropOnCard(e: DragEvent, slot: string, index: number) {
    e.preventDefault()
    e.stopPropagation()
    const id = dragId ?? e.dataTransfer.getData('text/plain')
    if (id) mutate(insertInto(placement, slot, id, index))
    onDragEnd()
  }
  function dropOnSlot(e: DragEvent, slot: string) {
    e.preventDefault()
    const id = dragId ?? e.dataTransfer.getData('text/plain')
    if (id) mutate(insertInto(placement, slot, id))
    onDragEnd()
  }
  function dropOnTray(e: DragEvent) {
    e.preventDefault()
    const id = dragId ?? e.dataTransfer.getData('text/plain')
    if (id) mutate(withoutId(placement, id))
    onDragEnd()
  }

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        const usedSlots: Placement = {}
        for (const { id: slot } of meta.slots) {
          const ids = placement[slot] ?? []
          if (ids.length) usedSlots[slot] = ids
        }
        const hidden = palette.map((b) => b.id).filter((id) => !placedIds.has(id))
        const layout: EntityLayout = { template, slots: usedSlots }
        if (hidden.length) layout.hidden = hidden
        const res = await onSave(layout)
        if (res?.error) throw new Error(res.error)
        setDirty(false)
        setSaved(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your layout.')
      }
    })
  }

  const otherSlots = (slot: string) => meta.slots.filter((s) => s.id !== slot)

  return (
    <div className="space-y-8" data-entity-kind={kind}>
      {error && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {/* Template picker */}
      <section aria-label="Layout" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Layout</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TEMPLATES.map((t) => {
            const active = t.id === template
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                disabled={readOnly || pending}
                onClick={() => chooseTemplate(t.id)}
                className={`rounded-xl border p-3 text-left transition disabled:opacity-50 ${
                  active
                    ? 'border-primary bg-primary-bg text-text'
                    : 'border-border bg-surface text-muted hover:border-primary hover:text-text'
                }`}
              >
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{t.description}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Slots (drop zones) */}
      <section aria-label="Sections" className="space-y-4">
        {meta.slots.map((slotMeta) => {
          const ids = placement[slotMeta.id] ?? []
          const isOver = overSlot === slotMeta.id
          return (
            <div
              key={slotMeta.id}
              onDragOver={(e) => {
                if (!readOnly) {
                  e.preventDefault()
                  setOverSlot(slotMeta.id)
                }
              }}
              onDragLeave={() => setOverSlot((s) => (s === slotMeta.id ? null : s))}
              onDrop={(e) => !readOnly && dropOnSlot(e, slotMeta.id)}
              className={`rounded-2xl border p-3 transition ${
                isOver ? 'border-primary bg-primary-bg' : 'border-border bg-surface-elevated'
              }`}
            >
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {slotMeta.label}
              </p>
              {ids.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                  Drop a block here, or add one below.
                </p>
              ) : (
                <ol className="space-y-2">
                  {ids.map((id, index) => {
                    const block = byId.get(id)
                    if (!block) return null
                    return (
                      <li
                        key={id}
                        draggable={!readOnly && !pending}
                        onDragStart={(e) => onDragStart(e, id)}
                        onDragEnd={onDragEnd}
                        onDragOver={(e) => !readOnly && e.preventDefault()}
                        onDrop={(e) => !readOnly && dropOnCard(e, slotMeta.id, index)}
                        className={`flex items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm ${
                          dragId === id ? 'opacity-50' : ''
                        }`}
                      >
                        <GripVertical
                          className="h-4 w-4 shrink-0 cursor-grab text-muted"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text">{block.label}</p>
                          <p className="mt-0.5 text-xs text-muted">{block.description}</p>
                        </div>

                        {!readOnly && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Move ${block.label} up`}
                              disabled={pending || index === 0}
                              onClick={() => moveWithin(slotMeta.id, index, -1)}
                              className="rounded-md p-1 text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-30"
                            >
                              <ChevronUp className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${block.label} down`}
                              disabled={pending || index === ids.length - 1}
                              onClick={() => moveWithin(slotMeta.id, index, 1)}
                              className="rounded-md p-1 text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-30"
                            >
                              <ChevronDown className="h-4 w-4" aria-hidden />
                            </button>
                            {otherSlots(slotMeta.id).map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                aria-label={`Move ${block.label} to ${s.label}`}
                                title={`Move to ${s.label}`}
                                disabled={pending}
                                onClick={() => moveToSlot(id, s.id)}
                                className="flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted hover:bg-surface-elevated hover:text-text disabled:opacity-30"
                              >
                                <ArrowRight className="h-3 w-3" aria-hidden />
                                {s.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              aria-label={`Remove ${block.label}`}
                              disabled={pending}
                              onClick={() => removeToTray(id)}
                              className="rounded-md p-1 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-30"
                            >
                              <X className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )
        })}
      </section>

      {/* Add a block (the tray of unplaced blocks) */}
      {tray.length > 0 && (
        <section
          aria-label="Add a block"
          onDragOver={(e) => !readOnly && e.preventDefault()}
          onDrop={(e) => !readOnly && dropOnTray(e)}
          className="space-y-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Add a block</p>
          <ul className="space-y-2">
            {tray.map((block) => (
              <li
                key={block.id}
                draggable={!readOnly && !pending}
                onDragStart={(e) => onDragStart(e, block.id)}
                onDragEnd={onDragEnd}
                className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text">{block.label}</p>
                  <p className="mt-0.5 text-xs text-muted">{block.description}</p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Add ${block.label}`}
                    disabled={pending}
                    onClick={() => addFromTray(block.id)}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary-strong hover:bg-primary-bg disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Add
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Locked blocks (a feature is off) */}
      {locked.length > 0 && (
        <section aria-label="Needs a feature" className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Needs a feature</p>
          {locked.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface-elevated p-4"
            >
              <Lock className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-muted">{row.label}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Turn on {row.featureLabel} to add this section.
                </p>
              </div>
              {featuresHref && (
                <Link
                  href={featuresHref}
                  className="shrink-0 text-xs font-semibold text-primary-strong hover:underline"
                >
                  Features
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={pending || !dirty}>
            {saved && !dirty ? (
              <>
                <Check className="h-4 w-4" aria-hidden /> Saved
              </>
            ) : pending ? (
              'Saving...'
            ) : (
              'Save layout'
            )}
          </Button>
          {previewHref && (
            <Button asChild variant="ghost">
              <Link href={previewHref}>Preview</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { ImagePlus, Pencil } from 'lucide-react'
import { entityBlockById, DESIGN_ENTITY_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { fieldsForBlock, isContentBlock, type FieldDef } from '@/lib/entity-blocks/block-content'
import type { UploadImage } from '@/components/entity-blocks/block-edit-panel'
import { SpaceEditableSlot } from './space-editable-slot'
import { SpaceImagePopup } from './space-image-popup'

// ONE SPACE BLOCK, RENDERED TO THE LIVE WYSIWYG CANVAS. A DAWN-token React approximation of the block whose
// TEXT fields (text / textarea, plus each Features / Cards item's title + text) are inline-editable slots and
// whose PHOTO slots open the on-canvas photo popup — click the copy or the photo on the page and edit it right
// there (feature-for-feature with the Email Studio canvas). Structural fields (links / toggle / the enum
// primitives / picker) are NOT here; they live in the settings-only LEFT rail (the isCoreField split). A rich
// TEXT slot (a textarea on a block whose live render honours inline HTML — Text / Callout / Quote) pops the
// Bold / Italic / Link formatting bubble; a plain slot does not. A DATA block (Offerings, Events, Team...)
// shows its editable eyebrow / title and a muted note that its live list renders on the published page.
// Semantic DAWN tokens throughout (no hex), voice canon (no em dashes).

const IMAGE_KEYS = new Set(['image', 'src'])
/** The five design blocks (framework-free ids from the registry). Their live render goes through
 *  DesignBlockView with plain string props, so their `textarea` slots stay PLAIN on the canvas (no rich
 *  bubble the page could not honour). Sourced from the registry (not design-block-view) to keep this client
 *  module free of the server-side design components. */
const DESIGN_IDS: ReadonlySet<string> = new Set(DESIGN_ENTITY_BLOCK_IDS)

/** A field that is edited INLINE on the canvas (text copy) vs one that belongs in the LEFT rail. Alt text is
 *  NOT a canvas text slot — it is set inside the photo popup (as a sibling of the photo), so it never renders
 *  as its own stray slot (mirrors the email canvas). */
export function isCanvasTextField(f: FieldDef): boolean {
  if (f.key === 'alt') return false
  return f.type === 'text' || f.type === 'textarea'
}
/** A single-photo field edited ON the canvas via the photo popup (its URL / upload / alt live there, not in
 *  the rail) — mirrors the email canvas ImageSlot. A gallery (`images` list) stays in the rail. */
export function isCanvasImageField(f: FieldDef): boolean {
  return (f.type === 'url' && !!f.upload) || IMAGE_KEYS.has(f.key)
}

function str(props: Record<string, unknown>, key: string): string {
  const v = props[key]
  return typeof v === 'string' ? v : ''
}

/** A clickable photo slot on the canvas: shows the current image (or a placeholder) and opens the photo popup
 *  to upload / paste / alt. Empty value clears the slot. Mirrors the email canvas ImageSlot + Loom popup. */
function ImageSlot({
  url,
  alt,
  uploadImage,
  onChange,
}: {
  url: string
  alt: string
  uploadImage?: UploadImage
  onChange: (url: string, alt: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-elevated text-sm font-medium text-subtle"
        style={{ minHeight: url ? undefined : 128 }}
      >
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset */}
            <img src={url} alt={alt} className="max-h-72 w-full object-cover" />
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs font-semibold text-text opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Change
            </span>
          </>
        ) : (
          <span className="flex items-center gap-2 py-8">
            <ImagePlus className="h-4 w-4" aria-hidden /> Add photo
          </span>
        )}
      </button>
      <SpaceImagePopup
        open={open}
        currentUrl={url}
        currentAlt={alt}
        uploadImage={uploadImage}
        onClose={() => setOpen(false)}
        onSelect={onChange}
      />
    </>
  )
}

/** Editable per-item title + text for a Features / Cards repeater (the item's structural fields — icon /
 *  image / stat / link / reorder — stay in the rail). Persists the WHOLE items array through onChange,
 *  preserving every non-text field. Keyed by a structural signature so a rail add / remove / reorder
 *  remounts the slots while a plain keystroke keeps the key stable (no caret jump). The per-item slots are
 *  PLAIN (no bubble), matching the email canvas Features / Cards items. */
function ItemsTextCanvas({
  value,
  titleKey,
  onChange,
}: {
  value: unknown
  titleKey: 'title'
  onChange: (v: unknown) => void
}) {
  const items: Array<Record<string, unknown>> = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : []
  if (items.length === 0) {
    return <p className="text-sm italic text-subtle">Add items in this block&rsquo;s settings.</p>
  }
  const sig = items
    .map((it) => `${typeof it.icon === 'string' ? it.icon : ''}~${typeof it.image === 'string' ? it.image : ''}`)
    .join('|')
  const patch = (i: number, key: 'title' | 'text', next: string) => {
    onChange(items.map((it, j) => (j === i ? { ...it, [key]: next } : it)))
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((it, i) => {
        const image = typeof it.image === 'string' ? it.image : ''
        const title = typeof it[titleKey] === 'string' ? (it[titleKey] as string) : ''
        const text = typeof it.text === 'string' ? it.text : ''
        return (
          <div key={`${sig}-${i}`} className="rounded-xl border border-border p-3">
            {image && (
              <div className="overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset */}
                <img src={image} alt="" className="max-h-40 w-full object-cover" />
              </div>
            )}
            <div className="mt-2 text-base font-bold text-text">
              <SpaceEditableSlot value={title} placeholder="Title" onChange={(v) => patch(i, titleKey, v)} />
            </div>
            <div className="mt-0.5 text-sm leading-relaxed text-muted">
              <SpaceEditableSlot value={text} placeholder="Description" multiline onChange={(v) => patch(i, 'text', v)} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function SpaceCanvasBlock({
  id,
  props,
  uploadImage,
  onField,
}: {
  id: string
  props: Record<string, unknown>
  /** The Space-scoped gated upload, threaded to each on-canvas photo popup. */
  uploadImage?: UploadImage
  /** Persist one content field; an empty value clears it. */
  onField: (key: string, value: unknown) => void
}) {
  const block = entityBlockById(id)
  if (!block) return null
  if (id === 'divider') {
    return <hr className="border-0 border-t border-border" />
  }

  const isData = block.category === 'data'
  // A block whose live render honours inline HTML: a CONTENT block rendered by ContentBlockView (Text /
  // Callout / Quote / ...), i.e. a content-category block that is NOT one of the five design blocks (those
  // render through DesignBlockView with plain string props). Its `textarea` fields get the rich bubble; a
  // design / data block's textarea stays plain, so the editor never offers formatting the page cannot render.
  const richHost = isContentBlock(block) && !DESIGN_IDS.has(id)
  const fields = fieldsForBlock(id)
  const altKey = fields.find((f) => f.key === 'alt')?.key
  const setText = (key: string) => (next: string) => {
    const trimmed = next.replace(/<br>/gi, '').trim()
    onField(key, trimmed.length ? next : undefined)
  }

  const nodes = fields.map((f) => {
    // A single photo — a clickable slot that opens the on-canvas photo popup (its URL / alt live there).
    if (isCanvasImageField(f)) {
      const url = str(props, f.key)
      const altVal = altKey ? str(props, altKey) : ''
      return (
        <ImageSlot
          key={f.key}
          url={url}
          alt={altVal}
          uploadImage={uploadImage}
          onChange={(u, a) => {
            onField(f.key, u || undefined)
            if (altKey) onField(altKey, a || undefined)
          }}
        />
      )
    }
    // Text copy — inline-editable slots (the WYSIWYG win). Alt is excluded (set in the photo popup).
    if (isCanvasTextField(f)) {
      const value = str(props, f.key)
      const isTitle = f.key === 'title' || f.key === 'text' || f.key === 'label'
      const isEyebrow = f.key === 'eyebrow'
      const cls = isEyebrow
        ? 'text-xs font-bold uppercase tracking-[0.12em] text-subtle'
        : isTitle
          ? 'text-xl font-bold text-text'
          : 'text-base leading-relaxed text-muted'
      const rich = richHost && f.type === 'textarea'
      return (
        <div key={f.key} className={cls}>
          <SpaceEditableSlot
            value={value}
            placeholder={f.label}
            rich={rich}
            multiline={f.type === 'textarea'}
            onChange={setText(f.key)}
          />
        </div>
      )
    }
    // Features / Cards item copy — editable on the canvas (structure stays in the rail).
    if (f.type === 'features' || f.type === 'cards') {
      return <ItemsTextCanvas key={f.key} value={props[f.key]} titleKey="title" onChange={(v) => onField(f.key, v)} />
    }
    // Every other field (links / toggle / enum primitives / picker / gallery / embed) is rail-only.
    return null
  })

  return (
    <div className="space-y-3">
      {nodes}
      {isData && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-subtle">
          Your live {block.label.toLowerCase()} show here on the published page. Edit which items appear in
          this section&rsquo;s settings.
        </p>
      )}
    </div>
  )
}

'use client'

import { entityBlockById } from '@/lib/entity-blocks/registry'
import { fieldsForBlock, type FieldDef } from '@/lib/entity-blocks/block-content'
import { SpaceEditableSlot } from './space-editable-slot'

// ONE SPACE BLOCK, RENDERED TO THE LIVE WYSIWYG CANVAS. A DAWN-token React approximation of the block whose
// TEXT fields (text / textarea, plus each Features / Cards item's title + text) are inline-editable slots:
// click the copy on the page and type. Structural fields (url / image / links / toggle / the enum
// primitives / picker) are NOT here — they live in the settings-only LEFT rail (the isCoreField split,
// mirroring the Email Studio canvas). A DATA block (Offerings, Events, Team...) shows its editable
// eyebrow / title and a muted note that its live list renders on the published page (its data cannot be
// reproduced client-side). Semantic DAWN tokens throughout (no hex), voice canon (no em dashes).

const IMAGE_KEYS = new Set(['image', 'src'])

/** A field that is edited INLINE on the canvas (text copy) vs one that belongs in the LEFT rail. */
export function isCanvasTextField(f: FieldDef): boolean {
  return f.type === 'text' || f.type === 'textarea'
}
/** A single-photo field (a preview thumbnail on the canvas; its URL / upload is set in the rail). */
function isImageField(f: FieldDef): boolean {
  return (f.type === 'url' && !!f.upload) || IMAGE_KEYS.has(f.key)
}

function str(props: Record<string, unknown>, key: string): string {
  const v = props[key]
  return typeof v === 'string' ? v : ''
}

/** The read-only photo preview shown on the canvas (edited in the rail). Empty renders nothing so the
 *  block stays clean until a photo is set. */
function ImagePreview({ url }: { url: string }) {
  if (!url) return null
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset */}
      <img src={url} alt="" className="max-h-64 w-full object-cover" />
    </div>
  )
}

/** Editable per-item title + text for a Features / Cards repeater (the item's structural fields — icon /
 *  image / stat / link / reorder — stay in the rail). Persists the WHOLE items array through onChange,
 *  preserving every non-text field. Keyed by a structural signature so a rail add / remove / reorder
 *  remounts the slots while a plain keystroke keeps the key stable (no caret jump). */
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
            <ImagePreview url={image} />
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
  onField,
}: {
  id: string
  props: Record<string, unknown>
  /** Persist one content field; an empty value clears it. */
  onField: (key: string, value: unknown) => void
}) {
  const block = entityBlockById(id)
  if (!block) return null
  if (id === 'divider') {
    return <hr className="border-0 border-t border-border" />
  }

  const isData = block.category === 'data'
  const fields = fieldsForBlock(id)
  const setText = (key: string) => (next: string) => {
    const trimmed = next.trim()
    onField(key, trimmed.length ? next : undefined)
  }

  const nodes = fields.map((f) => {
    // Text copy — inline-editable slots (the WYSIWYG win).
    if (isCanvasTextField(f)) {
      const value = str(props, f.key)
      const isTitle = f.key === 'title' || f.key === 'text' || f.key === 'label'
      const isEyebrow = f.key === 'eyebrow'
      const cls = isEyebrow
        ? 'text-xs font-bold uppercase tracking-[0.12em] text-subtle'
        : isTitle
          ? 'text-xl font-bold text-text'
          : 'text-base leading-relaxed text-muted'
      return (
        <div key={f.key} className={cls}>
          <SpaceEditableSlot
            value={value}
            placeholder={f.label}
            multiline={f.type === 'textarea'}
            onChange={setText(f.key)}
          />
        </div>
      )
    }
    // A single photo — a read-only preview here (its URL / upload is a rail setting).
    if (isImageField(f)) {
      const url = str(props, f.key)
      return url ? <ImagePreview key={f.key} url={url} /> : null
    }
    // Features / Cards item copy — editable on the canvas (structure stays in the rail).
    if (f.type === 'features' || f.type === 'cards') {
      return <ItemsTextCanvas key={f.key} value={props[f.key]} titleKey="title" onChange={(v) => onField(f.key, v)} />
    }
    // Every other field (url / links / toggle / enum primitives / picker / gallery / embed) is rail-only.
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

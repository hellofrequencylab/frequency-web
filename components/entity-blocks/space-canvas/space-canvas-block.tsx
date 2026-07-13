'use client'

import { useState } from 'react'
import { ImagePlus, Pencil } from 'lucide-react'
import { entityBlockById, DESIGN_ENTITY_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { fieldsForBlock, type FieldDef } from '@/lib/entity-blocks/block-content'
import type { UploadImage } from '@/components/entity-blocks/block-edit-panel'
import { useProfileLayout } from '../profile-layout-context'
import { SpaceEditableSlot } from './space-editable-slot'
import { SpaceImagePopup } from './space-image-popup'

// ONE SPACE BLOCK, RENDERED TO THE LIVE WYSIWYG CANVAS. A DAWN-token React approximation of the block whose
// TEXT fields (text / textarea, plus each Features / Cards item's title + text) are inline-editable slots and
// whose PHOTO slots open the on-canvas photo popup — click the copy or the photo on the page and edit it right
// there (feature-for-feature with the Email Studio canvas). Structural fields (links / toggle / the enum
// primitives / picker) are NOT here; they live in the settings-only LEFT rail (the isCoreField split).
//
// LAYOUT-AWARE (2026 fix): a DESIGN block renders in its REAL published layout with the editable slots woven
// in — a Zigzag is a two-column image-beside-text grid, a Banner honours its over / beside / below display —
// so editing looks like the page and only stacks at the mobile (`sm:`) breakpoint, instead of flattening
// every block to one generic field stack. Titles use the published `font-display` face so the selected page
// style renders in edit mode. The plain content + data blocks keep the generic stack (they read fine stacked).
//
// EVERY `textarea` slot gets the rich Bold / Italic / Link bubble (matching the email canvas): the design +
// content blocks now render their body as sanitized inline HTML, so the formatting shows on the published
// page. A DATA block (Offerings, Events, Team...) shows its editable eyebrow / title and a muted note that its
// live list renders on the published page. Semantic DAWN tokens throughout (no hex), voice canon (no em dashes).

const IMAGE_KEYS = new Set(['image', 'src'])
/** The design blocks (framework-free ids from the registry). Each gets a layout-aware canvas (below) so it
 *  edits in its real shape; the text-only ones (prose / displayHeading) still render as slots but in the
 *  block's own typography. Sourced from the registry so this client module stays free of the server-side
 *  design components. */
const DESIGN_IDS: ReadonlySet<string> = new Set(DESIGN_ENTITY_BLOCK_IDS)

// ── Canvas typography, matched to the published design components so the page style shows while editing. ──
const EYEBROW_CLS = 'text-sm font-bold uppercase tracking-[0.25em] text-primary-strong'
const EYEBROW_INK_CLS = 'text-sm font-bold uppercase tracking-[0.25em] text-primary'
/** A design-block heading: the Anton display face (font-display), matching DesignHeading. */
const HEADING_CLS = 'font-display text-2xl uppercase leading-[1.05] text-text sm:text-3xl'
const HEADING_INK_CLS = 'font-display text-2xl uppercase leading-[1.05] text-on-ink sm:text-3xl'
/** The big standalone Display heading block, at a bolder clamp than an in-block heading. */
const DISPLAY_CLS = 'font-display text-3xl uppercase leading-[0.95] text-text sm:text-4xl'
const BODY_CLS = 'text-lg leading-relaxed text-muted'
const BODY_INK_CLS = 'text-lg leading-relaxed text-on-ink-muted'

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
  className,
  fill,
}: {
  url: string
  alt: string
  uploadImage?: UploadImage
  onChange: (url: string, alt: string) => void
  /** Extra classes on the trigger (e.g. an aspect / rounding to match the published crop). */
  className?: string
  /** Overlay layout: the image fills its (relative) parent instead of sizing to its own height. */
  fill?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-elevated text-sm font-medium text-subtle ${
          fill ? 'h-full' : ''
        } ${className ?? ''}`}
        style={{ minHeight: url ? undefined : 128 }}
      >
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset */}
            <img src={url} alt={alt} className={fill ? 'h-full w-full object-cover' : 'max-h-72 w-full object-cover'} />
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
 *  remounts the slots while a plain keystroke keeps the key stable (no caret jump). Each card is CLICKABLE to
 *  focus it in the rail (card-level selection): an onMouseDown on the frame selects the block AND this card's
 *  index and stops the click bubbling to the block wrapper (whose handler would clear the card focus); it
 *  never preventDefaults, so a click inside a slot still lands the caret. The selected card wears a ring. */
function ItemsTextCanvas({
  value,
  titleKey,
  selectedIndex,
  onSelectItem,
  onChange,
}: {
  value: unknown
  titleKey: 'title'
  /** The store's currently-focused item index (drives the selected ring), or null for none. */
  selectedIndex: number | null
  /** Focus this card in the rail + canvas (selects the block, then this item's index). */
  onSelectItem: (index: number) => void
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
        const selected = selectedIndex === i
        return (
          <div
            key={`${sig}-${i}`}
            // Select this card without stealing the caret: stop the bubble to the block wrapper (which would
            // clear the card focus) but never preventDefault, so a click inside a slot still focuses it.
            onMouseDown={(e) => {
              e.stopPropagation()
              onSelectItem(i)
            }}
            className={`cursor-pointer rounded-xl border p-3 transition-colors ${
              selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-border-strong'
            }`}
          >
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
  const store = useProfileLayout()
  const block = entityBlockById(id)
  if (!block) return null
  if (id === 'divider') {
    return <hr className="border-0 border-t border-border" />
  }

  const isData = block.category === 'data'
  const fields = fieldsForBlock(id)
  const fieldByKey = new Map(fields.map((f) => [f.key, f]))
  const altKey = fields.find((f) => f.key === 'alt')?.key
  const setText = (key: string) => (next: string) => {
    const trimmed = next.replace(/<br>/gi, '').trim()
    onField(key, trimmed.length ? next : undefined)
  }

  // An inline TEXT slot for a field key (or null when the block has no such field). `className` carries the
  // published typography so the selected page style renders in edit mode. EVERY `textarea` gets the rich
  // Bold / Italic / Link bubble (email-canvas parity): the content + design blocks now render inline HTML, so
  // the formatting shows on the page. A single-line `text` field stays plain.
  const textSlot = (key: string, className: string) => {
    const f = fieldByKey.get(key)
    if (!f || !isCanvasTextField(f)) return null
    return (
      <div key={key} className={className}>
        <SpaceEditableSlot
          value={str(props, key)}
          placeholder={f.label}
          rich={f.type === 'textarea'}
          multiline={f.type === 'textarea'}
          onChange={setText(key)}
        />
      </div>
    )
  }

  // A single-photo slot for a field key (opens the on-canvas photo popup; its URL / alt live there).
  const imageSlot = (key: string, opts?: { className?: string; fill?: boolean }) => {
    const f = fieldByKey.get(key)
    if (!f) return null
    return (
      <ImageSlot
        key={key}
        url={str(props, key)}
        alt={altKey ? str(props, altKey) : ''}
        uploadImage={uploadImage}
        className={opts?.className}
        fill={opts?.fill}
        onChange={(u, a) => {
          onField(key, u || undefined)
          if (altKey) onField(altKey, a || undefined)
        }}
      />
    )
  }

  // ── LAYOUT-AWARE design blocks: render in the block's REAL published shape (stacks at `sm:`). ──
  if (DESIGN_IDS.has(id)) {
    const design = designCanvas(id, props, textSlot, imageSlot)
    if (design) return design
  }

  // ── Generic field-stack path (plain content + data blocks): a vertical stack of slots. ──
  const nodes = fields.map((f) => {
    // A single photo — a clickable slot that opens the on-canvas photo popup (its URL / alt live there).
    if (isCanvasImageField(f)) {
      return imageSlot(f.key)
    }
    // Text copy — inline-editable slots (the WYSIWYG win). Alt is excluded (set in the photo popup).
    if (isCanvasTextField(f)) {
      const isTitle = f.key === 'title' || f.key === 'text' || f.key === 'label'
      const isEyebrow = f.key === 'eyebrow'
      const cls = isEyebrow
        ? 'text-xs font-bold uppercase tracking-[0.12em] text-subtle'
        : isTitle
          ? 'text-xl font-bold text-text'
          : 'text-base leading-relaxed text-muted'
      return textSlot(f.key, cls)
    }
    // Features / Cards item copy — editable on the canvas (structure stays in the rail), each card selectable.
    if (f.type === 'features' || f.type === 'cards') {
      return (
        <ItemsTextCanvas
          key={f.key}
          value={props[f.key]}
          titleKey="title"
          selectedIndex={store?.selectedItemIndex ?? null}
          onSelectItem={(i) => {
            store?.select(id)
            store?.selectItem(i)
          }}
          onChange={(v) => onField(f.key, v)}
        />
      )
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

/** The layout-aware canvas for one design block: its editable slots woven into the block's REAL published
 *  layout, so editing looks like the page. Two-column blocks stack at the mobile (`sm:`) breakpoint. Returns
 *  null for a design id with no bespoke layout (the caller falls back to the generic stack). */
function designCanvas(
  id: string,
  props: Record<string, unknown>,
  textSlot: (key: string, className: string) => React.ReactNode,
  imageSlot: (key: string, opts?: { className?: string; fill?: boolean }) => React.ReactNode,
): React.ReactNode {
  switch (id) {
    case 'zigzag': {
      // A framed photo beside a text column; `mediaSide: 'right'` puts the image second (order classes).
      const mediaRight = props.mediaSide === 'right'
      return (
        <div className="grid items-center gap-8 sm:grid-cols-2">
          <div className={mediaRight ? 'sm:order-2' : ''}>{imageSlot('image', { className: 'aspect-[4/3]' })}</div>
          <div className={`space-y-3 ${mediaRight ? 'sm:order-1' : ''}`}>
            {textSlot('eyebrow', EYEBROW_CLS)}
            {textSlot('title', HEADING_CLS)}
            {textSlot('body', BODY_CLS)}
          </div>
        </div>
      )
    }
    case 'photoHero': {
      // Honour the `display` control: below (photo over stacked copy), beside (2-col), overlay (copy over the
      // photo on a dark scrim). Overlay reads on-ink; the others read in the warm theme tokens.
      const display = props.display === 'beside' || props.display === 'below' ? props.display : 'overlay'
      if (display === 'beside') {
        return (
          <div className="grid items-center gap-8 sm:grid-cols-2">
            {imageSlot('image', { className: 'aspect-[4/3]' })}
            <div className="space-y-3">
              {textSlot('eyebrow', EYEBROW_CLS)}
              {textSlot('title', HEADING_CLS)}
              {textSlot('subtitle', BODY_CLS)}
            </div>
          </div>
        )
      }
      if (display === 'below') {
        return (
          <div className="space-y-4">
            {imageSlot('image', { className: 'aspect-[16/9]' })}
            <div className="space-y-3">
              {textSlot('eyebrow', EYEBROW_CLS)}
              {textSlot('title', HEADING_CLS)}
              {textSlot('subtitle', BODY_CLS)}
            </div>
          </div>
        )
      }
      // overlay: the photo fills a relative frame, the copy sits over it on a dark scrim (bottom-anchored).
      return (
        <div className="relative overflow-hidden rounded-xl">
          <div className="aspect-[16/9] w-full">{imageSlot('image', { className: 'aspect-[16/9]', fill: true })}</div>
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/30 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 space-y-2 p-6">
            {textSlot('eyebrow', EYEBROW_INK_CLS)}
            {textSlot('title', HEADING_INK_CLS)}
            {textSlot('subtitle', BODY_INK_CLS)}
          </div>
        </div>
      )
    }
    case 'editorial':
      return (
        <div className="space-y-3">
          {textSlot('eyebrow', EYEBROW_CLS)}
          {textSlot('title', HEADING_CLS)}
          {textSlot('body', BODY_CLS)}
        </div>
      )
    case 'accentBeat':
      // The accent beat centers its copy on the page; mirror that on the canvas so it reads true.
      return (
        <div className="space-y-3 text-center">
          {textSlot('eyebrow', EYEBROW_CLS)}
          {textSlot('title', HEADING_CLS)}
          {textSlot('body', BODY_CLS)}
        </div>
      )
    case 'prose':
      return <div>{textSlot('text', `max-w-[62ch] ${BODY_CLS}`)}</div>
    case 'displayHeading':
      return <div>{textSlot('text', DISPLAY_CLS)}</div>
    default:
      // cardGrid (a heading + subheading over the `cards` repeater) reads fine in the generic stack.
      return null
  }
}

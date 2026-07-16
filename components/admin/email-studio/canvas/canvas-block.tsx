'use client'

import { useState } from 'react'
import { ImagePlus, Package, Pencil } from 'lucide-react'
import { fieldsForBlock, featureLayout, gridColumns, type FieldDef } from '@/lib/entity-blocks/block-content'
import { DEFAULT_EMAIL_COLORS as C } from '@/lib/email-studio/render'
import { BlockIcon } from '@/components/entity-blocks/block-icon'
import { LoomImagePopup } from '../loom/loom-image-popup'
import { EditableSlot } from './editable-slot'

// ONE BLOCK, RENDERED TO THE LIVE EMAIL CANVAS (Email Studio WYSIWYG editor). A React approximation of the
// email block, styled with the SAME palette the email renderer uses (DEFAULT_EMAIL_COLORS). Its `text` /
// `textarea` content fields are inline-editable slots (click the text in the email and type). Photo slots are
// clickable and open the Loom popup (pick / upload / crop / alt). Structural fields (url / toggle / align /
// enum) and the composite fields (features / links / embed) are NOT here — they live in the LEFT rail.
//
// EMAIL PALETTE NOTE: this surface deliberately mirrors the inline-hex email look (like the live preview
// renders the real email HTML), so it reads off DEFAULT_EMAIL_COLORS literal hex rather than DAWN CSS tokens.
// That is the same waiver lib/email-studio/render.ts carries; the app CHROME around this canvas stays token-
// driven. Voice canon (no em dashes) on the visible notes.

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`

/** The role a field plays on the canvas, or null when it belongs in the LEFT rail (structural) instead. */
type Role = 'eyebrow' | 'heading' | 'quote' | 'attribution' | 'body' | 'button' | 'image' | 'features' | 'cards' | null

const IMAGE_KEYS = new Set(['image', 'src', 'images'])
const BUTTON_LABEL_KEYS = new Set(['label', 'buttonLabel', 'browseLabel'])

/** Whether a field is a photo slot (a url-with-upload field, or an images list) → the Loom popup. */
function isImageField(f: FieldDef): boolean {
  return f.type === 'images' || (f.type === 'url' && !!f.upload) || IMAGE_KEYS.has(f.key)
}

function roleFor(blockId: string, f: FieldDef): Role {
  // Alt text is set inside the image's Loom popup (as a sibling of the photo), never as its own canvas
  // slot, so it never double-renders.
  if (f.key === 'alt') return null
  if (isImageField(f)) return 'image'
  // FEATURES items + CARD-GRID cards are edited ON CANVAS (item 1): their per-item title + text are inline
  // slots here, while the non-text controls (icon / image / stat / link / button / reorder) stay in the LEFT
  // rail. links / embedUrl / picker have no canvas surface, so they stay rail-only.
  if (f.type === 'features') return 'features'
  if (f.type === 'cards') return 'cards'
  if (f.type === 'links') return null
  if (f.key === 'eyebrow') return 'eyebrow'
  if (BUTTON_LABEL_KEYS.has(f.key)) return 'button'
  if (f.key === 'by') return 'attribution'
  if (blockId === 'quote' && f.key === 'text') return 'quote'
  if (blockId === 'heading' || blockId === 'displayHeading') return f.key === 'text' ? 'heading' : 'body'
  if (f.key === 'title') return 'heading'
  if (f.type === 'text' || f.type === 'textarea') return 'body'
  // url (non-upload) / toggle / align / segmented / height / color / shadow / margin / embedUrl / picker
  return null
}

/** Read a stored string prop. Rich fields hold inline HTML; plain fields hold text. */
function str(props: Record<string, unknown>, key: string): string {
  const v = props[key]
  return typeof v === 'string' ? v : ''
}

/** A clickable photo slot on the canvas: shows the current image (or a placeholder) and opens the Loom
 *  popup to pick / upload / crop / alt. Empty value clears the slot. */
function ImageSlot({
  url,
  alt,
  onChange,
}: {
  url: string
  alt: string
  onChange: (url: string, alt: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl border text-sm font-medium"
        style={{ borderColor: C.border, color: C.subtle, background: C.surfaceElevated, minHeight: url ? undefined : 128 }}
      >
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- operator Loom asset URL, not a build asset */}
            <img src={url} alt={alt} className="max-h-72 w-full object-cover" />
            <span
              className="absolute right-2 top-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
              style={{ background: C.surface, color: C.text }}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Change
            </span>
          </>
        ) : (
          <span className="flex items-center gap-2 py-8">
            <ImagePlus className="h-4 w-4" aria-hidden /> Add photo
          </span>
        )}
      </button>
      <LoomImagePopup
        open={open}
        currentUrl={url}
        currentAlt={alt}
        onClose={() => setOpen(false)}
        onSelect={onChange}
      />
    </>
  )
}

/** An empty-state hint pointing the operator at the block's settings tile to add the first row. */
function EmptyItemsHint({ label }: { label: string }) {
  return (
    <p className="text-sm italic" style={{ color: C.subtle }}>
      Add {label.toLowerCase()} in this block&rsquo;s settings.
    </p>
  )
}

/** The EDITABLE Features list on the canvas (item 1): each item's title + text are inline slots; the icon is a
 *  read-only preview (chosen with the rail's icon picker). Rows are added / removed / reordered in the LEFT
 *  rail. Persists the WHOLE items array through onChange, preserving every non-text field of each item.
 *  Robustness: the mapped slots are keyed by a STRUCTURAL signature (icon + link, the rail-owned fields) so a
 *  rail reorder / add / remove remounts + re-seeds the slots, while a plain text keystroke leaves the key
 *  stable (no caret jump). No effects, no set-state-in-effect. */
function FeaturesCanvas({ label, value, cols, onChange }: { label: string; value: unknown; cols: number; onChange: (v: unknown) => void }) {
  const items: Array<Record<string, unknown>> = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
  if (items.length === 0) return <EmptyItemsHint label={label} />
  const sig = items.map((it) => `${typeof it.icon === 'string' ? it.icon : ''}~${typeof it.link === 'string' ? it.link : ''}`).join('|')
  const patch = (i: number, key: 'title' | 'text', next: string) => {
    const nextItems = items.map((it, j) => (j === i ? { ...it, [key]: next } : it))
    onChange(nextItems)
  }
  // Honor the block's selected column count (2 / 3 / 4). `minmax(0, 1fr)` lets the columns shrink to fit a
  // narrow canvas rather than overflow, so the preview stays responsive AND matches the email (which renders
  // the same N-up grid). A `list` layout collapses to a single column (cols === 1) here.
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map((it, i) => {
        const icon = typeof it.icon === 'string' ? it.icon : ''
        const title = typeof it.title === 'string' ? it.title : ''
        const text = typeof it.text === 'string' ? it.text : ''
        return (
          <div key={`${sig}-${i}`} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            {icon && (
              <div style={{ color: C.primaryStrong, marginBottom: 6 }}>
                <BlockIcon name={icon} size={22} />
              </div>
            )}
            <div className="text-base font-bold" style={{ color: C.text }}>
              <EditableSlot value={title} placeholder="Title" rich={false} onChange={(v) => patch(i, 'title', v)} />
            </div>
            <div className="mt-0.5 text-sm leading-relaxed" style={{ color: C.muted }}>
              <EditableSlot value={text} placeholder="Description" rich={false} onChange={(v) => patch(i, 'text', v)} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The EDITABLE Card-grid list on the canvas (item 1 + item 3): each card's title + text are inline slots; the
 *  photo OR stat is a read-only preview (set in the rail). Styled distinctly from Features (a photo on top, or a
 *  big stat number) so the two blocks read apart. Same structural-signature keying as FeaturesCanvas so rail
 *  edits remount cleanly while typing stays stable. */
function CardsCanvas({ label, value, onChange }: { label: string; value: unknown; onChange: (v: unknown) => void }) {
  const cards: Array<Record<string, unknown>> = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
  if (cards.length === 0) return <EmptyItemsHint label={label} />
  const sig = cards
    .map((c) => {
      const stat = (c.stat && typeof c.stat === 'object' ? c.stat : {}) as Record<string, unknown>
      const btn = (c.button && typeof c.button === 'object' ? c.button : {}) as Record<string, unknown>
      return [c.image, stat.value, stat.label, c.link, btn.label, btn.href].map((x) => (typeof x === 'string' ? x : '')).join('~')
    })
    .join('|')
  const patch = (i: number, key: 'title' | 'text', next: string) => {
    onChange(cards.map((c, j) => (j === i ? { ...c, [key]: next } : c)))
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((c, i) => {
        const image = typeof c.image === 'string' ? c.image : ''
        const stat = (c.stat && typeof c.stat === 'object' ? c.stat : {}) as Record<string, unknown>
        const statValue = typeof stat.value === 'string' ? stat.value : ''
        const statLabel = typeof stat.label === 'string' ? stat.label : ''
        const title = typeof c.title === 'string' ? c.title : ''
        const text = typeof c.text === 'string' ? c.text : ''
        const btn = (c.button && typeof c.button === 'object' ? c.button : {}) as Record<string, unknown>
        const btnLabel = typeof btn.label === 'string' ? btn.label : ''
        return (
          <div key={`${sig}-${i}`} style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.surface }}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- operator Loom / URL asset, not a build asset
              <img src={image} alt="" style={{ display: 'block', width: '100%', height: 120, objectFit: 'cover' }} />
            ) : statValue || statLabel ? (
              <div style={{ padding: '18px 16px 6px', background: C.surfaceElevated }}>
                <div className="text-3xl font-black" style={{ color: C.primaryStrong, lineHeight: 1 }}>{statValue || '000'}</div>
                {statLabel && <div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: C.subtle }}>{statLabel}</div>}
              </div>
            ) : null}
            <div style={{ padding: 14 }}>
              <div className="text-base font-bold" style={{ color: C.text }}>
                <EditableSlot value={title} placeholder="Card title" rich={false} onChange={(v) => patch(i, 'title', v)} />
              </div>
              <div className="mt-0.5 text-sm leading-relaxed" style={{ color: C.muted }}>
                <EditableSlot value={text} placeholder="Card text" rich={false} onChange={(v) => patch(i, 'text', v)} />
              </div>
              {btnLabel && (
                <span className="mt-2 inline-flex rounded-md px-3 py-1.5 text-xs font-bold" style={{ background: C.primary, color: C.onPrimary }}>
                  {btnLabel}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The data-bound PRODUCT CARD preview (Email Studio Phase 4). Read-only on the canvas: its photo / title /
 *  price / link come from the picked product (set in the LEFT rail via the search-by-owner picker) and refresh
 *  from the live catalog at send time, so there is nothing to type here. Shows an empty-state prompt until a
 *  product is chosen. */
function ProductCardCanvas({ props }: { props: Record<string, unknown> }) {
  const title = str(props, 'title')
  const price = str(props, 'price')
  const image = str(props, 'image')
  const cta = str(props, 'ctaLabel') || 'View product'
  const hasProduct = !!(props.product && typeof props.product === 'object')
  if (!hasProduct && !title && !image) {
    return (
      <div
        className="flex flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-8 text-center"
        style={{ borderColor: C.border, color: C.subtle }}
      >
        <Package className="h-5 w-5" aria-hidden />
        <p className="text-sm font-medium">Pick a product in this block&rsquo;s settings.</p>
        <p className="text-xs">Search a maker or Space, then choose one of their products.</p>
      </div>
    )
  }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', background: C.surface }}>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- operator catalog asset URL, not a build asset
        <img src={image} alt={title} style={{ display: 'block', width: '100%', maxHeight: 240, objectFit: 'cover' }} />
      )}
      <div style={{ padding: 16 }}>
        <div className="text-lg font-bold" style={{ color: C.text }}>{title || 'Product title'}</div>
        {price && <div className="mt-0.5 text-base font-bold" style={{ color: C.primaryStrong }}>{price}</div>}
        <span className="mt-3 inline-flex rounded-lg px-5 py-2.5 text-sm font-bold" style={{ background: C.primary, color: C.onPrimary }}>
          {cta}
        </span>
      </div>
    </div>
  )
}

export function CanvasBlock({
  id,
  props,
  onField,
}: {
  id: string
  props: Record<string, unknown>
  /** Persist one content field; an empty value clears it. A string for text/url slots, or a string[] for an
   *  images-list field. */
  onField: (key: string, value: unknown) => void
}) {
  if (id === 'divider') {
    return <hr style={{ border: 0, borderTop: `1px solid ${C.border}`, margin: '4px 0' }} />
  }

  // The Product card is DATA-BOUND: it renders a read-only preview here and is edited entirely in the rail.
  if (id === 'productCard') {
    return <ProductCardCanvas props={props} />
  }

  const fields = fieldsForBlock(id)
  const set = (key: string) => (next: string) => {
    const trimmed = next.replace(/<br>/gi, '').trim()
    onField(key, trimmed.length ? next : undefined)
  }

  const nodes = fields.map((f) => {
    const role = roleFor(id, f)
    if (role === null) return null
    const value = str(props, f.key)
    const rich = f.type === 'textarea'
    const key = f.key

    switch (role) {
      case 'image': {
        // The photo's alt lives on a sibling text field (key 'alt'); an images-list field stores a string[].
        const altKey = fields.find((x) => x.key === 'alt')?.key
        const isArr = f.type === 'images'
        const raw = props[f.key]
        const current = isArr
          ? (Array.isArray(raw) ? String(raw[0] ?? '') : '')
          : typeof raw === 'string'
            ? raw
            : ''
        const altVal = altKey ? str(props, altKey) : ''
        return (
          <ImageSlot
            key={key}
            url={current}
            alt={altVal}
            onChange={(u, a) => {
              onField(f.key, u ? (isArr ? [u] : u) : undefined)
              if (altKey) onField(altKey, a || undefined)
            }}
          />
        )
      }
      case 'eyebrow':
        return (
          <EditableSlot
            key={key}
            value={value}
            placeholder={f.label}
            rich={false}
            className="text-xs font-bold uppercase tracking-[0.12em]"
            onChange={set(key)}
          />
        )
      case 'heading':
        // DAWN `--color-text` warm charcoal (C.text, #3D352A) at semibold — a dark brown, not a heavy black
        // slab (was font-extrabold). Matches the softened Header blocks in the compiled email.
        return (
          <div key={key} style={{ fontFamily: FONT, color: C.text }}>
            <EditableSlot value={value} placeholder={f.label} rich={rich} className="text-2xl font-semibold leading-tight" onChange={set(key)} />
          </div>
        )
      case 'quote':
        return (
          <div key={key} style={{ borderLeft: `3px solid ${C.primary}`, paddingLeft: 16, color: C.text }}>
            <EditableSlot value={value} placeholder={f.label} rich className="text-lg italic leading-snug" onChange={set(key)} />
          </div>
        )
      case 'attribution':
        return (
          <div key={key} style={{ color: C.muted }}>
            <EditableSlot value={value} placeholder={f.label} rich={false} className="text-sm" onChange={set(key)} />
          </div>
        )
      case 'button':
        return (
          <div key={key} className="flex">
            <span
              className="inline-flex rounded-lg px-6 py-3 text-sm font-bold"
              style={{ background: C.primary, color: C.onPrimary }}
            >
              <EditableSlot value={value} placeholder={f.label} rich={false} onChange={set(key)} />
            </span>
          </div>
        )
      case 'features': {
        // The Features grid honors its selected column count. The grid layouts (columns / cards / stats) go
        // 2 / 3 / 4 up; list + spotlight stack single-column (cols 1) — mirroring the email renderer exactly.
        const fLayout = featureLayout(props)
        const featureCols = fLayout === 'columns' || fLayout === 'cards' || fLayout === 'stats' ? gridColumns(props) : 1
        return <FeaturesCanvas key={key} label={f.label} value={props[f.key]} cols={featureCols} onChange={(v) => onField(f.key, v)} />
      }
      case 'cards':
        return <CardsCanvas key={key} label={f.label} value={props[f.key]} onChange={(v) => onField(f.key, v)} />
      case 'body':
      default:
        return (
          <div key={key} style={{ color: C.muted }}>
            <EditableSlot value={value} placeholder={f.label} rich={rich} className="text-base leading-relaxed" onChange={set(key)} />
          </div>
        )
    }
  })

  return <div className="space-y-3" style={{ fontFamily: FONT }}>{nodes}</div>
}

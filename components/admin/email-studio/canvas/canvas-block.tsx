'use client'

import { useState } from 'react'
import { ImagePlus, Pencil } from 'lucide-react'
import { fieldsForBlock, type FieldDef } from '@/lib/entity-blocks/block-content'
import { DEFAULT_EMAIL_COLORS as C } from '@/lib/email-studio/render'
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
type Role = 'eyebrow' | 'heading' | 'quote' | 'attribution' | 'body' | 'button' | 'image' | null

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
  // features / links / embedUrl / picker are edited in the LEFT rail (structural), not on the canvas.
  if (f.type === 'features' || f.type === 'links') return null
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
        return (
          <div key={key} style={{ fontFamily: FONT, color: C.text }}>
            <EditableSlot value={value} placeholder={f.label} rich={rich} className="text-2xl font-extrabold leading-tight" onChange={set(key)} />
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

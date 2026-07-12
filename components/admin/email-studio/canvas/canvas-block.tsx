'use client'

import { ImagePlus } from 'lucide-react'
import { fieldsForBlock, type FieldDef } from '@/lib/entity-blocks/block-content'
import { DEFAULT_EMAIL_COLORS as C } from '@/lib/email-studio/render'
import { EditableSlot } from './editable-slot'

// ONE BLOCK, RENDERED TO THE LIVE EMAIL CANVAS (Email Studio WYSIWYG prototype, Slice A). A React
// approximation of the email block, styled with the SAME palette the email renderer uses
// (DEFAULT_EMAIL_COLORS). Its `text` / `textarea` content fields are inline-editable slots (click the text in
// the email and type). Structural fields (url / toggle / align / enum) are NOT here — they live in the LEFT
// rail. Image fields are a disabled "Add photo" stub (Slice B). Composite fields (features / links / cards)
// stay rail-edited for Slice A and show a muted note here.
//
// EMAIL PALETTE NOTE: this surface deliberately mirrors the inline-hex email look (like the live preview
// renders the real email HTML), so it reads off DEFAULT_EMAIL_COLORS literal hex rather than DAWN CSS tokens.
// That is the same waiver lib/email-studio/render.ts carries; the app CHROME around this canvas stays token-
// driven. Voice canon (no em dashes) on the visible notes.

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`

/** The role a field plays on the canvas, or null when it belongs in the LEFT rail (structural) instead. */
type Role = 'eyebrow' | 'heading' | 'quote' | 'attribution' | 'body' | 'button' | 'image' | 'deferred' | null

const IMAGE_STUB_KEYS = new Set(['image', 'src', 'images'])
const BUTTON_LABEL_KEYS = new Set(['label', 'buttonLabel', 'browseLabel'])

/** Whether a field is a photo slot (a url-with-upload field, or an images list) → the Slice B stub. */
function isImageField(f: FieldDef): boolean {
  return f.type === 'images' || (f.type === 'url' && !!f.upload) || IMAGE_STUB_KEYS.has(f.key)
}

function roleFor(blockId: string, f: FieldDef): Role {
  if (isImageField(f)) return 'image'
  if (f.type === 'features' || f.type === 'links') return 'deferred'
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

function ImageStub() {
  return (
    <button
      type="button"
      disabled
      className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm font-medium"
      style={{ borderColor: C.border, color: C.subtle, background: C.surfaceElevated }}
    >
      <ImagePlus className="h-4 w-4" aria-hidden />
      Add photo (coming in Slice B)
    </button>
  )
}

export function CanvasBlock({
  id,
  props,
  onField,
}: {
  id: string
  props: Record<string, unknown>
  /** Persist one content field; an empty value clears it. */
  onField: (key: string, value: string | undefined) => void
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
      case 'image':
        return <ImageStub key={key} />
      case 'deferred':
        return (
          <p key={key} className="rounded-lg border border-dashed px-3 py-2 text-xs" style={{ borderColor: C.border, color: C.subtle, background: C.surfaceElevated }}>
            {f.label} are edited in the left settings (Slice A)
          </p>
        )
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

'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronDown, ChevronUp, Loader2, Plus, Upload, X } from 'lucide-react'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { fieldsForBlock, type BlockStyle, type FieldDef } from '@/lib/entity-blocks/block-content'

/** A gated server upload: returns the uploaded image's public URL, or a plain error. Injected by the
 *  SPACE builder (wired to the space-scoped upload action); absent on surfaces without an upload path. */
export type UploadImage = (file: File) => Promise<{ url: string } | { error: string }>

// THE INLINE BLOCK EDIT PANEL (ADR-528). Expands under a block in the in-rail builder when the operator
// clicks it. CONTENT blocks get their authored fields (text / link / image / ...); DATA blocks get an
// on/off switch + a couple of quick fields (title / intro) + a link to that feature's own manager. Every
// block gets the STYLE controls (card background, spacing, alignment). Controlled: it holds no state, it
// reads the block's current content/style bag and calls back on every change (the builder applies it to
// the shared store, which repaints + debounce-saves). Semantic DAWN tokens, no hex, voice canon.

const inputCls =
  'w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-subtle outline-none focus:border-primary'
const labelCls = 'block text-2xs font-semibold uppercase tracking-wide text-subtle'

export function BlockEditPanel({
  id,
  content,
  style,
  hidden,
  editHref,
  uploadImage,
  onContent,
  onStyle,
  onToggleHide,
}: {
  id: string
  content: Record<string, unknown>
  style: BlockStyle
  hidden: boolean
  /** For a DATA block: the href of that feature's own manager ("Manage Offerings"), or null. */
  editHref: string | null
  /** Gated image upload (SPACE only); when present, image fields show an Upload control (ADR-542). */
  uploadImage?: UploadImage
  onContent: (next: Record<string, unknown>) => void
  onStyle: (next: BlockStyle) => void
  onToggleHide: () => void
}) {
  const block = entityBlockById(id)
  const isData = block?.category === 'data'
  const fields = fieldsForBlock(id)

  const setField = (key: string, value: unknown) => {
    const next = { ...content }
    const empty =
      value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
    if (empty) delete next[key]
    else next[key] = value
    onContent(next)
  }

  return (
    <div className="mt-1 space-y-3 rounded-lg border border-border bg-surface-elevated/50 p-3">
      {/* DATA block: on/off */}
      {isData && (
        <label className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-text">Show on page</span>
          <input
            type="checkbox"
            checked={!hidden}
            onChange={onToggleHide}
            className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
          />
        </label>
      )}

      {/* Fields */}
      {fields.map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          value={content[field.key]}
          uploadImage={uploadImage}
          onChange={(v) => setField(field.key, v)}
        />
      ))}

      {/* DATA block: deep-edit link to the feature's own manager */}
      {isData && editHref && (
        <Link
          href={editHref}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
        >
          Manage {block?.label ?? 'this section'}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}

      {/* Style controls (every block) */}
      <StyleControls style={style} onChange={onStyle} />
    </div>
  )
}

/** One field editor, dispatched by field type. */
function FieldEditor({
  field,
  value,
  uploadImage,
  onChange,
}: {
  field: FieldDef
  value: unknown
  uploadImage?: UploadImage
  onChange: (v: unknown) => void
}) {
  if (field.type === 'text' || field.type === 'url') {
    const str = typeof value === 'string' ? value : ''
    const canUpload = field.upload && !!uploadImage
    return (
      <label className="block space-y-1">
        <span className={labelCls}>{field.label}</span>
        <input
          type={field.type === 'url' ? 'url' : 'text'}
          value={str}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
        {canUpload && uploadImage && (
          <UploadButton uploadImage={uploadImage} onUploaded={(urls) => onChange(urls[urls.length - 1])} />
        )}
      </label>
    )
  }
  if (field.type === 'textarea') {
    return (
      <label className="block space-y-1">
        <span className={labelCls}>{field.label}</span>
        <textarea
          rows={3}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      </label>
    )
  }
  if (field.type === 'images') {
    return <ImagesEditor label={field.label} value={value} uploadImage={field.upload ? uploadImage : undefined} onChange={onChange} />
  }
  if (field.type === 'features') {
    return <FeaturesEditor label={field.label} value={value} onChange={onChange} />
  }
  // links
  return <LinksEditor label={field.label} value={value} onChange={onChange} />
}

/** The image-list editor (ADR-542): the pasteable "one URL per line" textarea PLUS an Upload control that
 *  appends each uploaded image's URL, so a single "Image gallery" block takes one or many images by upload
 *  or link. Empty lines are dropped; the value is always a clean string[]. */
function ImagesEditor({
  label,
  value,
  uploadImage,
  onChange,
}: {
  label: string
  value: unknown
  uploadImage?: UploadImage
  onChange: (v: unknown) => void
}) {
  const urls: string[] = Array.isArray(value) ? (value as unknown[]).filter((v): v is string => typeof v === 'string') : []
  const text = urls.join('\n')
  return (
    <div className="space-y-1.5">
      <span className={labelCls}>{label}</span>
      <textarea
        rows={3}
        value={text}
        placeholder="One image URL per line"
        onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
        className={inputCls}
      />
      {uploadImage && (
        <UploadButton
          uploadImage={uploadImage}
          multiple
          label="Upload images"
          onUploaded={(added) => onChange([...urls, ...added])}
        />
      )}
    </div>
  )
}

/** The Features editor (ADR-542): a repeater of {icon, title, text} items with add / remove / reorder. The
 *  icon is a short token (an emoji or a word); title + text are free text. Empty items are pruned on write. */
function FeaturesEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange: (v: unknown) => void
}) {
  const items: Array<{ icon: string; title: string; text: string }> = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>).map((it) => ({
        icon: typeof it.icon === 'string' ? it.icon : '',
        title: typeof it.title === 'string' ? it.title : '',
        text: typeof it.text === 'string' ? it.text : '',
      }))
    : []
  const update = (next: Array<{ icon: string; title: string; text: string }>) =>
    onChange(next.filter((it) => it.icon || it.title || it.text))
  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    update(next)
  }
  return (
    <div className="space-y-1.5">
      <span className={labelCls}>{label}</span>
      {items.map((it, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-border bg-surface p-2">
          <div className="flex items-center gap-1.5">
            <input
              value={it.icon}
              placeholder="Icon or emoji"
              onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)))}
              className={`${inputCls} w-24`}
            />
            <input
              value={it.title}
              placeholder="Title"
              onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              className={inputCls}
            />
          </div>
          <textarea
            rows={2}
            value={it.text}
            placeholder="Description"
            onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            className={inputCls}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Move feature ${i + 1} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
              className="rounded p-1 text-subtle hover:text-text disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Move feature ${i + 1} down`}
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
              className="rounded p-1 text-subtle hover:text-text disabled:opacity-30"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Remove feature ${i + 1}`}
              onClick={() => update(items.filter((_, j) => j !== i))}
              className="ml-auto rounded p-1 text-subtle hover:bg-danger-bg hover:text-danger"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => update([...items, { icon: '', title: '', text: '' }])}
        className="inline-flex items-center gap-1 text-2xs font-semibold text-primary-strong hover:underline"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add feature
      </button>
    </div>
  )
}

/** The inline image UPLOAD control (ADR-542): picks a file (or several when `multiple`), runs it through the
 *  injected gated server upload, and hands back the resulting public URL(s). Reuses the space cover/logo
 *  upload path (event-media, service-role) via the injected action; it invents no bucket of its own. */
function UploadButton({
  uploadImage,
  multiple = false,
  label = 'Upload image',
  onUploaded,
}: {
  uploadImage: UploadImage
  multiple?: boolean
  label?: string
  onUploaded: (urls: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle(files: FileList) {
    setBusy(true)
    setError(null)
    const urls: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError('Choose an image file.')
        continue
      }
      const res = await uploadImage(file)
      if ('error' in res) {
        setError(res.error)
        continue
      }
      urls.push(res.url)
    }
    if (urls.length) onUploaded(urls)
    setBusy(false)
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 text-2xs font-semibold text-primary-strong hover:underline disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
        {busy ? 'Uploading' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length) void handle(e.target.files)
          e.target.value = ''
        }}
      />
      {error && <p className="text-2xs text-danger">{error}</p>}
    </div>
  )
}

/** The link-list editor: a row of {label, url} pairs with add / remove. */
function LinksEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: unknown
  onChange: (v: unknown) => void
}) {
  const items: Array<{ label: string; url: string }> = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>).map((it) => ({
        label: typeof it.label === 'string' ? it.label : '',
        url: typeof it.url === 'string' ? it.url : '',
      }))
    : []
  const update = (next: Array<{ label: string; url: string }>) =>
    onChange(next.filter((it) => it.url || it.label))
  return (
    <div className="space-y-1.5">
      <span className={labelCls}>{label}</span>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={it.label}
            placeholder="Label"
            onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            className={`${inputCls} w-1/3`}
          />
          <input
            value={it.url}
            placeholder="https://"
            onChange={(e) => update(items.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
            className={inputCls}
          />
          <button
            type="button"
            aria-label={`Remove link ${i + 1}`}
            onClick={() => update(items.filter((_, j) => j !== i))}
            className="shrink-0 rounded p-1 text-subtle hover:bg-danger-bg hover:text-danger"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => update([...items, { label: '', url: '' }])}
        className="inline-flex items-center gap-1 text-2xs font-semibold text-primary-strong hover:underline"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add link
      </button>
    </div>
  )
}

/** The per-block style controls: background on/off, spacing step, alignment. */
function StyleControls({ style, onChange }: { style: BlockStyle; onChange: (next: BlockStyle) => void }) {
  const set = (patch: Partial<BlockStyle>) => {
    const next: BlockStyle = { ...style, ...patch }
    if (!next.background) delete next.background
    if (next.pad === 'none') delete next.pad
    if (next.align === 'start') delete next.align
    onChange(next)
  }
  // Style is secondary to content, so it collapses behind a "Style" disclosure (closed by default) — the
  // panel leads with the block's content / quick fields, and the look controls are one tap away.
  return (
    <details className="border-t border-border pt-2 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer select-none text-2xs font-semibold uppercase tracking-wide text-subtle">
        Style
      </summary>
      <div className="mt-2 space-y-2">
        <label className="flex items-center justify-between gap-2">
          <span className="text-xs text-text">White background</span>
          <input
            type="checkbox"
            checked={style.background === true}
            onChange={(e) => set({ background: e.target.checked })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-border-strong/30"
          />
        </label>
        <Segmented
          aria="Spacing"
          options={[
            { v: 'none', label: 'None' },
            { v: 'sm', label: 'S' },
            { v: 'md', label: 'M' },
            { v: 'lg', label: 'L' },
          ]}
          value={style.pad ?? 'none'}
          onSelect={(v) => set({ pad: v as BlockStyle['pad'] })}
        />
        <Segmented
          aria="Alignment"
          options={[
            { v: 'start', label: 'Left' },
            { v: 'center', label: 'Center' },
            { v: 'end', label: 'Right' },
          ]}
          value={style.align ?? 'start'}
          onSelect={(v) => set({ align: v as BlockStyle['align'] })}
        />
      </div>
    </details>
  )
}

function Segmented({
  aria,
  options,
  value,
  onSelect,
}: {
  aria: string
  options: { v: string; label: string }[]
  value: string
  onSelect: (v: string) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label={aria}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onSelect(o.v)}
          className={`flex-1 px-1.5 py-1 text-2xs font-semibold ${
            value === o.v ? 'bg-primary text-on-primary' : 'bg-surface text-muted hover:bg-surface-elevated'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, ChevronDown, ChevronUp, Loader2, Plus, Upload, X } from 'lucide-react'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import {
  blockBearsText,
  blockDrawsOwnCard,
  fieldsForBlock,
  primitiveValues,
  type BlockStyle,
  type FieldDef,
  type MarginStep,
  type TextColorToken,
  type TextShadowStep,
  type TextSizeStep,
  type TextStyle,
  type TextWeightStep,
} from '@/lib/entity-blocks/block-content'
import {
  AlignControl,
  ButtonOrientationControl,
  ColorControl,
  ControlGroup,
  ControlRow,
  HeightControl,
  MarginControl,
  PickerControl,
  Segmented,
  ShadowControl,
  ToggleRow,
  type AlignValue,
  type BlockPickerData,
  type ButtonOrientationValue,
  type HeightValue,
  type ShadowValue,
} from './controls/field-controls'

/** A gated server upload: returns the uploaded image's public URL, or a plain error. Injected by the
 *  SPACE builder (wired to the space-scoped upload action); absent on surfaces without an upload path. */
export type UploadImage = (file: File) => Promise<{ url: string } | { error: string }>

// THE INLINE BLOCK EDIT PANEL — redesigned control surface (ADR-528 → ADR-569). Expands under a block in the
// in-rail builder when the operator clicks it. A TIGHT, modern inspector (Framer/Webflow/Notion density): the
// panel LEADS with the block's content fields, then a compact CONTENT/STYLE control stack of segmented +
// icon-button + minimal-switch primitives (components/entity-blocks/controls). The look controls live in
// collapsible groups so the panel stays short.
//
// CONTENT blocks get their authored fields (text / link / image / ...); DATA blocks get a minimal on/off
// switch + their real eyebrow / title (+ body for About/Story) + a link to that feature's own manager. Every
// text-bearing block gets the C1 TEXT-STYLE group (size / weight / align / token-color / shadow). Every block
// gets the STYLE controls (background switch, padding, alignment, C3 margins).
//
// A feature agent adds a control to a block by DECLARING a field in block-content.ts (the enum primitives:
// segmented / align / height / buttonOrientation / color / shadow / margin) — the panel dispatches on `type`
// and needs no bespoke JSX. Controlled: it holds no state, reads the block's current content/style bag and
// calls back on every change (the builder applies it to the shared store, which repaints + debounce-saves).
// Semantic DAWN tokens, no hex, voice canon (no em dashes).

const inputCls =
  'w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-subtle outline-none focus:border-primary'
const labelCls = 'block text-2xs font-semibold uppercase tracking-wide text-subtle'

/** The value keys a `text` control targets on the style.text bag (kept off the content bag so the render
 *  frame owns them). Everything else on a field schema is a content-bag key. */
const TEXT_STYLE_SIZE_OPTIONS = [
  { value: 'sm' as TextSizeStep, label: 'S' },
  { value: 'md' as TextSizeStep, label: 'M' },
  { value: 'lg' as TextSizeStep, label: 'L' },
  { value: 'xl' as TextSizeStep, label: 'XL' },
]
const TEXT_STYLE_WEIGHT_OPTIONS = [
  { value: 'normal' as TextWeightStep, label: 'Light' },
  { value: 'medium' as TextWeightStep, label: 'Medium' },
  { value: 'semibold' as TextWeightStep, label: 'Semibold' },
  { value: 'bold' as TextWeightStep, label: 'Bold' },
]

export function BlockEditPanel({
  id,
  content,
  style,
  hidden,
  editHref,
  pickerData,
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
  /** For a function-backed block: the picker payload (ADR-573 item 5) — the Space's live items + create
   *  link. Feeds any `picker` field; absent for a block with no data source. */
  pickerData?: BlockPickerData
  /** Gated image upload (SPACE only); when present, image fields show an Upload control (ADR-542). */
  uploadImage?: UploadImage
  onContent: (next: Record<string, unknown>) => void
  onStyle: (next: BlockStyle) => void
  onToggleHide: () => void
}) {
  const block = entityBlockById(id)
  const isData = block?.category === 'data'
  const fields = fieldsForBlock(id)
  const bearsText = blockBearsText(id)
  // About + Story carry the space's shared story text. The editor pre-fills these fields with the current
  // content (the same words the page shows), so a note tells the operator that editing here updates the
  // section everywhere it appears — not a second, disconnected copy.
  const sharesStory = id === 'about' || id === 'story'

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
      {/* DATA block: a minimal on/off switch (redesigned from the verbose checkbox). */}
      {isData && <ToggleRow label="Show on page" checked={!hidden} onChange={onToggleHide} />}

      {/* Fields (content + any declared primitive controls) */}
      {fields.map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          value={content[field.key]}
          uploadImage={uploadImage}
          pickerData={pickerData}
          onChange={(v) => setField(field.key, v)}
        />
      ))}

      {/* About + Story: the text above is the space's shared story. Editing it here updates it everywhere. */}
      {sharesStory && (
        <p className="text-2xs leading-relaxed text-subtle">
          This is your space&rsquo;s story. Edit it here and it updates everywhere it shows.
        </p>
      )}

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

      {/* ── The control stack (redesigned): Text style (C1) · Style · Spacing (C3), grouped + collapsible. */}
      {bearsText && <TextStyleGroup style={style} onChange={onStyle} />}
      <StyleControls id={id} style={style} onChange={onStyle} />
      <MarginGroup style={style} onChange={onStyle} />
    </div>
  )
}

/** One field editor, dispatched by field type. Content types render an input / repeater; the ADR-569 C6
 *  primitive types render a control-row over the declared enum, so a feature agent gets its control by just
 *  declaring the field. Exported so the pinned Hero editor (which is NOT a rows-model block, but reuses the
 *  same declarative FieldDef kit) dispatches every field through the SAME control surface — no bespoke JSX. */
export function FieldEditor({
  field,
  value,
  uploadImage,
  pickerData,
  onChange,
}: {
  field: FieldDef
  value: unknown
  uploadImage?: UploadImage
  pickerData?: BlockPickerData
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
  if (field.type === 'toggle') {
    // A minimal switch (Fix 8: "show this button"). Defaults to the field default when unset; toggling back
    // to the default passes `undefined` so setField deletes the key, keeping the stored bag sparse.
    const def = field.default ?? false
    const on = typeof value === 'boolean' ? value : def
    return (
      <ToggleRow
        label={field.label}
        checked={on}
        onChange={(next) => onChange(next === def ? undefined : next)}
      />
    )
  }
  // ── ADR-573 item 5: the function-aware DATA-SOURCE picker. Its choices are the Space's live items (from
  //    the seed's pickerData), not a fixed enum; an empty function shows the create link. Fail-safe: no
  //    pickerData (a non-function-backed block, or a read miss) renders nothing here. ──
  if (field.type === 'picker') {
    const selected = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
    return (
      <PickerControl
        label={field.label}
        items={pickerData?.items ?? []}
        selected={selected}
        createHref={pickerData?.createHref}
        createLabel={pickerData?.createLabel}
        onChange={(next) => onChange(next.length ? next : undefined)}
      />
    )
  }
  // ── ADR-569 C6 enum primitives: one control-row over the declared value set. ──
  if (
    field.type === 'segmented' ||
    field.type === 'align' ||
    field.type === 'height' ||
    field.type === 'buttonOrientation' ||
    field.type === 'color' ||
    field.type === 'shadow' ||
    field.type === 'margin'
  ) {
    return <PrimitiveField field={field} value={value} onChange={onChange} />
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

/** Render a declared enum PRIMITIVE (ADR-569 C6) as a labelled control row. The value is stored on the
 *  CONTENT bag under the field key; toggling back to the declared default passes `undefined` so the key
 *  drops (sparse). A feature agent gets any of these by declaring the field type — no bespoke JSX. */
function PrimitiveField({
  field,
  value,
  onChange,
}: {
  field: FieldDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  const allowed = primitiveValues(field) ?? []
  const def = field.defaultValue ?? allowed[0] ?? ''
  const current = typeof value === 'string' && allowed.includes(value) ? value : def
  const set = (v: string) => onChange(v === def ? undefined : v)

  if (field.type === 'align') {
    return (
      <ControlRow label={field.label}>
        <AlignControl value={current as AlignValue} onSelect={set} />
      </ControlRow>
    )
  }
  if (field.type === 'height') {
    return (
      <ControlRow label={field.label}>
        <HeightControl value={current as HeightValue} onSelect={set} />
      </ControlRow>
    )
  }
  if (field.type === 'buttonOrientation') {
    return (
      <ControlRow label={field.label}>
        <ButtonOrientationControl value={current as ButtonOrientationValue} onSelect={set} />
      </ControlRow>
    )
  }
  if (field.type === 'color') {
    return (
      <ControlRow label={field.label}>
        <ColorControl value={current as TextColorToken} onSelect={set} />
      </ControlRow>
    )
  }
  if (field.type === 'shadow') {
    return (
      <ControlRow label={field.label}>
        <ShadowControl value={current as ShadowValue} onSelect={set} />
      </ControlRow>
    )
  }
  // `segmented` + `margin` both render a generic segmented bar over the declared options.
  const options =
    field.type === 'margin'
      ? (allowed as MarginStep[]).map((v) => ({ value: v, label: v === 'none' ? 'None' : v.toUpperCase() }))
      : (field.options ?? allowed.map((v) => ({ value: v, label: v })))
  return (
    <ControlRow label={field.label}>
      <Segmented ariaLabel={field.label} options={options} value={current} onSelect={set} />
    </ControlRow>
  )
}

/** The C1 TEXT-STYLE group: size · weight · align · color · shadow, in a collapsible section. Writes to the
 *  style.text bag (kept off the content bag so the render frame owns the presentation). Each control drops
 *  its key back to the default to stay sparse. */
function TextStyleGroup({ style, onChange }: { style: BlockStyle; onChange: (next: BlockStyle) => void }) {
  const text: TextStyle = style.text ?? {}
  const setText = (patch: Partial<TextStyle>) => {
    const nextText: TextStyle = { ...text, ...patch }
    // Drop any field that matches its default so the stored bag stays minimal.
    if (nextText.size === 'md') delete nextText.size
    if (nextText.color === 'default') delete nextText.color
    if (nextText.shadow === 'none') delete nextText.shadow
    const next: BlockStyle = { ...style }
    if (Object.keys(nextText).length) next.text = nextText
    else delete next.text
    onChange(next)
  }
  return (
    <ControlGroup label="Text style">
      <ControlRow label="Size">
        <Segmented
          ariaLabel="Text size"
          options={TEXT_STYLE_SIZE_OPTIONS}
          value={text.size ?? 'md'}
          onSelect={(v) => setText({ size: v })}
        />
      </ControlRow>
      <ControlRow label="Weight">
        <Segmented
          ariaLabel="Font weight"
          options={TEXT_STYLE_WEIGHT_OPTIONS}
          value={text.weight ?? 'normal'}
          onSelect={(v) => setText({ weight: v === 'normal' ? undefined : v })}
        />
      </ControlRow>
      <ControlRow label="Color">
        <ColorControl value={text.color ?? 'default'} onSelect={(v) => setText({ color: v })} />
      </ControlRow>
      <ControlRow label="Shadow">
        <ShadowControl value={(text.shadow ?? 'none') as ShadowValue} onSelect={(v) => setText({ shadow: v as TextShadowStep })} />
      </ControlRow>
    </ControlGroup>
  )
}

/** The C3 SPACING group: a compact top/bottom margin control in a collapsible section. Absent === the C2
 *  render default (a comfortable md), so leaving it alone keeps the sensible spacing; `none` is a flush. */
function MarginGroup({ style, onChange }: { style: BlockStyle; onChange: (next: BlockStyle) => void }) {
  const set = (patch: Partial<Pick<BlockStyle, 'mt' | 'mb'>>) => {
    const next: BlockStyle = { ...style, ...patch }
    onChange(next)
  }
  return (
    <ControlGroup label="Spacing">
      <MarginControl
        top={style.mt ?? 'md'}
        bottom={style.mb ?? 'md'}
        onTop={(v) => set({ mt: v })}
        onBottom={(v) => set({ mb: v })}
      />
    </ControlGroup>
  )
}

/** The image-gallery editor (ADR-542): a visual grid of the gallery's images with DRAG-to-reorder,
 *  per-image DELETE, and up/down buttons (keyboard + a11y fallback for the drag), plus the Upload control
 *  and a collapsible "one URL per line" box for adding/editing by link. The first image leads the gallery.
 *  The value is always a clean string[]. */
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
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta
    if (j < 0 || j >= urls.length) return
    const next = [...urls]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const removeAt = (i: number) => onChange(urls.filter((_, k) => k !== i))
  const drop = (target: number) => {
    if (dragIndex === null || dragIndex === target) return setDragIndex(null)
    const next = [...urls]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(target, 0, moved)
    onChange(next)
    setDragIndex(null)
  }

  return (
    <div className="space-y-1.5">
      <span className={labelCls}>
        {label}
        {urls.length > 0 && <span className="font-normal text-muted"> · {urls.length}</span>}
      </span>

      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {urls.map((url, i) => (
            <div
              key={`${url}-${i}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(i)}
              onDragEnd={() => setDragIndex(null)}
              className={`group relative aspect-square cursor-grab overflow-hidden rounded-lg border ${dragIndex === i ? 'border-primary opacity-60' : 'border-border'}`}
            >
              {/* Unoptimized: gallery images come from Supabase Storage, not the configured next/image domains. */}
              <Image src={url} alt="" width={160} height={160} unoptimized className="pointer-events-none h-full w-full object-cover" />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-2xs font-semibold text-white">First</span>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove image"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move earlier"
                  className="rounded bg-black/60 p-0.5 text-white hover:bg-black/80 disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === urls.length - 1}
                  aria-label="Move later"
                  className="rounded bg-black/60 p-0.5 text-white hover:bg-black/80 disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadImage && (
        <UploadButton
          uploadImage={uploadImage}
          multiple
          label="Upload images"
          onUploaded={(added) => onChange([...urls, ...added])}
        />
      )}

      <details className="text-2xs text-muted">
        <summary className="cursor-pointer select-none">Add or edit by URL</summary>
        <textarea
          rows={3}
          value={urls.join('\n')}
          placeholder="One image URL per line"
          onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
          className={`${inputCls} mt-1`}
        />
      </details>
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

/** The per-block STYLE controls (ADR-571 cleanup). ALIGNMENT is promoted to a DIRECT top-level Left | Center |
 *  Right icon-group (task 6) — it is no longer buried inside the "Style" disclosure, and it never sat in a
 *  dropdown. The legacy None | S | M | L PADDING selector is removed (task 5): block spacing is owned by the
 *  C3 Spacing group (top / bottom margin) and the Background switch, so a redundant inner-padding step only
 *  duplicated that concept. The "Style" disclosure now holds just the Background switch (a self-carding box
 *  reads on; a plain block reads off — turning it off strips the white card, on gives a bare block one). */
function StyleControls({
  id,
  style,
  onChange,
}: {
  id: string
  style: BlockStyle
  onChange: (next: BlockStyle) => void
}) {
  const selfCards = blockDrawsOwnCard(id)
  const bgChecked = selfCards ? style.background !== false : style.background === true
  const setBg = (on: boolean) => {
    const next: BlockStyle = { ...style }
    const bg = selfCards ? (on ? undefined : false) : on ? true : undefined
    if (bg === undefined) delete next.background
    else next.background = bg
    onChange(next)
  }
  const setAlign = (v: AlignValue) => {
    const next: BlockStyle = { ...style, align: v }
    if (next.align === 'start') delete next.align
    onChange(next)
  }
  return (
    <>
      {/* Alignment reads as a direct icon-group row, not nested in a dropdown (task 6). */}
      <ControlRow label="Align">
        <AlignControl value={(style.align ?? 'start') as AlignValue} onSelect={setAlign} />
      </ControlRow>
      <ControlGroup label="Style">
        <ToggleRow label="Background" checked={bgChecked} onChange={setBg} />
      </ControlGroup>
    </>
  )
}

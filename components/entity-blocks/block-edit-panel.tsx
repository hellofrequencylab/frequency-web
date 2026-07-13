'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight, ChevronDown, ChevronUp, Loader2, Plus, Sparkles, Upload, X } from 'lucide-react'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import {
  blockBearsText,
  blockDrawsOwnCard,
  blockSupportsAlign,
  blockSupportsBackground,
  blockTextRoles,
  fieldsForBlock,
  primitiveValues,
  type BlockStyle,
  type FieldDef,
  type MarginStep,
  type TextColorToken,
  type TextRole,
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
  ControlStack,
  HeightControl,
  IconPicker,
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
import { RecordingPickerControl } from '@/components/airwaves/recording-picker-control'

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
  onReseed,
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
  /** Per-block copy RE-SEED (task #17, SPACE only): regenerate this block's text from the master profile.
   *  Given the block's current content, returns the rewritten fields (to merge) or a plain error. Absent
   *  on surfaces with no master profile (member profiles); the button only shows when present. */
  onReseed?: (current: Record<string, unknown>) => Promise<{ content?: Record<string, string>; error?: string }>
  onContent: (next: Record<string, unknown>) => void
  onStyle: (next: BlockStyle) => void
  onToggleHide: () => void
}) {
  const block = entityBlockById(id)
  const isData = block?.category === 'data'
  const fields = fieldsForBlock(id)
  const bearsText = blockBearsText(id)
  // Per-block copy re-seed (task #17): offered only when the surface injects onReseed (Space with a master
  // profile) AND the block has text fields to rewrite.
  const canReseed = !!onReseed && fields.some((f) => f.type === 'text' || f.type === 'textarea')
  const [reseeding, setReseeding] = useState(false)
  const [reseedError, setReseedError] = useState<string | null>(null)
  // Per-element text roles (item 4): a block with more than one text element (design blocks, Callout,
  // Features) styles each role independently; every other text-bearing block styles its text as one.
  const textRoles = blockTextRoles(id)
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

  // Re-seed this block's copy from the master profile (task #17): call the injected action with the current
  // content, then MERGE the rewritten fields over it through the normal onContent path (so the edit persists
  // via the editor's own debounced save — no separate write). Fail-safe: a plain inline message on error.
  const reseed = async () => {
    if (!onReseed || reseeding) return
    setReseeding(true)
    setReseedError(null)
    try {
      const res = await onReseed(content)
      if (res.error) setReseedError(res.error)
      else if (res.content && Object.keys(res.content).length) onContent({ ...content, ...res.content })
    } catch {
      setReseedError('That did not go through. Try again in a moment.')
    } finally {
      setReseeding(false)
    }
  }

  return (
    <div className="mt-1 space-y-3 rounded-lg border border-border bg-surface-elevated/50 p-3">
      {/* DATA block: a minimal on/off switch (redesigned from the verbose checkbox). */}
      {isData && <ToggleRow label="Show on page" checked={!hidden} onChange={onToggleHide} />}

      {/* Per-block copy re-seed (task #17): regenerate just this block's text from the Space's master
          profile. Shown only on a Space with a master profile, for a block that has text to rewrite. */}
      {canReseed && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={reseed}
            disabled={reseeding}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
          >
            {reseeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5 text-primary-strong" aria-hidden />}
            {reseeding ? 'Re-seeding' : 'Re-seed copy'}
          </button>
          {reseedError && <p className="text-2xs text-danger">{reseedError}</p>}
        </div>
      )}

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

      {/* ── The control stack (redesigned): Text style (C1) · Style · Spacing (C3), grouped + collapsible.
          A multi-element block (design blocks, Callout, Features) gets ONE text-style group PER element
          (Eyebrow / Heading / Text); every other text-bearing block styles its text as one whole (item 4). */}
      {textRoles.length > 0
        ? textRoles.map((role) => (
            <TextStyleGroup
              key={role}
              label={ROLE_LABEL[role]}
              value={style.textByRole?.[role] ?? {}}
              onChange={(next) => onStyle(setRoleText(style, role, next))}
            />
          ))
        : bearsText && (
            <TextStyleGroup
              label="Text style"
              value={style.text ?? {}}
              onChange={(next) => {
                const updated: BlockStyle = { ...style }
                if (next) updated.text = next
                else delete updated.text
                onStyle(updated)
              }}
            />
          )}
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
  textOnCanvas = false,
  onChange,
}: {
  field: FieldDef
  value: unknown
  uploadImage?: UploadImage
  pickerData?: BlockPickerData
  /** Email canvas surface (item 1): the per-item TITLE / TEXT are edited on the canvas, so the rail's
   *  Features / Cards editors hide those textareas and keep only the non-text controls (icon / image / link /
   *  button / stat / reorder). Absent / false on the web rail, where text is edited in the rail. */
  textOnCanvas?: boolean
  onChange: (v: unknown) => void
}) {
  if (field.type === 'text' || field.type === 'url' || field.type === 'embedUrl') {
    const str = typeof value === 'string' ? value : ''
    const canUpload = field.upload && !!uploadImage
    return (
      <label className="block space-y-1">
        <span className={labelCls}>{field.label}</span>
        <input
          type={field.type === 'text' ? 'text' : 'url'}
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
  // ── Airwaves (ADR-608): the single-select "pick a Recording" control. Its choices are the current
  //    Space's Recordings, fetched at edit time (not a fixed enum); the stored value is one Recording id. ──
  if (field.type === 'recordingPicker') {
    return (
      <RecordingPickerControl
        label={field.label}
        value={typeof value === 'string' ? value : ''}
        onChange={(id) => onChange(id)}
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
    return <FeaturesEditor label={field.label} value={value} uploadImage={uploadImage} textOnCanvas={textOnCanvas} onChange={onChange} />
  }
  if (field.type === 'cards') {
    return (
      <CardsEditor
        label={field.label}
        value={value}
        uploadImage={uploadImage}
        textOnCanvas={textOnCanvas}
        onChange={onChange}
      />
    )
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
    // Stacked + wrapped (items 5/6/7): Banner HEIGHT (Short | Medium | Tall) reads in full instead of
    // clipping in the narrow one-line row.
    return (
      <ControlStack label={field.label}>
        <HeightControl value={current as HeightValue} onSelect={set} wrap />
      </ControlStack>
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
  // `segmented` + `margin` both render a generic segmented over the declared options. Stacked + wrapped
  // (items 5/6/7): a several-word set (Image / Callout SHAPE, Banner CONTENT, Features LAYOUT) gets the full
  // panel width and wraps instead of clipping in the one-line row.
  const options =
    field.type === 'margin'
      ? (allowed as MarginStep[]).map((v) => ({ value: v, label: v === 'none' ? 'None' : v.toUpperCase() }))
      : (field.options ?? allowed.map((v) => ({ value: v, label: v })))
  return (
    <ControlStack label={field.label}>
      <Segmented ariaLabel={field.label} options={options} value={current} onSelect={set} wrap />
    </ControlStack>
  )
}

/** The per-element role label shown on each text-style group (item 4). `body` reads as "Text" — the plain
 *  reading copy — to match how the operator thinks of it. */
const ROLE_LABEL: Record<TextRole, string> = {
  eyebrow: 'Eyebrow',
  heading: 'Heading',
  body: 'Text',
}

/** Write one role's text-style bag into a BlockStyle's `textByRole` map, dropping the role (and the map when
 *  it empties) so the stored blob stays sparse. Pure; returns a new BlockStyle. */
function setRoleText(style: BlockStyle, role: TextRole, next: TextStyle | undefined): BlockStyle {
  const byRole: Partial<Record<TextRole, TextStyle>> = { ...(style.textByRole ?? {}) }
  if (next) byRole[role] = next
  else delete byRole[role]
  const updated: BlockStyle = { ...style }
  if (Object.keys(byRole).length) updated.textByRole = byRole
  else delete updated.textByRole
  return updated
}

/** The C1 TEXT-STYLE group: size · weight · color · shadow, in a collapsible section. CONTROLLED — it holds
 *  a single TextStyle bag (a whole-block bag, or one role's bag for per-element styling) and reports the next
 *  bag (or undefined when it empties) so the caller writes it wherever it belongs. Each control drops its key
 *  back to the default to stay sparse. */
function TextStyleGroup({
  label,
  value,
  onChange,
}: {
  label: string
  value: TextStyle
  onChange: (next: TextStyle | undefined) => void
}) {
  const text = value
  const setText = (patch: Partial<TextStyle>) => {
    const nextText: TextStyle = { ...text, ...patch }
    // Drop any field that matches its default so the stored bag stays minimal.
    if (nextText.size === 'md') delete nextText.size
    if (nextText.color === 'default') delete nextText.color
    if (nextText.shadow === 'none') delete nextText.shadow
    onChange(Object.keys(nextText).length ? nextText : undefined)
  }
  return (
    <ControlGroup label={label}>
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

/** One Features item as edited in the rail (ADR-585): an icon OR an image, a title + text, an optional price,
 *  a whole-item link, and an optional CTA label (the CTA renders over `link`). */
type FeatureRow = { icon: string; image: string; title: string; text: string; price: string; link: string; cta: string }

/** Reorder buttons + a remove button for a repeater row. Shared by the Features + Cards editors. */
function RowControls({
  index,
  count,
  noun,
  onMove,
  onRemove,
}: {
  index: number
  count: number
  noun: string
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Move ${noun} ${index + 1} up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
        className="rounded p-1 text-subtle hover:text-text disabled:opacity-30"
      >
        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Move ${noun} ${index + 1} down`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
        className="rounded p-1 text-subtle hover:text-text disabled:opacity-30"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Remove ${noun} ${index + 1}`}
        onClick={onRemove}
        className="ml-auto rounded p-1 text-subtle hover:bg-danger-bg hover:text-danger"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}

/** The Features editor (ADR-542 → email overhaul): a repeater of {icon, title, text, link} items. The icon is
 *  the searchable IconPicker (site icons + emoji, item 4); title + text are free text; `link` is an optional
 *  whole-item link. On the email canvas (textOnCanvas) the title + text move ON CANVAS (item 1), so the rail
 *  keeps only the icon + link + reorder here. Blank rows are kept while editing (so "+ Add feature" opens a
 *  row) and pruned by the server sanitizer on save. */
function FeaturesEditor({
  label,
  value,
  uploadImage,
  textOnCanvas = false,
  onChange,
}: {
  label: string
  value: unknown
  uploadImage?: UploadImage
  textOnCanvas?: boolean
  onChange: (v: unknown) => void
}) {
  const items: FeatureRow[] = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>).map((it) => ({
        icon: typeof it.icon === 'string' ? it.icon : '',
        image: typeof it.image === 'string' ? it.image : '',
        title: typeof it.title === 'string' ? it.title : '',
        text: typeof it.text === 'string' ? it.text : '',
        price: typeof it.price === 'string' ? it.price : '',
        link: typeof it.link === 'string' ? it.link : '',
        cta: typeof it.cta === 'string' ? it.cta : '',
      }))
    : []
  // Do NOT prune here: pruning empty rows swallowed the freshly-added blank row (bug). Keep every row while
  // the operator types; sanitizeFeature drops the still-blank ones on save.
  const update = (next: FeatureRow[]) => onChange(next)
  const patch = (i: number, p: Partial<FeatureRow>) => update(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
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
          <div className="flex items-start gap-1.5">
            <IconPicker value={it.icon} onChange={(token) => patch(i, { icon: token })} />
            {textOnCanvas ? (
              <p className="flex-1 pt-1 text-2xs leading-snug text-subtle">
                {it.title || it.text ? it.title || it.text : 'Edit the title and text on the canvas.'}
              </p>
            ) : (
              <input
                value={it.title}
                placeholder="Title"
                onChange={(e) => patch(i, { title: e.target.value })}
                className={inputCls}
              />
            )}
          </div>
          {!textOnCanvas && (
            <textarea
              rows={2}
              value={it.text}
              placeholder="Description"
              onChange={(e) => patch(i, { text: e.target.value })}
              className={inputCls}
            />
          )}
          {/* An image (ADR-585): use INSTEAD of the icon for a photo-forward item (cards / spotlight layouts). */}
          <label className="block space-y-1">
            <span className={labelCls}>Image</span>
            <input
              value={it.image}
              placeholder="https:// (leave blank to use the icon)"
              onChange={(e) => patch(i, { image: e.target.value })}
              className={inputCls}
            />
            {uploadImage && <UploadButton uploadImage={uploadImage} onUploaded={(urls) => patch(i, { image: urls[urls.length - 1] })} />}
          </label>
          <input
            value={it.price}
            placeholder="Price (optional), e.g. from $80"
            onChange={(e) => patch(i, { price: e.target.value })}
            className={inputCls}
          />
          <input
            value={it.link}
            placeholder="Link (optional), https://"
            onChange={(e) => patch(i, { link: e.target.value })}
            className={inputCls}
          />
          <input
            value={it.cta}
            placeholder="Button label (optional), e.g. Learn more"
            onChange={(e) => patch(i, { cta: e.target.value })}
            className={inputCls}
          />
          <RowControls index={i} count={items.length} noun="feature" onMove={(d) => move(i, d)} onRemove={() => update(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => update([...items, { icon: '', image: '', title: '', text: '', price: '', link: '', cta: '' }])}
        className="inline-flex items-center gap-1 text-2xs font-semibold text-primary-strong hover:underline"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add feature
      </button>
    </div>
  )
}

/** One Card-grid card as edited in the rail. A card is a PHOTO card (image) OR a STAT box (value + label),
 *  plus title + text, an optional whole-card link, and an optional separate button. */
type CardRow = {
  icon: string
  image: string
  statValue: string
  statLabel: string
  title: string
  text: string
  link: string
  buttonLabel: string
  buttonHref: string
}

/** Read one raw card into a CardRow (tolerant of legacy {icon,title,text} rows). */
function toCardRow(raw: unknown): CardRow {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const stat = (o.stat && typeof o.stat === 'object' ? o.stat : {}) as Record<string, unknown>
  const button = (o.button && typeof o.button === 'object' ? o.button : {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    icon: s(o.icon),
    image: s(o.image),
    statValue: s(stat.value),
    statLabel: s(stat.label),
    title: s(o.title),
    text: s(o.text),
    link: s(o.link),
    buttonLabel: s(button.label),
    buttonHref: s(button.href),
  }
}

/** Serialize a CardRow back to the stored card shape (sparse: only non-empty sub-objects). */
function fromCardRow(r: CardRow): Record<string, unknown> {
  const out: Record<string, unknown> = { title: r.title, text: r.text }
  if (r.icon) out.icon = r.icon
  if (r.image) out.image = r.image
  if (r.statValue || r.statLabel) out.stat = { value: r.statValue, label: r.statLabel }
  if (r.link) out.link = r.link
  if (r.buttonLabel) out.button = { label: r.buttonLabel, href: r.buttonHref }
  return out
}

/** The Card-grid editor (email overhaul, item 3): a repeater of richer cards. Each card is a PHOTO card (an
 *  image) OR a STAT box (a big number + a label), styled distinctly from Features. The rail owns the non-text
 *  controls (image / stat / link / button); on the email canvas (textOnCanvas) the title + text move ON CANVAS
 *  (item 1), so the rail hides those textareas. Blank rows are kept while editing; the sanitizer prunes them. */
function CardsEditor({
  label,
  value,
  uploadImage,
  textOnCanvas = false,
  onChange,
}: {
  label: string
  value: unknown
  uploadImage?: UploadImage
  textOnCanvas?: boolean
  onChange: (v: unknown) => void
}) {
  const rows: CardRow[] = Array.isArray(value) ? (value as unknown[]).map(toCardRow) : []
  const update = (next: CardRow[]) => onChange(next.map(fromCardRow))
  const patch = (i: number, p: Partial<CardRow>) => update(rows.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    update(next)
  }
  return (
    <div className="space-y-1.5">
      <span className={labelCls}>{label}</span>
      {rows.map((c, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-border bg-surface p-2">
          {!textOnCanvas && (
            <input
              value={c.title}
              placeholder="Card title"
              onChange={(e) => patch(i, { title: e.target.value })}
              className={inputCls}
            />
          )}
          {!textOnCanvas && (
            <textarea
              rows={2}
              value={c.text}
              placeholder="Card text"
              onChange={(e) => patch(i, { text: e.target.value })}
              className={inputCls}
            />
          )}
          {textOnCanvas && (
            <p className="text-2xs leading-snug text-subtle">Edit this card&rsquo;s title and text on the canvas.</p>
          )}

          {/* Photo card: an image URL (+ upload when the surface allows it). */}
          <label className="block space-y-1">
            <span className={labelCls}>Photo</span>
            <input
              value={c.image}
              placeholder="https:// (leave blank for a stat card)"
              onChange={(e) => patch(i, { image: e.target.value })}
              className={inputCls}
            />
            {uploadImage && <UploadButton uploadImage={uploadImage} onUploaded={(urls) => patch(i, { image: urls[urls.length - 1] })} />}
          </label>

          {/* Stat box: a big value + a label. Use INSTEAD of a photo for a metric card. */}
          <div className="flex items-center gap-1.5">
            <input
              value={c.statValue}
              placeholder="Stat, e.g. 500+"
              onChange={(e) => patch(i, { statValue: e.target.value })}
              className={`${inputCls} w-28`}
            />
            <input
              value={c.statLabel}
              placeholder="Stat label"
              onChange={(e) => patch(i, { statLabel: e.target.value })}
              className={inputCls}
            />
          </div>

          {/* Whole-card link + an optional separate button. */}
          <input
            value={c.link}
            placeholder="Card link (optional), https://"
            onChange={(e) => patch(i, { link: e.target.value })}
            className={inputCls}
          />
          <div className="flex items-center gap-1.5">
            <input
              value={c.buttonLabel}
              placeholder="Button label"
              onChange={(e) => patch(i, { buttonLabel: e.target.value })}
              className={`${inputCls} w-1/3`}
            />
            <input
              value={c.buttonHref}
              placeholder="Button link, https://"
              onChange={(e) => patch(i, { buttonHref: e.target.value })}
              className={inputCls}
            />
          </div>

          <RowControls index={i} count={rows.length} noun="card" onMove={(d) => move(i, d)} onRemove={() => update(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          update([...rows, { icon: '', image: '', statValue: '', statLabel: '', title: '', text: '', link: '', buttonLabel: '', buttonHref: '' }])
        }
        className="inline-flex items-center gap-1 text-2xs font-semibold text-primary-strong hover:underline"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add card
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A per-file ceiling kept safely UNDER the server-action body limit (next.config bodySizeLimit, 10mb), so a
  // single upload request never overflows the framework boundary (which crashes the route instead of
  // returning an error). Larger files are skipped with a clear message.
  const MAX_UPLOAD_BYTES = 9 * 1024 * 1024
  // Upload a few files at once, not the whole batch, so many photos never open a flood of parallel requests.
  const CONCURRENCY = 3

  async function handle(files: FileList) {
    setBusy(true)
    setError(null)
    const all = Array.from(files)
    const oversize = all.filter((f) => f.size > MAX_UPLOAD_BYTES).length
    const list = all.filter((f) => f.type.startsWith('image/') && f.size <= MAX_UPLOAD_BYTES)
    if (!list.length) {
      setError(oversize ? 'Those images are over 9 MB. Use smaller versions.' : 'Choose an image file.')
      setBusy(false)
      return
    }
    setProgress({ done: 0, total: list.length })

    // Upload with a small worker pool: results are stored by ORIGINAL index so the gallery keeps the pick
    // order even though uploads finish out of order. Each upload is ONE file (well under the body limit).
    const results: (string | null)[] = new Array(list.length).fill(null)
    let firstError: string | null = null
    let cursor = 0
    const worker = async () => {
      while (cursor < list.length) {
        const i = cursor++
        try {
          const res = await uploadImage(list[i])
          if ('error' in res) firstError ??= res.error
          else results[i] = res.url
        } catch {
          firstError ??= 'That upload did not go through. Try again.'
        }
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker))

    const urls = results.filter((u): u is string => !!u)
    if (urls.length) onUploaded(urls)
    if (oversize && !firstError) firstError = 'Some images were over 9 MB and skipped. Use smaller versions.'
    if (firstError) setError(firstError)
    setProgress(null)
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
        {busy ? (progress ? `Uploading ${progress.done}/${progress.total}` : 'Uploading') : label}
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
  // Keep blank rows while editing so "+ Add link" opens a row to type into (pruning here swallowed the new
  // row); the server sanitizer drops links with no safe url on save.
  const update = (next: Array<{ label: string; url: string }>) => onChange(next)
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

/** The per-block STYLE controls (ADR-571 cleanup → ADR-580 audit). ALIGNMENT is a DIRECT top-level Left |
 *  Center | Right icon-group; the legacy padding selector is gone (spacing is the C3 Spacing group + the
 *  Background switch). The item-5 audit gates each control to where it does something: Align only shows on a
 *  block that carries inline TEXT (a full-width image / gallery / divider / embed has nothing to align), and
 *  Background hides on the Divider (a card around a hairline rule is meaningless). A block that supports
 *  neither (the Divider) renders no Style controls at all — just the Spacing group below. */
function StyleControls({
  id,
  style,
  onChange,
}: {
  id: string
  style: BlockStyle
  onChange: (next: BlockStyle) => void
}) {
  const showAlign = blockSupportsAlign(id)
  const showBackground = blockSupportsBackground(id)
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
      {/* Alignment reads as a direct icon-group row, not nested in a dropdown (task 6). Hidden on blocks
          with no inline text to align (item 5 audit). */}
      {showAlign && (
        <ControlRow label="Align">
          <AlignControl value={(style.align ?? 'start') as AlignValue} onSelect={setAlign} />
        </ControlRow>
      )}
      {showBackground && (
        <ControlGroup label="Style">
          <ToggleRow label="Background" checked={bgChecked} onChange={setBg} />
        </ControlGroup>
      )}
    </>
  )
}

'use client'

import { useState, type ReactNode } from 'react'
import { ArrowRight, ImagePlus, Pencil } from 'lucide-react'
import { entityBlockById, DESIGN_ENTITY_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { headerFontStyle } from '@/lib/page-editor/fields'
import {
  fieldsForBlock,
  fieldRendersInlineHtml,
  decodeLegacyEntities,
  featureLayout,
  gridColumns,
  isFeatureDataSource,
  type FieldDef,
} from '@/lib/entity-blocks/block-content'
import type { UploadImage } from '@/components/entity-blocks/block-edit-panel'
import { ContentBlockView, hasContent } from '../content-block-view'
import { BlockIcon } from '../block-icon'
import { useProfileLayout } from '../profile-layout-context'
import { SpaceEditableSlot } from './space-editable-slot'
import { SpaceImagePopup } from './space-image-popup'

// ONE SPACE BLOCK, RENDERED TO THE LIVE WYSIWYG CANVAS so the EDIT surface MATCHES the published page. Each
// block's authored TEXT (text / textarea, plus each Features / Cards item's title + text) is an inline-editable
// slot and each single PHOTO opens the on-canvas photo popup — click the copy or the photo on the page and
// edit it right there. Everything NOT inline-authored is drawn from the REAL published render so edit ==
// published by construction:
//   • DATA blocks (About, Offerings, Events, Team, Reviews, Contact, ...) render the actual server node
//     read-only — identical to the live page. Their eyebrow / title are edited in the rail (folded into the
//     node's own header), their live list can never be inline-authored.
//   • STRUCTURAL content blocks (Links, Music and video, Recording) render a faithful read-only ContentBlockView
//     preview, not a bare field stack — they carry no inline-authorable copy.
//   • CONTENT + DESIGN blocks render in their real published shape (a Callout is a card, a Features block honours
//     its Layout + Columns, a Zigzag is image-beside-text, an Accent beat is the accent card) with the copy woven
//     in as editable slots.
//
// RICH vs PLAIN (the entity-escape fix): a slot is RICH (Bold / Italic / Link bubble + getHTML) ONLY for a field
// whose PUBLISHED render honours inline HTML (fieldRendersInlineHtml). Every OTHER field — a data block body, a
// design heading, a card subheading — is PLAIN (getText), so its text is never stored as HTML entities the plain
// render would show literally. Seeded values are decoded once (decodeLegacyEntities) so an already-corrupted
// value edits + displays as its true characters. Semantic DAWN tokens throughout (no hex), voice canon (no em
// dashes).

const IMAGE_KEYS = new Set(['image', 'src'])
/** The design blocks (framework-free ids from the registry). Each gets a layout-aware canvas (below) so it
 *  edits in its real shape. Sourced from the registry so this client module stays free of the server-side
 *  design components. */
const DESIGN_IDS: ReadonlySet<string> = new Set(DESIGN_ENTITY_BLOCK_IDS)

/** Structural content blocks that carry NO inline-authorable copy: they render a faithful READ-ONLY preview of
 *  the real published block (ContentBlockView) so the canvas matches the page, instead of a bare field stack.
 *  Their content is set in the rail (a link row, a pasted media URL, a picked Recording). */
const STRUCTURAL_PREVIEW_IDS: ReadonlySet<string> = new Set(['links', 'embed', 'recording'])

// ── Canvas typography, matched to the published design components so the page style shows while editing. ──
const EYEBROW_CLS = 'text-sm font-bold uppercase tracking-[0.25em] text-primary-strong'
const EYEBROW_INK_CLS = 'text-sm font-bold uppercase tracking-[0.25em] text-primary'
/** A design-block heading (DesignHeading default): the Anton display face at the published FLUID CLAMP, so the
 *  canvas heading is not dramatically smaller than the page (parity fix 5). */
const HEADING_CLS = 'font-display text-[clamp(1.875rem,5.5vw,3rem)] uppercase leading-[1.05] text-text'
/** The LARGE (DesignHeading size="lg") heading the Banner / photoHero uses — a much bigger clamp (parity fix 5). */
const HEADING_LG_CLS = 'font-display text-[clamp(2rem,7vw,4.5rem)] uppercase leading-[0.95] text-text'
const HEADING_LG_INK_CLS = 'font-display text-[clamp(2rem,7vw,4.5rem)] uppercase leading-[0.95] text-on-ink'
/** The big standalone Display heading block, at the published display clamp (parity fix 6). */
const DISPLAY_CLS = 'font-display text-[clamp(2rem,6vw,3.75rem)] uppercase leading-[0.95] text-balance text-text'
const BODY_CLS = 'text-lg leading-relaxed text-muted'
const BODY_INK_CLS = 'text-lg leading-relaxed text-on-ink-muted'

// The Banner OVERLAY height + scrim, copied verbatim from the published PhotoHero (design.tsx) so the canvas
// overlay sizes by the `height` control and veils on the `scrim` step instead of a hardcoded 16/9 + fixed scrim
// (parity fix 1). Token-only (ink), never a hardcoded hex.
const BANNER_HEIGHT_CLASS: Record<'short' | 'medium' | 'tall', string> = {
  short: 'min-h-[40vh] py-16 sm:min-h-[45vh] sm:py-20',
  medium: 'min-h-[55vh] py-20 sm:min-h-[60vh] sm:py-28',
  tall: 'min-h-[70vh] py-24 sm:min-h-[80vh] sm:py-32',
}
const BANNER_SCRIM_CLASS: Record<'light' | 'medium', string> = {
  light: 'from-ink/75 via-ink/35 to-ink/20',
  medium: 'from-ink/90 via-ink/55 to-ink/30',
}

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
            {/* When the slot carries a sizing class (an aspect crop or a fixed height) the button IS the crop
                box, so the photo must FILL it (object-cover) to match the published shape — that is why a
                vertical zigzag looked 4/3 in the editor. With no sizing class (a generic slot) fall back to the
                photo's own height, capped, so it never runs away. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset */}
            <img
              src={url}
              alt={alt}
              className={fill || className ? 'h-full w-full object-cover' : 'max-h-72 w-full object-cover'}
            />
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

/** An item's READ-ONLY media on the canvas: its photo (when set) at the layout's crop, else its icon glyph.
 *  Mirrors the published FeatureMedia so an item card reads the same while editing. Null when it has neither. */
function ItemMedia({
  image,
  icon,
  variant,
}: {
  image: string
  icon: string
  variant: 'inline' | 'top' | 'spotlight'
}): ReactNode {
  if (image) {
    const cls =
      variant === 'top'
        ? 'aspect-[4/3] w-full rounded-xl object-cover'
        : variant === 'spotlight'
          ? 'aspect-[4/3] w-full rounded-2xl object-cover'
          : 'h-12 w-12 shrink-0 rounded-xl object-cover'
    // eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset
    return <img src={image} alt="" className={cls} />
  }
  if (icon) {
    return (
      <div className="shrink-0 text-primary-strong" aria-hidden>
        <BlockIcon name={icon} size={variant === 'inline' ? 26 : 30} />
      </div>
    )
  }
  return null
}

/** Editable per-item title + text for a repeater item (its structural fields — icon / image / stat / link /
 *  reorder — stay in the rail). Seeds are decoded so a legacy double-escape edits cleanly. */
function ItemBody({
  title,
  text,
  titleClass,
  onTitle,
  onText,
  price,
  link,
  cta,
}: {
  title: string
  text: string
  titleClass: string
  onTitle: (v: string) => void
  onText: (v: string) => void
  /** Parity fix 2: a per-item PRICE line + CTA, mirroring published FeatureBody. Both are rail-set (read-only
   *  on the canvas), so they render only when passed (Features items). Absent for a plain cards item. */
  price?: string
  link?: string
  cta?: string
}): ReactNode {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className={titleClass}>
        <SpaceEditableSlot value={decodeLegacyEntities(title)} placeholder="Title" onChange={onTitle} />
      </div>
      <div className="text-sm leading-relaxed text-muted">
        <SpaceEditableSlot value={decodeLegacyEntities(text)} placeholder="Description" multiline onChange={onText} />
      </div>
      {/* Published FeatureBody renders a price line (accent tag) + a CTA button when the item carries a
          price / link. They are rail-set, so on the canvas they show READ-ONLY (a span, not a live link). */}
      {price ? <p className="text-sm font-semibold text-primary-strong">{price}</p> : null}
      {link ? (
        <span className="mt-1 inline-flex items-center gap-1 self-start rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text">
          {cta || 'Learn more'}
        </span>
      ) : null}
    </div>
  )
}

/** A selectable repeater-item frame: click to focus it in the rail (card-level selection) without stealing the
 *  caret — stop the bubble to the block wrapper (which would clear the focus) but never preventDefault, so a
 *  click inside a slot still lands. The selected item wears a ring. */
function ItemFrame({
  selected,
  onSelect,
  className,
  children,
}: {
  selected: boolean
  onSelect: () => void
  className: string
  children: ReactNode
}): ReactNode {
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      className={`cursor-pointer transition-colors ${
        selected ? 'border-primary ring-1 ring-primary' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

/** Editable per-item title + text for a Cards repeater (cardGrid). Persists the WHOLE items array through
 *  onChange, preserving every non-text field. Keyed by a structural signature so a rail add / remove / reorder
 *  remounts the slots while a plain keystroke keeps the key stable (no caret jump). Each card is selectable. */
function ItemsTextCanvas({
  value,
  selectedIndex,
  onSelectItem,
  onChange,
}: {
  value: unknown
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
        const title = typeof it.title === 'string' ? it.title : ''
        const text = typeof it.text === 'string' ? it.text : ''
        return (
          <ItemFrame
            key={`${sig}-${i}`}
            selected={selectedIndex === i}
            onSelect={() => onSelectItem(i)}
            className="rounded-xl border border-border p-3 hover:border-border-strong"
          >
            {image && (
              <div className="overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset */}
                <img src={image} alt="" className="max-h-40 w-full object-cover" />
              </div>
            )}
            <div className="mt-2">
              <ItemBody
                title={title}
                text={text}
                titleClass="text-base font-bold text-text"
                onTitle={(v) => patch(i, 'title', v)}
                onText={(v) => patch(i, 'text', v)}
              />
            </div>
          </ItemFrame>
        )
      })}
    </div>
  )
}

/** The responsive grid-columns utility for a 2 / 3 / 4 column count — matches content-block-view's Features
 *  and design-block-view's cardColsClass. */
function featureGridCols(n: 2 | 3 | 4): string {
  return n === 2 ? 'sm:grid-cols-2' : n === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'
}

/** Parity fix 4: the cardGrid cards on the canvas, mirroring the published SimpleCardGrid (design-block-view)
 *  instead of the generic text stack — it honours the COLUMN count, the `shape:'left'` image-left layout, the
 *  aspect-[4/3] card image crop, the BlockIcon fallback when a card has an icon and no image, and the rounded /
 *  shadow frame toggles. Each card's title + text stays inline-editable; its media / link / frame are rail-set.
 *  Keyed by a structural signature so a rail add / remove / reorder remounts the slots while a plain keystroke
 *  keeps the key stable (no caret jump). Each card is selectable. */
function CardGridItemsCanvas({
  value,
  cols,
  imageLeft,
  frame,
  selectedIndex,
  onSelectItem,
  onChange,
}: {
  value: unknown
  cols: 2 | 3 | 4
  imageLeft: boolean
  /** The card frame classes (border + rounded + shadow), resolved from the block's toggles. */
  frame: string
  selectedIndex: number | null
  onSelectItem: (index: number) => void
  onChange: (v: unknown) => void
}) {
  const items: Array<Record<string, unknown>> = Array.isArray(value)
    ? (value as Array<Record<string, unknown>>)
    : []
  if (items.length === 0) {
    return <p className="text-sm italic text-subtle">Add cards in this block&rsquo;s settings.</p>
  }
  const sig = items
    .map((it) => `${typeof it.icon === 'string' ? it.icon : ''}~${typeof it.image === 'string' ? it.image : ''}`)
    .join('|')
  const patch = (i: number, key: 'title' | 'text', next: string) => {
    onChange(items.map((it, j) => (j === i ? { ...it, [key]: next } : it)))
  }
  return (
    <div className={`grid gap-6 ${featureGridCols(cols)}`}>
      {items.map((raw, i) => {
        const image = typeof raw.image === 'string' ? raw.image : ''
        const icon = typeof raw.icon === 'string' ? raw.icon : ''
        const title = typeof raw.title === 'string' ? raw.title : ''
        const text = typeof raw.text === 'string' ? raw.text : ''
        // Published SimpleCardGrid: an image at the shape's crop (left → a 1/3 side strip, top → aspect-[4/3]),
        // else the icon glyph, else nothing.
        const media = image ? (
          // eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset
          <img
            src={image}
            alt=""
            className={imageLeft ? 'h-full w-1/3 shrink-0 object-cover' : 'aspect-[4/3] w-full object-cover'}
          />
        ) : icon ? (
          <div className="flex items-center px-5 pt-5 text-primary-strong" aria-hidden>
            <BlockIcon name={icon} size={28} />
          </div>
        ) : null
        return (
          <ItemFrame
            key={`${sig}-${i}`}
            selected={selectedIndex === i}
            onSelect={() => onSelectItem(i)}
            className={`flex ${imageLeft ? 'flex-row items-stretch' : 'flex-col'} ${frame}`}
          >
            {media}
            <div className="flex flex-1 flex-col gap-1 p-5">
              <ItemBody
                title={title}
                text={text}
                titleClass="text-base font-bold text-text"
                onTitle={(v) => patch(i, 'title', v)}
                onText={(v) => patch(i, 'text', v)}
              />
            </div>
          </ItemFrame>
        )
      })}
    </div>
  )
}

/** The Features items on the canvas, rendered in the SELECTED layout + column count so the edit surface
 *  matches the published Features block (content-block-view FeaturesBlock). Each item's title + text is
 *  inline-editable and each item is selectable in the rail; its media (photo / icon) is read-only. A
 *  data-sourced Features (Offerings / Events / ...) can't resolve its live items on the client, so it shows a
 *  read-only note (matching how the published data-sourced Features awaits the resolver server-side). */
function FeaturesItemsCanvas({
  props,
  label,
  selectedIndex,
  onSelectItem,
  onChange,
}: {
  props: Record<string, unknown>
  label: string
  selectedIndex: number | null
  onSelectItem: (index: number) => void
  onChange: (v: unknown) => void
}) {
  if (isFeatureDataSource(props)) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
        Your live {label} show on the published page. Choose which items appear in this block&rsquo;s settings.
      </p>
    )
  }
  const items: Array<Record<string, unknown>> = Array.isArray(props.items)
    ? (props.items as Array<Record<string, unknown>>)
    : []
  if (items.length === 0) {
    return <p className="text-sm italic text-subtle">Add features in this block&rsquo;s settings.</p>
  }
  const layout = featureLayout(props)
  const cols = gridColumns(props)
  const sig = items
    .map((it) => `${typeof it.icon === 'string' ? it.icon : ''}~${typeof it.image === 'string' ? it.image : ''}`)
    .join('|')
  const patch = (i: number, key: 'title' | 'text', next: string) => {
    onChange(items.map((it, j) => (j === i ? { ...it, [key]: next } : it)))
  }
  const read = (it: Record<string, unknown>) => ({
    image: typeof it.image === 'string' ? it.image : '',
    icon: typeof it.icon === 'string' ? it.icon : '',
    title: typeof it.title === 'string' ? it.title : '',
    text: typeof it.text === 'string' ? it.text : '',
    // Parity fix 2: the per-item price + CTA published FeatureBody renders (rail-set, read-only on the canvas).
    price: typeof it.price === 'string' ? it.price : '',
    link: typeof it.link === 'string' ? it.link : '',
    cta: typeof it.cta === 'string' ? it.cta : '',
  })
  const body = (i: number, it: ReturnType<typeof read>, titleClass: string) => (
    <ItemBody
      title={it.title}
      text={it.text}
      titleClass={titleClass}
      onTitle={(v) => patch(i, 'title', v)}
      onText={(v) => patch(i, 'text', v)}
      price={it.price}
      link={it.link}
      cta={it.cta}
    />
  )
  const frame = (i: number, className: string, children: ReactNode) => (
    <ItemFrame key={`${sig}-${i}`} selected={selectedIndex === i} onSelect={() => onSelectItem(i)} className={className}>
      {children}
    </ItemFrame>
  )

  if (layout === 'list') {
    return (
      <div className="flex flex-col gap-5">
        {items.map((raw, i) => {
          const it = read(raw)
          return frame(
            i,
            'flex items-start gap-3 rounded-xl',
            <>
              <ItemMedia image={it.image} icon={it.icon} variant="inline" />
              {body(i, it, 'text-base font-bold text-text')}
            </>,
          )
        })}
      </div>
    )
  }
  if (layout === 'columns') {
    return (
      <div className={`grid gap-6 ${featureGridCols(cols)}`}>
        {items.map((raw, i) => {
          const it = read(raw)
          return frame(
            i,
            'flex flex-col gap-2 rounded-xl',
            <>
              <ItemMedia image={it.image} icon={it.icon} variant="top" />
              {body(i, it, 'text-base font-bold text-text')}
            </>,
          )
        })}
      </div>
    )
  }
  if (layout === 'stats') {
    // Parity fix 3: published stats render the headline value as `price || title` at text-4xl (not text-2xl). A
    // set price is the read-only big number and the editable title drops to the label; with no price the
    // editable title IS the big number. Text stays an editable secondary label. Both fields stay authorable.
    return (
      <div className={`grid gap-6 ${featureGridCols(cols)}`}>
        {items.map((raw, i) => {
          const it = read(raw)
          const titleBig = !it.price
          return frame(
            i,
            'rounded-2xl border border-border bg-surface p-6 text-center',
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {it.price ? (
                <div className="text-4xl font-bold leading-none text-primary-strong">{it.price}</div>
              ) : null}
              <div className={titleBig ? 'text-4xl font-bold leading-none text-primary-strong' : 'text-base font-bold text-text'}>
                <SpaceEditableSlot
                  value={decodeLegacyEntities(it.title)}
                  placeholder="Title"
                  onChange={(v) => patch(i, 'title', v)}
                />
              </div>
              <div className="mt-2 text-sm leading-relaxed text-muted">
                <SpaceEditableSlot
                  value={decodeLegacyEntities(it.text)}
                  placeholder="Description"
                  multiline
                  onChange={(v) => patch(i, 'text', v)}
                />
              </div>
            </div>,
          )
        })}
      </div>
    )
  }
  if (layout === 'cards') {
    return (
      <div className={`grid gap-6 ${featureGridCols(cols)}`}>
        {items.map((raw, i) => {
          const it = read(raw)
          return frame(
            i,
            'flex flex-col overflow-hidden rounded-2xl border border-border bg-surface',
            <>
              {it.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset
                <img src={it.image} alt="" className="aspect-[4/3] w-full object-cover" />
              ) : it.icon ? (
                <div className="flex h-14 items-center px-5 pt-5 text-primary-strong" aria-hidden>
                  <BlockIcon name={it.icon} size={30} />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col p-5">{body(i, it, 'text-base font-bold text-text')}</div>
            </>,
          )
        })}
      </div>
    )
  }
  // spotlight: full-width rows, the media alternating left / right of the text (mobile stacks).
  return (
    <div className="flex flex-col gap-10">
      {items.map((raw, i) => {
        const it = read(raw)
        const media = it.image ? (
          <ItemMedia image={it.image} icon="" variant="spotlight" />
        ) : it.icon ? (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-primary-bg text-primary-strong" aria-hidden>
            <BlockIcon name={it.icon} size={56} />
          </div>
        ) : null
        const flip = i % 2 === 1
        return frame(
          i,
          `flex flex-col gap-5 rounded-2xl sm:items-center ${flip ? 'sm:flex-row-reverse' : 'sm:flex-row'}`,
          <>
            {media && <div className="sm:w-1/2">{media}</div>}
            <div className={media ? 'sm:w-1/2' : 'w-full'}>{body(i, it, 'text-xl font-bold text-text')}</div>
          </>,
        )
      })}
    </div>
  )
}

export function SpaceCanvasBlock({
  id,
  props,
  node,
  uploadImage,
  onField,
}: {
  id: string
  props: Record<string, unknown>
  /** The REAL published server node for this block (threaded by LiveProfileGrid). A DATA block renders THIS
   *  read-only so the edit surface is identical to the live page; absent (the /manage/layout editor) it falls
   *  back to a note. */
  node?: ReactNode
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

  // A DATA block renders the REAL published node read-only (identical to the live page); its live list can't be
  // inline-authored and its eyebrow / title fold into the node's header (edited in the rail). Without a node
  // (the /manage/layout editor), a clean note stands in so the block keeps a visible footprint.
  if (block.category === 'data') {
    if (node != null) {
      return <div className="pointer-events-none">{node}</div>
    }
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-subtle">
        Your live {block.label.toLowerCase()} shows on the published page. Edit which items appear in this
        section&rsquo;s settings.
      </p>
    )
  }

  const fields = fieldsForBlock(id)
  const fieldByKey = new Map(fields.map((f) => [f.key, f]))
  const altKey = fields.find((f) => f.key === 'alt')?.key
  const setText = (key: string) => (next: string) => {
    const trimmed = next.replace(/<br>/gi, '').trim()
    onField(key, trimmed.length ? next : undefined)
  }

  // An inline TEXT slot for a field key (or null when the block has no such field). `className` carries the
  // published typography so the selected page style renders in edit mode. A slot is RICH (Bold / Italic / Link
  // + getHTML) ONLY when the field's published render honours inline HTML (fieldRendersInlineHtml); every other
  // field is PLAIN (getText), so its text never lands as literal entities on the page. The seed is decoded once
  // so an already-corrupted value edits + shows as its true characters.
  const textSlot = (key: string, className: string) => {
    const f = fieldByKey.get(key)
    if (!f || !isCanvasTextField(f)) return null
    const rich = fieldRendersInlineHtml(id, key)
    return (
      <div key={key} className={className}>
        <SpaceEditableSlot
          value={decodeLegacyEntities(str(props, key))}
          placeholder={f.label}
          rich={rich}
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

  // ── LAYOUT-AWARE design blocks: render in the block's REAL published shape. ──
  if (DESIGN_IDS.has(id)) {
    const design = designCanvas(id, props, textSlot, imageSlot)
    if (design) return design
  }

  // ── CARD GRID (parity fix 4): the published SimpleCardGrid (design-block-view) — a heading + subheading over
  // a column-aware grid of image cards that honours the card SHAPE (image top / left), the 4/3 crop, the icon
  // fallback, and the rounded / shadow toggles, instead of the generic text stack that ignored them. Each
  // card's copy is inline-editable and each card is selectable in the rail. ──
  if (id === 'cardGrid') {
    const cols = gridColumns(props)
    const imageLeft = props.shape === 'left'
    const round = props.rounded !== false ? 'rounded-2xl' : ''
    const shade = props.shadow !== false ? 'shadow-pop' : ''
    const frame = ['overflow-hidden border border-border bg-surface', round, shade].filter(Boolean).join(' ')
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          {textSlot('title', 'text-2xl font-bold text-text')}
          {textSlot('subtitle', 'text-base leading-relaxed text-muted')}
        </div>
        <CardGridItemsCanvas
          value={props.cards}
          cols={cols}
          imageLeft={imageLeft}
          frame={frame}
          selectedIndex={store?.selectedItemIndex ?? null}
          onSelectItem={(i) => {
            store?.select(id)
            store?.selectItem(i)
          }}
          onChange={(v) => onField('cards', v)}
        />
      </div>
    )
  }

  // ── FEATURES: the header slots over the items in the SELECTED layout + columns (matches published). ──
  if (id === 'features') {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          {textSlot('eyebrow', 'text-xs font-bold uppercase tracking-[0.12em] text-primary-strong')}
          {textSlot('title', 'text-2xl font-bold text-text')}
        </div>
        <FeaturesItemsCanvas
          props={props}
          label={block.label.toLowerCase()}
          selectedIndex={store?.selectedItemIndex ?? null}
          onSelectItem={(i) => {
            store?.select(id)
            store?.selectItem(i)
          }}
          onChange={(v) => onField('items', v)}
        />
      </div>
    )
  }

  // ── CALLOUT: the published card (optional photo on top, title, rich body, button). The photo honours the
  // Shape control and the button honours its on/off toggle, the SAME way the published card does, so the
  // canvas preview matches the page (an empty h-48 default when Shape is Original / unset). ──
  if (id === 'callout') {
    const calloutImg =
      props.aspect === 'horizontal'
        ? 'aspect-[16/9]'
        : props.aspect === 'vertical'
          ? 'aspect-[4/5]'
          : props.aspect === 'square'
            ? 'aspect-square'
            : 'h-48'
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {imageSlot('image', { className: calloutImg })}
        <div className="space-y-3 p-6">
          {textSlot('title', 'text-xl font-bold text-text')}
          {textSlot('body', 'text-base leading-relaxed text-muted')}
          {props.buttonOn !== false &&
            textSlot(
              'buttonLabel',
              'mt-1 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary',
            )}
        </div>
      </div>
    )
  }

  // ── QUOTE: the published pull-quote (accent rule, italic body, attribution). ──
  if (id === 'quote') {
    return (
      <figure className="max-w-prose border-l-2 border-primary pl-4">
        {textSlot('text', 'text-lg font-medium italic text-text')}
        {textSlot('by', 'mt-2 text-sm text-muted')}
      </figure>
    )
  }

  // ── HEADING / TEXT / BUTTON: the plain member content blocks, in their published type. ──
  if (id === 'heading') {
    return <div>{textSlot('text', 'text-2xl font-bold text-text')}</div>
  }
  if (id === 'text') {
    return <div>{textSlot('text', 'max-w-prose text-base leading-relaxed text-muted')}</div>
  }
  if (id === 'button') {
    return (
      <div className="inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
        {textSlot('label', '')}
      </div>
    )
  }

  // ── STRUCTURAL blocks (Links, Music and video, Recording): a faithful READ-ONLY preview of the real block. ──
  if (STRUCTURAL_PREVIEW_IDS.has(id)) {
    return hasContent(id, props) ? (
      <div className="pointer-events-none">
        <ContentBlockView id={id} props={props} />
      </div>
    ) : (
      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
        Add your {block.label.toLowerCase()} in this block&rsquo;s settings.
      </p>
    )
  }

  // ── Generic field-stack path (Image, Gallery, Card grid): slots + a photo / thumbnail grid. ──
  const nodes = fields.map((f) => {
    // A single photo — a clickable slot that opens the on-canvas photo popup (its URL / alt live there). For
    // the Image block, crop to the selected Shape (matching the published render); Original / unset keeps the
    // photo's natural height.
    if (isCanvasImageField(f)) {
      const imgAspect =
        id === 'image'
          ? props.aspect === 'horizontal'
            ? 'aspect-[16/9]'
            : props.aspect === 'vertical'
              ? 'aspect-[4/5]'
              : props.aspect === 'square'
                ? 'aspect-square'
                : undefined
          : undefined
      return imageSlot(f.key, imgAspect ? { className: imgAspect } : undefined)
    }
    // Text copy — inline-editable slots (the WYSIWYG win). Alt is excluded (set in the photo popup).
    if (isCanvasTextField(f)) {
      const isTitle = f.key === 'title' || f.key === 'text' || f.key === 'label'
      const isEyebrow = f.key === 'eyebrow'
      const cls = isEyebrow
        ? 'text-xs font-bold uppercase tracking-[0.12em] text-subtle'
        : isTitle
          ? 'text-2xl font-bold text-text'
          : 'text-base leading-relaxed text-muted'
      return textSlot(f.key, cls)
    }
    // Cards item copy — editable on the canvas (structure stays in the rail), each card selectable.
    if (f.type === 'features' || f.type === 'cards') {
      return (
        <ItemsTextCanvas
          key={f.key}
          value={props[f.key]}
          selectedIndex={store?.selectedItemIndex ?? null}
          onSelectItem={(i) => {
            store?.select(id)
            store?.selectItem(i)
          }}
          onChange={(v) => onField(f.key, v)}
        />
      )
    }
    // A photo GALLERY (`images` list) — a read-only thumbnail grid on the canvas so the block never VANISHES
    // while editing; the photos are added / reordered in the rail. An empty gallery shows an add-in-settings
    // hint so the block still has a visible footprint.
    if (f.type === 'images') {
      const imgs = Array.isArray(props[f.key])
        ? (props[f.key] as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
        : []
      return (
        <div key={f.key} className="space-y-2">
          {imgs.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {imgs.map((src, i) => (
                <div key={`${src}-${i}`} className="overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL, not a build asset */}
                  <img src={src} alt="" className="aspect-square w-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
              Add photos to this gallery in its settings.
            </p>
          )}
          <p className="text-2xs text-subtle">Add, remove, and reorder these photos in this block&rsquo;s settings.</p>
        </div>
      )
    }
    // Every other field (toggle / enum primitives / picker / embed) is rail-only.
    return null
  })

  return <div className="space-y-3">{nodes}</div>
}

/** Map the Shape control's value to the SAME aspect ratio the published block uses (design-block-view's
 *  `aspectRatio`), as a Tailwind class so the on-canvas photo crops to the shape the operator picked
 *  (horizontal / vertical / square) rather than always reading 4/3. `original` / unset keeps the 4/3 default. */
function canvasAspect(v: unknown): string {
  return v === 'horizontal'
    ? 'aspect-[16/9]'
    : v === 'vertical'
      ? 'aspect-[4/5]'
      : v === 'square'
        ? 'aspect-square'
        : 'aspect-[4/3]'
}

/** The layout-aware canvas for one design block: its editable slots woven into the block's REAL published
 *  layout, so editing looks like the page. Two-column blocks stack at the mobile (`sm:`) breakpoint. Returns
 *  null for a design id with no bespoke layout (the caller falls back to the generic stack). */
function designCanvas(
  id: string,
  props: Record<string, unknown>,
  textSlot: (key: string, className: string) => ReactNode,
  imageSlot: (key: string, opts?: { className?: string; fill?: boolean }) => ReactNode,
): ReactNode {
  switch (id) {
    case 'zigzag': {
      // A framed photo beside a text column; `mediaSide: 'right'` puts the image second (order classes). The
      // photo honours the Shape control on the canvas, the SAME way the published block does (design-block-view
      // maps `aspect` → a crop ratio) so the editor preview matches the live page instead of always reading 4/3.
      const mediaRight = props.mediaSide === 'right'
      // Parity fix 8: published Zigzag stacks at `md:` (not `sm:`) with a gap-12 gutter, and frames the media in
      // a rounded-[1.25rem] border with a shadow-pop. Match the breakpoint + the framed shadow (the aspect crop
      // parity via canvasAspect is already correct — leave it).
      return (
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
          <div className={mediaRight ? 'md:order-2' : ''}>
            <div className="overflow-hidden rounded-[1.25rem] border border-border shadow-pop">
              {imageSlot('image', { className: canvasAspect(props.aspect) })}
            </div>
          </div>
          <div className={`space-y-3 ${mediaRight ? 'md:order-1' : ''}`}>
            {textSlot('eyebrow', EYEBROW_CLS)}
            {textSlot('title', HEADING_CLS)}
            {textSlot('body', BODY_CLS)}
          </div>
        </div>
      )
    }
    case 'photoHero': {
      // Honour the `display` control: below (photo over stacked copy), beside (2-col), overlay (copy over the
      // photo on a dark scrim). Overlay reads on-ink; the others read in the warm theme tokens. The CTA button
      // is edited ON THE CANVAS (it is a text field, filtered from the rail), gated by the `buttonOn` toggle —
      // without a slot here the "Show button" + "Button link" rail controls have nowhere to set the label, so
      // the published button could never appear. Placeholder shows where it goes until the operator types.
      const display = props.display === 'beside' || props.display === 'below' ? props.display : 'overlay'
      const buttonSlot =
        props.buttonOn !== false
          ? textSlot('buttonLabel', 'mt-1 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary')
          : null
      // The Banner headline is the published DesignHeading size="lg" (a much larger clamp) across every layout.
      if (display === 'beside') {
        return (
          <div className="grid items-center gap-8 sm:grid-cols-2">
            {imageSlot('image', { className: 'aspect-[4/3]' })}
            <div className="space-y-3">
              {textSlot('eyebrow', EYEBROW_CLS)}
              {textSlot('title', HEADING_LG_CLS)}
              {textSlot('subtitle', BODY_CLS)}
              {buttonSlot}
            </div>
          </div>
        )
      }
      if (display === 'below') {
        // Parity fix 1: published `below` frames the photo at 4/3 (not 16/9).
        return (
          <div className="space-y-4">
            {imageSlot('image', { className: 'aspect-[4/3]' })}
            <div className="space-y-3">
              {textSlot('eyebrow', EYEBROW_CLS)}
              {textSlot('title', HEADING_LG_CLS)}
              {textSlot('subtitle', BODY_CLS)}
              {buttonSlot}
            </div>
          </div>
        )
      }
      // overlay (parity fix 1): the photo fills the section, sized by the `height` control (BANNER_HEIGHT_CLASS)
      // rather than a hardcoded 16/9, veiled on the `scrim` step, with the copy CENTER-anchored (not bottom) —
      // matching published PhotoHeroBlock. The photo stays editable (clicking it opens the popup).
      const height = props.height === 'short' || props.height === 'medium' ? props.height : 'tall'
      const scrim = props.scrim === 'medium' ? BANNER_SCRIM_CLASS.medium : BANNER_SCRIM_CLASS.light
      return (
        <div className="relative overflow-hidden rounded-2xl">
          <div className="absolute inset-0">{imageSlot('image', { className: 'h-full', fill: true })}</div>
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-t ${scrim}`} aria-hidden />
          <div
            className={`relative z-10 mx-auto flex max-w-3xl flex-col items-center justify-center px-6 text-center ${BANNER_HEIGHT_CLASS[height]}`}
          >
            {textSlot('eyebrow', EYEBROW_INK_CLS)}
            {textSlot('title', HEADING_LG_INK_CLS)}
            {textSlot('subtitle', BODY_INK_CLS)}
            {buttonSlot}
          </div>
        </div>
      )
    }
    case 'editorial':
      // Parity fix 9: published EditorialSection separates the heading lockup from the body with an mb-8 gap and
      // constrains the lead measure to max-w-2xl.
      return (
        <div>
          <div className="mb-8 space-y-1">
            {textSlot('eyebrow', EYEBROW_CLS)}
            {textSlot('title', HEADING_CLS)}
          </div>
          {textSlot('body', `max-w-2xl ${BODY_CLS}`)}
        </div>
      )
    case 'accentBeat':
      // The accent beat is a centered CTA on an accent-wash card; mirror the card + button on the canvas so a
      // styled block reads TRUE while editing (not as plain text). Parity fix 7: published wraps the copy in
      // max-w-2xl with generous vertical padding (py-16 sm:py-20) and uses the kit CtaButton (rounded-2xl px-8
      // py-3.5 text-base font-bold shadow-pop + a trailing arrow). Match the button style + padding; the button
      // label edits inline like the copy.
      return (
        <div className="rounded-2xl bg-primary-bg px-6 py-16 text-center sm:py-20">
          <div className="mx-auto max-w-2xl space-y-4">
            {textSlot('eyebrow', EYEBROW_CLS)}
            {textSlot('title', HEADING_CLS)}
            {textSlot('body', BODY_CLS)}
            <div className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-3.5 text-base font-bold text-on-primary shadow-pop">
              {textSlot('buttonLabel', '')}
              <ArrowRight className="h-5 w-5" aria-hidden />
            </div>
          </div>
        </div>
      )
    case 'prose':
      return <div>{textSlot('text', `max-w-[62ch] ${BODY_CLS}`)}</div>
    case 'displayHeading':
      // Parity fix 6: published DisplayHeading applies the chosen `font` (headerFontStyle → an inline family off
      // the validated CSS-variable stacks) at a large display clamp. Honour the font + size (DISPLAY_CLS carries
      // the clamp; the inline style overrides the base font-display face for serif / grotesk).
      return (
        <div style={headerFontStyle(typeof props.font === 'string' ? props.font : undefined)}>
          {textSlot('text', DISPLAY_CLS)}
        </div>
      )
    default:
      // cardGrid has its own dedicated canvas branch (parity fix 4); nothing else needs a bespoke layout here.
      return null
  }
}

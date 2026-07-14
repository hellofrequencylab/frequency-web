import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import {
  decodeLegacyEntities,
  featureLayout,
  gridColumns,
  marginBottomClass,
  marginTopClass,
  safeUrl,
  sanitizeInlineHtml,
  textByRoleClass,
  textStyleClass,
  type BlockStyle,
  type FeatureLayout,
} from '@/lib/entity-blocks/block-content'
import {
  parseEmbedUrl,
  validateEmbedRef,
  buildEmbedSrc,
  embedHeight,
  parseLinkCard,
} from '@/lib/spotlight/embeds'
import { BlockIcon } from './block-icon'
import { RecordingBlockEmbed } from '@/components/airwaves/recording-block-embed'

// PRESENTATIONAL renderers for the operator's inline-authored CONTENT blocks (ADR-528) + the per-block
// STYLE frame. Server-safe (no hooks / no 'use client'), so the Server Component profile renderers drop
// them in directly. Every value is already sanitized by lib/entity-blocks/block-content (urls made safe,
// strings bounded), and each renderer is FAIL-SAFE: an empty bag renders nothing. Semantic DAWN tokens
// only (no hex), voice canon (no em dashes).

/** Read a string prop (already sanitized upstream). */
function s(props: Record<string, unknown>, key: string): string {
  const v = props[key]
  return typeof v === 'string' ? v : ''
}

/** The safe inline-HTML string for an operator-authored value: heal a legacy double-escape FIRST (a value
 *  stored as entities but no real markup renders its true characters once here instead of literal `&quot;`),
 *  then sanitize to the allowlist (Bold / Italic / Link marks + <br> survive; a real newline becomes a <br>;
 *  EVERYTHING else is escaped as inert text). A plain-text value round-trips unchanged. '' when nothing
 *  survives. Exposed so a bespoke element that must keep its own attributes (an eyebrow's `data-text-role`)
 *  paints the same rich HTML without re-declaring the pipeline. */
export function inlineRichHtml(value: string): string {
  return sanitizeInlineHtml(decodeLegacyEntities(value))
}

/** Render an operator's inline-rich TEXT value (a slot authored on the WYSIWYG canvas) through the safe
 *  allowlist above, in the given tag — so a heading / title / body renders its <br> line breaks and inline
 *  marks EXACTLY as the editor canvas shows them, instead of escaping `<br>` to a literal `<BR>`. The value is
 *  re-sanitised HERE on read (defence in depth — a stored blob is user-originated and never trusted, mirroring
 *  the email renderer), so no unsafe markup can reach the page. Returns null when nothing survives. */
export function InlineRichText({
  as: Tag = 'p',
  value,
  className,
}: {
  as?: 'p' | 'blockquote' | 'h1' | 'h2' | 'h3' | 'h4' | 'span' | 'div' | 'figcaption'
  value: string
  className?: string
}) {
  const html = inlineRichHtml(value)
  if (!html) return null
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

/** The per-block STYLE frame (ADR-528 → ADR-569): an optional card background, a padding step, alignment, a
 *  reusable text-style bag (C1: size / weight / color / shadow), and top/bottom margins (C3). Collapses to a
 *  passthrough when the style is empty, so an unstyled block renders exactly as before (the base inter-block
 *  rhythm is owned by the grid stack — see entity-grid — so C2's breathing room needs no per-block margin). */
export function BlockStyleFrame({ style, children }: { style: BlockStyle | undefined; children: ReactNode }) {
  const bgOff = style?.background === false
  const bgOn = style?.background === true
  const pad = style?.pad === 'lg' ? 'p-8' : style?.pad === 'md' ? 'p-5' : style?.pad === 'sm' ? 'p-3' : bgOn ? 'p-5' : ''
  const align = style?.align === 'center' ? 'text-center' : style?.align === 'end' ? 'text-right' : ''
  // `background: true` fills the block with the plain WHITE surface (bg-surface) against the warm page
  // canvas — a clean "white background on", not a second elevated/tinted card layer on top.
  const card = bgOn ? 'rounded-2xl border border-border bg-surface' : ''
  // `background: false` (item 6) STRIPS the white box a self-carding block draws. A DATA section nests its
  // card inside a ModuleSection <section>, so a direct-child strip misses it — the `.entity-bg-strip` rule
  // (globals.css, ADR-551) flattens every bg-surface card nested at ANY depth to transparent (no border, no
  // shadow), so the section reads flush on the page canvas regardless of how the block nests.
  const strip = bgOff ? 'entity-bg-strip' : ''
  // C1: the text-style bag (size / weight / token-color / shadow) resolves to token-driven utilities the
  // block's text inherits. C3: an explicit top / bottom margin adds space above / below (absent = no class,
  // so the stack rhythm stands).
  const text = textStyleClass(style?.text)
  // Per-element text styling (ADR-580, item 4): role-scoped classes target the block's Heading / Body /
  // Eyebrow independently, on the SAME wrapper as the whole-block text style.
  const byRole = textByRoleClass(style?.textByRole)
  const margins = [marginTopClass(style?.mt), marginBottomClass(style?.mb)].filter(Boolean).join(' ')
  const cls = [margins, card, strip, pad, align, text, byRole].filter(Boolean).join(' ')
  return cls ? <div className={cls}>{children}</div> : <>{children}</>
}

// ── Features (ADR-585): the flexible highlight engine, five layouts over a shared item shape ──────────────

/** One resolved Features item, read from the (already sanitized / injected) content bag. An item shows an
 *  icon OR an image, a title + text, an optional price, and an optional CTA link. */
type FeatureItem = {
  icon: string
  image: string
  title: string
  text: string
  price: string
  link: string
  cta: string
}

/** Read the block's items into the shared FeatureItem shape (values are already sanitized upstream). */
function readFeatureItems(raw: unknown): FeatureItem[] {
  if (!Array.isArray(raw)) return []
  return (raw as Array<Record<string, unknown>>)
    .map((it) => ({
      icon: typeof it.icon === 'string' ? it.icon : '',
      image: safeUrl(it.image),
      // Item title + text render through InlineRichText below (so their <br> + marks match the editor); the
      // pre-decode heals any legacy entity double-escape and InlineRichText re-sanitises idempotently on read.
      title: typeof it.title === 'string' ? decodeLegacyEntities(it.title) : '',
      text: typeof it.text === 'string' ? decodeLegacyEntities(it.text) : '',
      price: typeof it.price === 'string' ? it.price : '',
      link: safeUrl(it.link),
      cta: typeof it.cta === 'string' ? it.cta : '',
    }))
    .filter((it) => it.title || it.text || it.image)
}

/** The responsive grid-columns utility for a 2 / 3 / 4 column count (mobile stays single-column). */
function gridColsClass(n: 2 | 3 | 4): string {
  return n === 2 ? 'sm:grid-cols-2' : n === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'
}

/** An item's media: its image (when set) at the given crop, else its icon glyph. Null when it has neither. */
function FeatureMedia({ item, variant }: { item: FeatureItem; variant: 'inline' | 'top' | 'spotlight' }): ReactNode {
  if (item.image) {
    const cls =
      variant === 'top'
        ? 'aspect-[4/3] w-full rounded-xl object-cover'
        : variant === 'spotlight'
          ? 'aspect-[4/3] w-full rounded-2xl object-cover'
          : 'h-12 w-12 shrink-0 rounded-xl object-cover'
    // eslint-disable-next-line @next/next/no-img-element -- operator/offering image URL (safeUrl-checked)
    return <img src={item.image} alt="" className={cls} />
  }
  if (item.icon) {
    return (
      <div className="shrink-0 text-primary-strong" aria-hidden>
        <BlockIcon name={item.icon} size={variant === 'inline' ? 26 : 30} />
      </div>
    )
  }
  return null
}

/** An item's price line (a small accent tag). Null when there is no price. */
function FeaturePrice({ price }: { price: string }): ReactNode {
  return price ? <p className="text-sm font-semibold text-primary-strong">{price}</p> : null
}

/** An item's CTA button, over its link (label falls back to a plain "Learn more"). Null with no link. */
function FeatureCta({ item }: { item: FeatureItem }): ReactNode {
  if (!item.link) return null
  return (
    <a
      href={item.link}
      className="mt-1 inline-flex items-center gap-1 self-start rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-primary hover:text-primary-strong"
    >
      {item.cta || 'Learn more'}
    </a>
  )
}

/** The item's title + text + price + CTA, stacked. Shared by every layout's text column. */
function FeatureBody({ item, titleClass }: { item: FeatureItem; titleClass: string }): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      {item.title && <InlineRichText as="h4" value={item.title} className={titleClass} />}
      {item.text && (
        <InlineRichText value={item.text} className="whitespace-pre-wrap text-sm leading-relaxed text-muted" />
      )}
      <FeaturePrice price={item.price} />
      <FeatureCta item={item} />
    </div>
  )
}

/** The Features block (ADR-585). Reads the eyebrow + heading + items + layout + columns from the bag and
 *  dispatches on the layout. FAIL-SAFE: nothing to show renders null so the row reserves no height. */
function FeaturesBlock({ props }: { props: Record<string, unknown> }): ReactNode {
  const eyebrow = s(props, 'eyebrow')
  const title = s(props, 'title')
  const items = readFeatureItems(props.items)
  const layout: FeatureLayout = featureLayout(props)
  const cols = gridColumns(props)
  if (!eyebrow && !title && !items.length) return null

  // The eyebrow keeps its `data-text-role` marker (per-element text styling targets it), so it paints the
  // shared rich HTML on its own <p> rather than through InlineRichText — otherwise identical (br + marks).
  const eyebrowHtml = eyebrow ? inlineRichHtml(eyebrow) : ''
  const header =
    eyebrow || title ? (
      <div className="space-y-1">
        {eyebrowHtml && (
          <p
            data-text-role="eyebrow"
            className="text-xs font-bold uppercase tracking-[0.12em] text-primary-strong"
            dangerouslySetInnerHTML={{ __html: eyebrowHtml }}
          />
        )}
        {title && <InlineRichText as="h3" value={title} className="text-2xl font-bold text-text" />}
      </div>
    ) : null

  let body: ReactNode = null

  if (layout === 'list') {
    // Today's look: an icon (or small image) beside a title + text, stacked. A whole-item link wraps the row.
    body = (
      <div className="flex flex-col gap-5">
        {items.map((it, i) => {
          const inner = (
            <>
              <FeatureMedia item={it} variant="inline" />
              <FeatureBody item={it} titleClass="text-base font-bold text-text" />
            </>
          )
          const rowCls = 'flex items-start gap-3'
          return it.link ? (
            <a key={i} href={it.link} className={`${rowCls} rounded-xl transition-colors hover:bg-surface-elevated`}>
              {inner}
            </a>
          ) : (
            <div key={i} className={rowCls}>
              {inner}
            </div>
          )
        })}
      </div>
    )
  } else if (layout === 'columns') {
    // A 2-4 up grid: media on top of a title + text + price + CTA, no card frame (that is the `cards` layout).
    body = (
      <div className={`grid gap-6 ${gridColsClass(cols)}`}>
        {items.map((it, i) => (
          <div key={i} className="flex flex-col gap-2">
            <FeatureMedia item={it} variant="top" />
            <FeatureBody item={it} titleClass="text-base font-bold text-text" />
          </div>
        ))}
      </div>
    )
  } else if (layout === 'stats') {
    // Big value + label: the price (or the title) reads as the headline number, the text (or title) as label.
    body = (
      <div className={`grid gap-6 ${gridColsClass(cols)}`}>
        {items.map((it, i) => {
          const big = it.price || it.title
          const label = it.price ? it.title || it.text : it.text
          const stat = (
            <>
              {big && <InlineRichText as="div" value={big} className="text-4xl font-bold leading-none text-primary-strong" />}
              {label && <InlineRichText as="div" value={label} className="mt-2 text-sm leading-relaxed text-muted" />}
            </>
          )
          return it.link ? (
            <a key={i} href={it.link} className="block rounded-2xl border border-border bg-surface p-6 text-center transition-colors hover:border-primary">
              {stat}
            </a>
          ) : (
            <div key={i} className="rounded-2xl border border-border bg-surface p-6 text-center">
              {stat}
            </div>
          )
        })}
      </div>
    )
  } else if (layout === 'cards') {
    // Image cards: a framed card with the photo (or icon) on top of the body. A whole-item link wraps it.
    body = (
      <div className={`grid gap-6 ${gridColsClass(cols)}`}>
        {items.map((it, i) => {
          const card = (
            <>
              {it.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator/offering image URL (safeUrl-checked)
                <img src={it.image} alt="" className="aspect-[4/3] w-full object-cover" />
              ) : it.icon ? (
                <div className="flex h-14 items-center px-5 pt-5 text-primary-strong" aria-hidden>
                  <BlockIcon name={it.icon} size={30} />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col gap-1 p-5">
                {it.title && <InlineRichText as="h4" value={it.title} className="text-base font-bold text-text" />}
                {it.text && (
                  <InlineRichText value={it.text} className="whitespace-pre-wrap text-sm leading-relaxed text-muted" />
                )}
                <FeaturePrice price={it.price} />
                <FeatureCta item={it} />
              </div>
            </>
          )
          const cardCls = 'flex flex-col overflow-hidden rounded-2xl border border-border bg-surface'
          return it.link ? (
            <a key={i} href={it.link} className={`${cardCls} transition-colors hover:border-primary`}>
              {card}
            </a>
          ) : (
            <div key={i} className={cardCls}>
              {card}
            </div>
          )
        })}
      </div>
    )
  } else {
    // Spotlight: full-width rows, the media alternating left / right of the text (item media falls back to the
    // icon on a wash when there is no photo). On mobile every row stacks media-over-text.
    body = (
      <div className="flex flex-col gap-10">
        {items.map((it, i) => {
          const media = it.image ? (
            <FeatureMedia item={it} variant="spotlight" />
          ) : it.icon ? (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-primary-bg text-primary-strong" aria-hidden>
              <BlockIcon name={it.icon} size={56} />
            </div>
          ) : null
          const flip = i % 2 === 1
          return (
            <div key={i} className={`flex flex-col gap-5 sm:items-center ${flip ? 'sm:flex-row-reverse' : 'sm:flex-row'}`}>
              {media && <div className="sm:w-1/2">{media}</div>}
              <div className={media ? 'sm:w-1/2' : 'w-full'}>
                <FeatureBody item={it} titleClass="text-xl font-bold text-text" />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      {body}
    </div>
  )
}

/** Render ONE authored content block by id from its sanitized props. Returns null when it has no content,
 *  so an empty block leaves no gap. */
export function ContentBlockView({ id, props }: { id: string; props: Record<string, unknown> }): ReactNode {
  switch (id) {
    case 'callout': {
      // A highlighted card: optional image, a title, a message, and one call-to-action button (ADR-542).
      const title = s(props, 'title')
      const body = s(props, 'body')
      const image = safeUrl(props.image)
      const buttonUrl = safeUrl(props.buttonUrl)
      const buttonLabel = s(props, 'buttonLabel')
      // Fix 8: the button ALWAYS renders once it has a label and is toggled on — a no-link button falls
      // back to '#' until the operator wires it, rather than hiding. `buttonOn` defaults ON when a label is
      // present; the edit panel's toggle persists `buttonOn: false` to turn it off.
      const buttonOn = props.buttonOn !== false
      const hasButton = !!buttonLabel && buttonOn
      // Collapse: with nothing to show (no title, body, image, or button) the block returns null so its row
      // reserves NO height (Fix 8) — the grid renders an empty stack as nothing, never a hollow box.
      if (!title && !body && !image && !hasButton) return null
      // The Callout image honours the same Shape control as the Image block (item 2). `original` keeps the
      // classic banner crop (h-48); the others crop to a fixed ratio.
      const calloutAspect =
        props.aspect === 'horizontal'
          ? 'aspect-[16/9]'
          : props.aspect === 'vertical'
            ? 'aspect-[4/5]'
            : props.aspect === 'square'
              ? 'aspect-square'
              : 'h-48'
      return (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- operator-supplied arbitrary URL
            <img src={image} alt="" className={`w-full object-cover ${calloutAspect}`} />
          )}
          <div className="space-y-3 p-6">
            {title && <InlineRichText as="h3" value={title} className="text-xl font-bold text-text" />}
            {body && <InlineRichText value={body} className="whitespace-pre-wrap text-base leading-relaxed text-muted" />}
            {hasButton && (
              <a
                href={buttonUrl || '#'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                <InlineRichText as="span" value={buttonLabel} />
              </a>
            )}
          </div>
        </div>
      )
    }
    case 'features':
      // The FLEXIBLE highlight engine (ADR-585): an eyebrow + heading over items that render in one of five
      // layouts. The items are the operator's authored `items`, OR (for a data source) the offering / event /
      // tier items resolved server-side and injected as `items` before this renders — either way this reads
      // `props.items`, so the switch here is layout-only.
      return <FeaturesBlock props={props} />
    case 'heading': {
      const text = s(props, 'text')
      // Render through the inline-rich path so a heading authored with a <br> (or a Bold / Italic / Link mark)
      // shows a real line break / mark on the page, EXACTLY as the editor canvas does — not a literal `<BR>`.
      return text ? <InlineRichText as="h2" value={text} className="text-2xl font-bold text-text" /> : null
    }
    case 'button': {
      // A labeled call-to-action link (shared with Email Studio). A no-link button falls back to '#' until
      // the operator wires it (matching the callout button); no label means nothing to render.
      const label = s(props, 'label')
      if (!label) return null
      const url = safeUrl(props.url)
      const justify = props.align === 'center' ? 'justify-center' : props.align === 'end' ? 'justify-end' : 'justify-start'
      return (
        <div className={`flex ${justify}`}>
          <a
            href={url || '#'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <InlineRichText as="span" value={label} />
          </a>
        </div>
      )
    }
    case 'text': {
      const text = s(props, 'text')
      // Cap the line length at a readable measure (max-w-prose ~65ch) so long-form copy never runs edge to
      // edge in a wide single-column row. A no-op in a narrow / multi-column row (the column is already
      // shorter than the cap).
      return text ? (
        <InlineRichText value={text} className="max-w-prose whitespace-pre-wrap text-base leading-relaxed text-muted" />
      ) : null
    }
    case 'links': {
      const items = Array.isArray(props.items) ? (props.items as Array<{ label?: unknown; url?: unknown }>) : []
      const links = items
        .map((it) => ({ label: typeof it.label === 'string' ? it.label : '', url: safeUrl(it.url) }))
        .filter((it) => it.url)
      if (!links.length) return null
      return (
        <ul className="flex flex-col gap-2">
          {links.map((it, i) => (
            <li key={`${it.url}-${i}`}>
              <a
                href={it.url}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary-strong"
              >
                {it.label || it.url}
              </a>
            </li>
          ))}
        </ul>
      )
    }
    case 'image': {
      const src = safeUrl(props.src)
      if (!src) return null
      // Aspect shape (sanitized segmented upstream): original keeps the photo's natural ratio; the others
      // crop to a fixed ratio via object-cover.
      const aspect =
        props.aspect === 'horizontal'
          ? 'aspect-[16/9]'
          : props.aspect === 'vertical'
            ? 'aspect-[4/5]'
            : props.aspect === 'square'
              ? 'aspect-square'
              : ''
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied arbitrary URL; next/image needs configured domains
      return <img src={src} alt={s(props, 'alt')} className={`w-full rounded-2xl object-cover ${aspect}`.trim()} />
    }
    case 'gallery': {
      const images = Array.isArray(props.images)
        ? (props.images as unknown[]).map(safeUrl).filter((u) => u.length > 0)
        : []
      if (!images.length) return null
      // Three views + a spacing step (Fix: gallery layout options). `view` and `gap` are sanitized enum
      // primitives upstream; default to the classic grid at standard spacing.
      const view = props.view === 'masonry' || props.view === 'carousel' ? props.view : 'grid'
      const gap = props.gap === 'tight' || props.gap === 'roomy' ? props.gap : 'standard'
      const gapClass = gap === 'tight' ? 'gap-1.5' : gap === 'roomy' ? 'gap-6' : 'gap-3'
      // ONE image sink for every view: the src is already safeUrl-sanitized above, and funnelling all three
      // layouts through this single element keeps the operator-URL sink count to one (grid / masonry /
      // carousel only vary the per-tile className + the wrapper).
      const tile = (src: string, i: number, className: string) => (
        // eslint-disable-next-line @next/next/no-img-element -- operator-supplied arbitrary URL (safeUrl-checked)
        <img key={`${src}-${i}`} src={src} alt="" className={className} />
      )

      if (view === 'carousel') {
        // A horizontal, scroll-snapping strip: each photo keeps its shape and the row scrolls (CSS only).
        return (
          <div className={`flex snap-x snap-mandatory overflow-x-auto pb-2 ${gapClass}`}>
            {images.map((src, i) => tile(src, i, 'aspect-[4/3] w-64 shrink-0 snap-start rounded-xl object-cover sm:w-80'))}
          </div>
        )
      }

      if (view === 'masonry') {
        // A columned masonry: photos keep their natural aspect and tile without gaps (CSS multi-column).
        const vGap = gap === 'tight' ? 'mb-1.5' : gap === 'roomy' ? 'mb-6' : 'mb-3'
        return (
          <div className={`columns-2 sm:columns-3 ${gapClass}`}>
            {images.map((src, i) => tile(src, i, `w-full break-inside-avoid rounded-xl object-cover ${vGap}`))}
          </div>
        )
      }

      // Grid (default): an even grid, cropped to the chosen Shape (item 2). `original` keeps the uniform
      // square; the others crop every tile to a fixed ratio so the grid stays even.
      const gridAspect =
        props.aspect === 'horizontal'
          ? 'aspect-[16/9]'
          : props.aspect === 'vertical'
            ? 'aspect-[4/5]'
            : 'aspect-square'
      return (
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${gapClass}`}>
          {images.map((src, i) => tile(src, i, `${gridAspect} w-full rounded-xl object-cover`))}
        </div>
      )
    }
    case 'quote': {
      const text = s(props, 'text')
      if (!text) return null
      const by = s(props, 'by')
      return (
        <figure className="max-w-prose border-l-2 border-primary pl-4">
          <InlineRichText as="blockquote" value={text} className="text-lg font-medium italic text-text" />
          {by && <InlineRichText as="figcaption" value={by} className="mt-2 text-sm text-muted" />}
        </figure>
      )
    }
    case 'embed': {
      // NEVER trust the stored URL as an iframe src (ADR-437). Re-derive a validated (provider, ref) —
      // from the pasted share URL, or a legacy { provider, ref } bag (Spotlight round-trip) — and
      // RECONSTRUCT the known-safe embed src. A supported-but-unembeddable host (Insight Timer) renders a
      // link-out card instead of a frame. Anything unrecognized renders nothing.
      const embed = parseEmbedUrl(props.url) ?? validateEmbedRef(props.provider, props.ref)
      if (embed) {
        const src = buildEmbedSrc(embed.provider, embed.ref)
        return (
          <div className="w-full overflow-hidden rounded-2xl border border-border">
            <iframe
              src={src}
              title="Embedded media"
              className="w-full"
              height={embedHeight(embed.provider, embed.ref)}
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
              allow="autoplay; encrypted-media; clipboard-write; picture-in-picture; fullscreen"
            />
          </div>
        )
      }
      const card = typeof props.url === 'string' ? parseLinkCard(props.url) : null
      if (card) {
        return (
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4 text-sm font-semibold text-text transition-colors hover:border-border-strong hover:bg-surface-elevated"
          >
            <span>Listen on {card.label}</span>
            <ExternalLink className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
          </a>
        )
      }
      return null
    }
    case 'recording': {
      // Airwaves (ADR-608, §6a): mount the gated client player for one Recording. Like the `embed` case, the
      // server shell stays presentational and the interactive island does the work — here it hydrates through
      // the resolve route, which walls a private Recording server-side (a locked card, never the src). An
      // empty id renders nothing (the established fail-safe), so a stray block leaves no gap.
      const recordingId = s(props, 'recordingId')
      if (!recordingId) return null
      const display = props.display === 'compact' ? 'compact' : 'full'
      const autoplay = props.autoplay === true
      const showTranscript = props.showTranscript !== false
      return (
        <RecordingBlockEmbed
          recordingId={recordingId}
          display={display}
          autoplay={autoplay}
          showTranscript={showTranscript}
        />
      )
    }
    case 'divider':
      return <hr className="border-border" />
    default:
      return null
  }
}

/** Whether an authored content bag has anything to render (used to decide the fallback path). */
export function hasContent(id: string, props: Record<string, unknown> | undefined): boolean {
  if (!props) return false
  if (id === 'divider') return true
  return Object.keys(props).length > 0
}

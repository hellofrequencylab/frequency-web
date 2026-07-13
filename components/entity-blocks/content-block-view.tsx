import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import {
  marginBottomClass,
  marginTopClass,
  safeUrl,
  sanitizeInlineHtml,
  textByRoleClass,
  textStyleClass,
  type BlockStyle,
} from '@/lib/entity-blocks/block-content'
import {
  parseEmbedUrl,
  validateEmbedRef,
  buildEmbedSrc,
  embedHeight,
  parseLinkCard,
} from '@/lib/spotlight/embeds'
import { BlockIcon } from './block-icon'

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

/** Render an operator's inline-rich TEXT value (a `textarea` slot authored on the WYSIWYG canvas) as
 *  sanitized inline HTML: Bold / Italic / Link marks and <br> survive, EVERYTHING else is escaped as text.
 *  The value is re-sanitised HERE on read (defence in depth — a stored blob is user-originated and never
 *  trusted, mirroring the email renderer), so a plain-text value round-trips unchanged and no unsafe markup
 *  can reach the page. Returns null when nothing survives. */
function InlineRichText({
  as: Tag = 'p',
  value,
  className,
}: {
  as?: 'p' | 'blockquote'
  value: string
  className?: string
}) {
  const html = sanitizeInlineHtml(value)
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
            {title && <h3 className="text-xl font-bold text-text">{title}</h3>}
            {body && <InlineRichText value={body} className="whitespace-pre-wrap text-base leading-relaxed text-muted" />}
            {hasButton && (
              <a
                href={buttonUrl || '#'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                {buttonLabel}
              </a>
            )}
          </div>
        </div>
      )
    }
    case 'features': {
      // TEXT-FORWARD features (email overhaul): an optional eyebrow, then a list (or two-up) of items, each an
      // icon + title + text and an OPTIONAL whole-item link. No images (that is the Card grid's job), so this
      // reads clearly apart from the visual Card grid.
      const eyebrow = s(props, 'eyebrow')
      const items = Array.isArray(props.items)
        ? (props.items as Array<{ icon?: unknown; title?: unknown; text?: unknown; link?: unknown }>)
            .map((it) => ({
              icon: typeof it.icon === 'string' ? it.icon : '',
              title: typeof it.title === 'string' ? it.title : '',
              text: typeof it.text === 'string' ? it.text : '',
              link: safeUrl(it.link),
            }))
            .filter((it) => it.title || it.text)
        : []
      if (!eyebrow && !items.length) return null
      const twoUp = props.layout === 'twoUp'
      const listCls = twoUp ? 'grid gap-5 sm:grid-cols-2' : 'flex flex-col gap-5'
      return (
        <div className="space-y-4">
          {eyebrow && (
            <p data-text-role="eyebrow" className="text-xs font-bold uppercase tracking-[0.12em] text-primary-strong">
              {eyebrow}
            </p>
          )}
          {items.length > 0 && (
            <div className={listCls}>
              {items.map((it, i) => {
                const inner = (
                  <>
                    {it.icon && (
                      <div className="shrink-0 text-primary-strong" aria-hidden>
                        <BlockIcon name={it.icon} size={26} />
                      </div>
                    )}
                    <div className="space-y-1">
                      {it.title && <h4 className="text-base font-bold text-text">{it.title}</h4>}
                      {it.text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{it.text}</p>}
                    </div>
                  </>
                )
                const rowCls = 'flex items-start gap-3'
                return it.link ? (
                  <a
                    key={`${it.title}-${i}`}
                    href={it.link}
                    className={`${rowCls} rounded-xl transition-colors hover:bg-surface-elevated`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={`${it.title}-${i}`} className={rowCls}>
                    {inner}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }
    case 'heading': {
      const text = s(props, 'text')
      return text ? <h2 className="text-2xl font-bold text-text">{text}</h2> : null
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
            {label}
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
          {by && <figcaption className="mt-2 text-sm text-muted">{by}</figcaption>}
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

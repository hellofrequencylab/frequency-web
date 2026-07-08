import type { ReactNode } from 'react'
import {
  marginBottomClass,
  marginTopClass,
  safeUrl,
  textStyleClass,
  type BlockStyle,
} from '@/lib/entity-blocks/block-content'

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
  const margins = [marginTopClass(style?.mt), marginBottomClass(style?.mb)].filter(Boolean).join(' ')
  const cls = [margins, card, strip, pad, align, text].filter(Boolean).join(' ')
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
      return (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- operator-supplied arbitrary URL
            <img src={image} alt="" className="h-48 w-full object-cover" />
          )}
          <div className="space-y-3 p-6">
            {title && <h3 className="text-xl font-bold text-text">{title}</h3>}
            {body && <p className="whitespace-pre-wrap text-base leading-relaxed text-muted">{body}</p>}
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
      // A responsive grid of features, each an optional icon (an emoji or short token), a title, and text.
      const items = Array.isArray(props.items)
        ? (props.items as Array<{ icon?: unknown; title?: unknown; text?: unknown }>)
            .map((it) => ({
              icon: typeof it.icon === 'string' ? it.icon : '',
              title: typeof it.title === 'string' ? it.title : '',
              text: typeof it.text === 'string' ? it.text : '',
            }))
            .filter((it) => it.title || it.text)
        : []
      if (!items.length) return null
      return (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <div key={`${it.title}-${i}`} className="space-y-2 rounded-2xl border border-border bg-surface p-5">
              {it.icon && <div className="text-2xl leading-none" aria-hidden>{it.icon}</div>}
              {it.title && <h4 className="text-base font-bold text-text">{it.title}</h4>}
              {it.text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{it.text}</p>}
            </div>
          ))}
        </div>
      )
    }
    case 'heading': {
      const text = s(props, 'text')
      return text ? <h2 className="text-2xl font-bold text-text">{text}</h2> : null
    }
    case 'text': {
      const text = s(props, 'text')
      return text ? <p className="whitespace-pre-wrap text-base leading-relaxed text-muted">{text}</p> : null
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

      // Grid (default): an even, square-cropped grid.
      return (
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${gapClass}`}>
          {images.map((src, i) => tile(src, i, 'aspect-square w-full rounded-xl object-cover'))}
        </div>
      )
    }
    case 'quote': {
      const text = s(props, 'text')
      if (!text) return null
      const by = s(props, 'by')
      return (
        <figure className="border-l-2 border-primary pl-4">
          <blockquote className="text-lg font-medium italic text-text">{text}</blockquote>
          {by && <figcaption className="mt-2 text-sm text-muted">{by}</figcaption>}
        </figure>
      )
    }
    case 'embed': {
      const url = safeUrl(props.url)
      if (!url) return null
      return (
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border">
          <iframe
            src={url}
            title="Embedded content"
            className="h-full w-full"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            referrerPolicy="no-referrer"
            allowFullScreen
          />
        </div>
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

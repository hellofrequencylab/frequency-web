import type { ReactNode } from 'react'
import { safeUrl, type BlockStyle } from '@/lib/entity-blocks/block-content'

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

/** The per-block STYLE frame: an optional card background, a padding step, and alignment. Collapses to a
 *  passthrough (no wrapper element beyond alignment) when the style is empty, so an unstyled block renders
 *  exactly as before. */
export function BlockStyleFrame({ style, children }: { style: BlockStyle | undefined; children: ReactNode }) {
  if (!style || (!style.background && !style.pad && !style.align)) return <>{children}</>
  const pad =
    style.pad === 'lg' ? 'p-8' : style.pad === 'md' ? 'p-5' : style.pad === 'sm' ? 'p-3' : style.background ? 'p-5' : ''
  const align = style.align === 'center' ? 'text-center' : style.align === 'end' ? 'text-right' : ''
  const card = style.background ? 'rounded-2xl border border-border bg-surface-elevated' : ''
  const cls = [card, pad, align].filter(Boolean).join(' ')
  return <div className={cls}>{children}</div>
}

/** Render ONE authored content block by id from its sanitized props. Returns null when it has no content,
 *  so an empty block leaves no gap. */
export function ContentBlockView({ id, props }: { id: string; props: Record<string, unknown> }): ReactNode {
  switch (id) {
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
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied arbitrary URL; next/image needs configured domains
      return <img src={src} alt={s(props, 'alt')} className="w-full rounded-2xl object-cover" />
    }
    case 'gallery': {
      const images = Array.isArray(props.images)
        ? (props.images as unknown[]).map(safeUrl).filter((u) => u.length > 0)
        : []
      if (!images.length) return null
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- operator-supplied arbitrary URL
            <img key={`${src}-${i}`} src={src} alt="" className="aspect-square w-full rounded-xl object-cover" />
          ))}
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

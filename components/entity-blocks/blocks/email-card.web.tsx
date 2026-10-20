import { safeImageUrl, safeUrl } from '@/lib/entity-blocks/block-content'

// THE ONE WEB COMPONENT OF AN EMAIL-ONLY DATA CARD (Product, Event, Circle: lib/entity-blocks/contract/).
// These cards are filled from live rows at send time and appear on the web only in the email preview, so
// the web form is the snapshot the email carries: an image, a title, a line, and one link.
export default function EmailCardBlock(props: Record<string, unknown>) {
  const str = (k: string) => (typeof props[k] === 'string' ? (props[k] as string) : '')
  const title = str('title')
  if (!title) return null
  const href = safeUrl(str('url'))
  const image = safeImageUrl(str('image'))
  const line = str('price') || str('when') || str('blurb')
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- operator asset URL snapshot, not a build asset */}
      {image ? <img src={image} alt="" className="mb-3 w-full rounded-card" /> : null}
      <p className="font-semibold text-foreground">{title}</p>
      {line ? <p className="text-sm text-muted-foreground">{line}</p> : null}
      {href ? (
        <a href={href} className="mt-2 inline-block text-sm underline">
          {str('ctaLabel') || 'Open'}
        </a>
      ) : null}
    </div>
  )
}

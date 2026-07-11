import Link from 'next/link'

// The one browse-card shell — every entity grid (circles, channels, events,
// partners, people, programs) renders through this so cards read identically
// everywhere instead of each page hand-rolling its own (DESIGN.md "Browse-page
// redesign standard" §4; REDESIGN-INAPP defect #4). A card means a *distinct
// object* — so it earns the soft bordered surface; lists/sections do not (use
// SectionHeader + whitespace).
//
// Presentational + server-friendly (no hooks), so it drops into Server
// Components. The whole card is the link; an optional `action` (its own client
// component — e.g. one-tap RSVP / tune-in) floats top-right and handles its own
// click, so it never nests an interactive control inside the anchor.
//
//   <EntityCard
//     href={`/circles/${c.slug}`}
//     anchor={<Avatar … />}
//     title={c.name}
//     context={`${c.city} · ${c.memberCount} members`}
//     description={c.about}
//     meta={<><Pill>…</Pill><span>…</span></>}
//     action={<TuneInButton … />}
//   />

export function EntityCard({
  href,
  anchor,
  cover,
  coverOverlay,
  coverAction,
  title,
  badge,
  context,
  description,
  meta,
  metaNoWrap = false,
  action,
  footer,
  coverAspect = 'video',
  dimmed = false,
}: {
  href: string
  /** Avatar / icon chip — the visual anchor (inline, beside the title). */
  anchor?: React.ReactNode
  /** Full-bleed banner image at the TOP of the card (a 16:9 header). When given,
   *  the image leads the card and the title sits beneath it. Provide an
   *  `<Image fill>` or a placeholder; it fills a relative, clipped box (its ratio
   *  set by `coverAspect`). */
  cover?: React.ReactNode
  /** DECORATIVE overlay painted ON the cover (pills, a logo chip, a legibility scrim). Sits INSIDE
   *  the profile link and is `pointer-events-none`, so it never intercepts a click or nests an
   *  interactive control in the anchor — it purely decorates the banner. Only rendered with `cover`. */
  coverOverlay?: React.ReactNode
  /** A real interactive control overlaid at the BOTTOM-RIGHT of the cover (e.g. a Space's action
   *  Link). Rendered as a SIBLING of the profile link (outside it), so it is a separate tab stop and
   *  never nests an anchor inside the card's main anchor. Only rendered with `cover`. */
  coverAction?: React.ReactNode
  title: React.ReactNode
  /** Small pill shown next to the title (e.g. a Beta-demo marker). */
  badge?: React.ReactNode
  /** One-line context under the title (city · type · count). */
  context?: React.ReactNode
  /** Two-line description (clamped). */
  description?: React.ReactNode
  /** Footer row — pills, counts, relative time. */
  meta?: React.ReactNode
  /** Keep the meta on ONE row: no wrap, overflow clipped, so dense stats never spill to a
   *  second line. Children should mark fixed stats `shrink-0` and let one descriptive span
   *  `truncate` (min-w-0) absorb the overflow. Default false (the wrapping row). */
  metaNoWrap?: boolean
  /** Optional top-right action; its own client component (handles its click). */
  action?: React.ReactNode
  /** Optional full-width action pinned to the BOTTOM of the card, below a divider (its own client
   *  component — e.g. an Adopt toggle). Sits outside the link so it never nests a control in the
   *  anchor, while reading as part of the card. */
  footer?: React.ReactNode
  /** Cover aspect ratio: 'video' (16:9, the default) or 'short' (16:7, a slimmer banner for
   *  denser catalogs). Only applies when `cover` is set. */
  coverAspect?: 'video' | 'short'
  /** Recede the card (muted + desaturated) — used for Beta demo content. */
  dimmed?: boolean
}) {
  const coverAspectClass = coverAspect === 'short' ? 'aspect-[16/7]' : 'aspect-[16/9]'
  return (
    <div
      className={`group press relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-[colors,transform] hover:border-primary-bg hover:shadow-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-canvas motion-reduce:transition-none ${
        dimmed ? 'dimmed' : ''
      }`}
    >
      <Link href={href} className="flex flex-1 flex-col outline-none">
        {cover && (
          // focal-point: the `cover` node is caller-supplied, so a focal point is applied where the
          // caller builds it — pass `style={{ objectPosition }}` on the <Image>/<img> inside `cover`,
          // sourced from ImageFocalPicker (components/ui/image-focal-picker). Defaults to a centered
          // crop until the entity stores a focal point. See lib/images/focal-point.ts.
          <div className={`relative ${coverAspectClass} w-full shrink-0 overflow-hidden bg-surface-elevated`}>
            {cover}
            {/* Decorative only: inside the link, but non-interactive, so the whole cover still
                navigates and no control is nested in the anchor. */}
            {coverOverlay && <div className="pointer-events-none absolute inset-0">{coverOverlay}</div>}
          </div>
        )}
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start gap-3">
            {anchor && <div className="shrink-0">{anchor}</div>}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-base font-bold leading-tight text-text">{title}</h3>
                {badge}
              </div>
              {context && <p className="mt-1 truncate text-xs text-subtle">{context}</p>}
            </div>
          </div>
          {description && (
            <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{description}</p>
          )}
          {meta && (
            <div
              className={`mt-auto flex items-center pt-3 text-xs text-subtle ${
                metaNoWrap ? 'flex-nowrap gap-x-2.5 overflow-hidden' : 'flex-wrap gap-x-3 gap-y-1'
              }`}
            >
              {meta}
            </div>
          )}
        </div>
      </Link>
      {footer && <div className="border-t border-border p-3">{footer}</div>}
      {action && <div className={`absolute ${cover ? 'right-3 top-3' : 'right-4 top-4'}`}>{action}</div>}
      {/* The cover action is a SIBLING of the profile link (never nested). Its wrapper mirrors the
          cover box exactly (same top-anchored aspect ratio) and is pointer-events-none, so it
          overlays the cover's bottom-right while the rest of the banner stays clickable-through to
          the profile link beneath. The control itself re-enables pointer events. */}
      {cover && coverAction && (
        <div className={`pointer-events-none absolute inset-x-0 top-0 ${coverAspectClass}`} aria-hidden={false}>
          <div className="pointer-events-auto absolute bottom-3 right-3">{coverAction}</div>
        </div>
      )}
    </div>
  )
}

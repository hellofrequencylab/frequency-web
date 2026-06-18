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
  title,
  badge,
  context,
  description,
  meta,
  action,
  footer,
  dimmed = false,
}: {
  href: string
  /** Avatar / icon chip — the visual anchor (inline, beside the title). */
  anchor?: React.ReactNode
  /** Full-bleed banner image at the TOP of the card (a 16:9 header). When given,
   *  the image leads the card and the title sits beneath it. Provide an
   *  `<Image fill>` or a placeholder; it fills a relative, clipped 16:9 box. */
  cover?: React.ReactNode
  title: React.ReactNode
  /** Small pill shown next to the title (e.g. a Beta-demo marker). */
  badge?: React.ReactNode
  /** One-line context under the title (city · type · count). */
  context?: React.ReactNode
  /** Two-line description (clamped). */
  description?: React.ReactNode
  /** Footer row — pills, counts, relative time. */
  meta?: React.ReactNode
  /** Optional top-right action; its own client component (handles its click). */
  action?: React.ReactNode
  /** Optional full-width action pinned to the BOTTOM of the card, below a divider (its own client
   *  component — e.g. an Adopt toggle). Sits outside the link so it never nests a control in the
   *  anchor, while reading as part of the card. */
  footer?: React.ReactNode
  /** Recede the card (muted + desaturated) — used for Beta demo content. */
  dimmed?: boolean
}) {
  return (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-colors hover:border-primary-bg hover:shadow-md motion-reduce:transition-none ${
        dimmed ? 'opacity-[0.72]' : ''
      }`}
    >
      <Link href={href} className="flex flex-1 flex-col">
        {cover && (
          <div className={`relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-surface-elevated ${dimmed ? 'grayscale-[0.5]' : ''}`}>
            {cover}
          </div>
        )}
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start gap-3">
            {anchor && <div className={`shrink-0 ${dimmed ? 'grayscale-[0.5]' : ''}`}>{anchor}</div>}
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
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-subtle">
              {meta}
            </div>
          )}
        </div>
      </Link>
      {footer && <div className="border-t border-border p-3">{footer}</div>}
      {action && <div className={`absolute ${cover ? 'right-3 top-3' : 'right-4 top-4'}`}>{action}</div>}
    </div>
  )
}

import Link from 'next/link'

// RowCard — the compact, dense-row sibling of EntityCard (docs/MEMBER-DESIGN-SYSTEM.md
// §5): one object per row for list surfaces where a full card grid is too heavy
// (your practices, live offers, contact-ish rows). Same bones as EntityCard — soft
// bordered surface, title · context · description · meta — laid out horizontally.
//
// Two modes, depending on what the row carries:
//   • Link row (default): the WHOLE row is the anchor; `trailing` is a passive
//     chip/figure on the right (a status pill, a date) — never an interactive control.
//   • Actions row: pass `actions` (buttons/links, their own client components) and the
//     row becomes a plain surface with only the TITLE linked, so interactive controls
//     never nest inside an anchor (same rule as EntityCard's floating `action`).
//
//   <RowCard href={`/partners/${slug}`} title={offer.title}
//     trailing={<StatusChip … />} description={offer.description}
//     meta={<><Store …/> {partner.name}</>} />
//
//   <RowCard href={`/practices/${id}`} title={p.title} badge={<PillarBadge …/>}
//     description={p.summary} meta={<PracticeMeta p={p} />}
//     actions={<><LogPracticeButton …/><AdoptPracticeButton …/></>} />

export function RowCard({
  href,
  anchor,
  title,
  badge,
  context,
  description,
  meta,
  trailing,
  actions,
  dimmed = false,
}: {
  href: string
  /** Avatar / icon chip on the left. */
  anchor?: React.ReactNode
  title: React.ReactNode
  /** Small pill beside the title (pillar, type, demo marker). */
  badge?: React.ReactNode
  /** One-line context under the title (city · type · count). */
  context?: React.ReactNode
  /** One-line description (clamped). */
  description?: React.ReactNode
  /** Footer row — pills, counts, relative time. */
  meta?: React.ReactNode
  /** Passive right-side figure (status chip, date). Link-row mode only. */
  trailing?: React.ReactNode
  /** Interactive controls on the right — switches the row to actions mode
   *  (only the title is linked, so controls never nest inside an anchor). */
  actions?: React.ReactNode
  dimmed?: boolean
}) {
  const body = (
    <>
      {anchor && <div className={`shrink-0 ${dimmed ? 'grayscale-[0.5]' : ''}`}>{anchor}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {actions ? (
            <Link href={href} className="text-base font-bold leading-tight text-text hover:text-primary-strong hover:underline">
              {title}
            </Link>
          ) : (
            <h3 className="text-base font-bold leading-tight text-text">{title}</h3>
          )}
          {badge}
        </div>
        {context && <p className="mt-0.5 truncate text-xs text-subtle">{context}</p>}
        {description && (
          <p className="mt-0.5 line-clamp-1 text-sm leading-relaxed text-muted">{description}</p>
        )}
        {meta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
            {meta}
          </div>
        )}
      </div>
    </>
  )

  const surface = `rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm transition-colors hover:border-primary-bg hover:shadow-md motion-reduce:transition-none ${
    dimmed ? 'opacity-[0.72]' : ''
  }`

  if (actions) {
    // Mobile-first: the text content takes the full width and the controls drop to
    // their own row below, so a long title never gets squeezed beside the buttons.
    // From `sm` up we return to the side-by-side row.
    return (
      <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${surface}`}>
        <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      </div>
    )
  }

  return (
    <Link href={href} className={`flex items-start gap-3 ${surface}`}>
      {body}
      {trailing && <div className="shrink-0">{trailing}</div>}
    </Link>
  )
}

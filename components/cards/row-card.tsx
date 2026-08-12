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
//   • Managed row: pass `footer` for a FULL-WIDTH control bar under a divider — the shape a
//     manager list wants when a row carries more lifecycle actions (Edit · Make live · Add to
//     library · Delete) than fit beside the title, plus the note/error line they write back.
//     Mirrors EntityCard's `footer` slot, and switches the row out of anchor mode for the same
//     reason `actions` does: those controls must not nest inside the row's own link.
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
  footer,
  dimmed = false,
}: {
  /** Where the row points. Optional, and only for a row that has NO destination yet — a managed
   *  row whose object does not exist as a page (a pending draft). Omit it and the title renders
   *  as plain heading text instead of a link; a row with no `href` and no `actions`/`footer` has
   *  nothing to click at all, so pass one unless a control bar is carrying the row. */
  href?: string
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
  /** Full-width control bar below a divider (lifecycle buttons, and the note/error line they
   *  write back). Like `actions`, it takes the row out of anchor mode. */
  footer?: React.ReactNode
  dimmed?: boolean
}) {
  // Anchor mode is the DEFAULT, and any interactive slot cancels it: a control bar inside the
  // row's own <Link> would nest interactive elements in an anchor.
  const managed = Boolean(actions || footer)

  const body = (
    <>
      {anchor && <div className={`shrink-0 ${dimmed ? 'grayscale-[0.5]' : ''}`}>{anchor}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {managed && href ? (
            <Link href={href} className="text-body font-bold leading-tight text-text hover:text-primary-strong hover:underline">
              {title}
            </Link>
          ) : (
            <h3 className="text-body font-bold leading-tight text-text">{title}</h3>
          )}
          {badge}
        </div>
        {context && <p className="mt-0.5 truncate text-meta text-subtle">{context}</p>}
        {description && (
          <p className="mt-0.5 line-clamp-1 text-body-sm leading-relaxed text-muted">{description}</p>
        )}
        {meta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-subtle">
            {meta}
          </div>
        )}
      </div>
    </>
  )

  // The surface carries no padding of its own, so a `footer` divider can run edge to edge while
  // every content zone keeps the same px-5 inset.
  const surface = `rounded-2xl border border-border bg-surface lift-1 transition-colors hover:border-primary-bg motion-reduce:transition-none ${
    dimmed ? 'opacity-[0.72]' : ''
  }`
  const pad = 'px-5 py-4'

  if (managed) {
    // Mobile-first: the text content takes the full width and the controls drop to
    // their own row below, so a long title never gets squeezed beside the buttons.
    // From `sm` up we return to the side-by-side row.
    return (
      <div className={surface}>
        <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${pad}`}>
          <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
      </div>
    )
  }

  const linkRow = (
    <>
      {body}
      {trailing && <div className="shrink-0">{trailing}</div>}
    </>
  )
  const rowClass = `flex items-start gap-3 ${surface} ${pad}`

  // A destination-less row is still a row: render the same surface as a plain box rather than an
  // anchor to nowhere.
  if (!href) return <div className={rowClass}>{linkRow}</div>

  return (
    <Link href={href} className={rowClass}>
      {linkRow}
    </Link>
  )
}

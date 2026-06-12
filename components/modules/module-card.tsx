// Shared module chrome — the consistent wrapper every right-rail / page module
// wears (PAGE-FRAMEWORK §4.5). Two skins:
//   default — borderless titled group of rows on the canvas (page-body modules,
//     separated from neighbours by whitespace; docs/DESIGN.md "card to
//     editorial-grouping").
//   tile    — a white bordered card on the open canvas (`rounded-2xl border
//     bg-surface`), matching the admin info-rail. Used for the right-column rail
//     panels so the member side reads as the same airy canvas+tiles as the back
//     end (ADR-241 canvas unification).

export function ModuleCard({
  title,
  badge,
  tile = false,
  children,
}: {
  title: string
  badge?: string
  /** White bordered tile on canvas (the admin/rail look) vs the borderless default. */
  tile?: boolean
  children: React.ReactNode
}) {
  if (tile) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-tight text-text">{title}</h3>
          {badge && (
            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted">
              {badge}
            </span>
          )}
        </div>
        {children}
      </section>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-sm font-bold tracking-tight text-text">
          {title}
        </h3>
        {badge && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated text-muted font-medium">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

// Back-compat alias — existing call sites render <WidgetCard>. Per the
// PAGE-FRAMEWORK terminology note, "widget" = a module's card UI.
export const WidgetCard = ModuleCard

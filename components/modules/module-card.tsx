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
  visualMask,
  children,
}: {
  title: string
  badge?: string
  /** White bordered tile on canvas (the admin/rail look) vs the borderless default. */
  tile?: boolean
  /**
   * Stamps `data-visual-mask` on the root, so the visual suite paints over this module
   * (test/e2e/surfaces.ts, VISUAL_MASK_SITES). Set it on a module whose BODY is live data;
   * leave it off a module whose body is design surface. The right rail's panels set it
   * through `WidgetCard` below; page-body modules do not.
   */
  visualMask?: string
  children: React.ReactNode
}) {
  if (tile) {
    return (
      <section data-visual-mask={visualMask} className="rounded-2xl border border-border bg-surface p-4 lift-1">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-body-sm font-bold tracking-tight text-text">{title}</h3>
          {badge && (
            <span className="rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-medium text-muted">
              {badge}
            </span>
          )}
        </div>
        {children}
      </section>
    )
  }

  return (
    <section data-visual-mask={visualMask}>
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-body-sm font-bold tracking-tight text-text">
          {title}
        </h3>
        {badge && (
          <span className="text-meta px-2 py-0.5 rounded-pill bg-surface-elevated text-muted font-medium">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

// The right rail's panel card. Every call site is in components/sidebar/rail-panels.tsx, and
// every one of those panels renders a DATABASE READ: upcoming events, who is online, the newest
// circles, the community pulse. So this wrapper stamps `data-visual-mask="rail-panel"` on the
// module, and the visual suite paints over each panel's box without moving it (LIVE-213,
// ADR-1277). Page-body modules render <ModuleCard> directly and are NOT masked: a module on a
// page is design surface, a panel in the rail is a reading. (Per the PAGE-FRAMEWORK terminology
// note, "widget" = a module's card UI; the name is the rail's.)
export function WidgetCard(props: Omit<Parameters<typeof ModuleCard>[0], 'visualMask'>) {
  return <ModuleCard {...props} visualMask="rail-panel" />
}

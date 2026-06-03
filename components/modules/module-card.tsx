// Shared module chrome — the consistent wrapper every right-rail / page module
// wears (PAGE-FRAMEWORK §4.5). Minimal by design: no border, no box. A module is
// a titled group of rows that sits directly on the canvas, separated from its
// neighbours by whitespace. (The card-with-border version read as a heavy stack
// of boxes; see docs/DESIGN.md "card to editorial-grouping".)

export function ModuleCard({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
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

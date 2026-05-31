// Shared module chrome — the consistent card every right-rail / page module wears
// (PAGE-FRAMEWORK §4.5). One shell means uniformity is structural, not something
// each author has to remember. Promoted from the inline copy in right-sidebar.tsx.

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
    <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h3 className="text-sm font-bold tracking-tight text-text">
          {title}
        </h3>
        {badge && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-elevated text-muted font-medium">
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

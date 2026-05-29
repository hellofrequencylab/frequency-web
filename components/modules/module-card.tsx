// Shared module chrome - the consistent card every right-rail / page module wears
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
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          {title}
        </h3>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-elevated text-subtle font-medium">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// Back-compat alias - existing call sites render <WidgetCard>. Per the
// PAGE-FRAMEWORK terminology note, "widget" = a module's card UI.
export const WidgetCard = ModuleCard

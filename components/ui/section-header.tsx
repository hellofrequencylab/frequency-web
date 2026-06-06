// Shared section header — a light, editorial group label (title + optional
// count + optional action). Replaces the ad-hoc "uppercase text-2xs" and
// hairline-divider section headers scattered across the browse pages.

export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string
  count?: number
  action?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="flex items-baseline gap-2 text-sm font-bold tracking-tight text-text">
        {title}
        {count != null && (
          <span className="text-xs font-medium tabular-nums text-subtle">{count}</span>
        )}
      </h2>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

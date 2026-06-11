// Dimension-matched table skeleton (ADR-233 §6). A Suspense fallback shaped like the
// real DataTable so streaming settles instead of erupting, and CLS stays low (the rows
// reserve their space). Presentational + server-friendly.
//
//   <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>...</Suspense>

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface" aria-hidden>
      <div className="flex gap-4 border-b border-border bg-surface-elevated/50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 flex-1 animate-pulse rounded bg-surface-elevated" />
        ))}
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className="h-4 flex-1 animate-pulse rounded bg-surface-elevated/70"
                style={{ width: c === 0 ? '40%' : undefined }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

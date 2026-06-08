// De-boxed stat — a value over a label, floating on the canvas (no card). The inline
// counterpart to StatCard, for network/header stat strips where a bordered tile would
// be too heavy. One shared component so the same treatment isn't re-implemented per
// page (it was duplicated identically across /circles and /channels). Presentational.

export function StatInline({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <div className="text-xl font-bold leading-none tabular-nums text-text">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="mt-1 text-xs text-subtle">{label}</div>
    </div>
  )
}

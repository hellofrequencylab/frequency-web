import { opensLabel } from '@/lib/share/short-link-stats'

// How often the sharer's own short link was opened over the last 30 days (LIVE-1960). Counts only.
export function LinkOpensNote({ opens }: { opens: number | null }) {
  const label = opensLabel(opens)
  return label ? <p className="text-2xs text-muted">{label}</p> : null
}

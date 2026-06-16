import { StatusChip } from '@/components/admin/status'
import { seasonStateMeta, seasonStateFromStatus, type SeasonState } from './lifecycle'

// The season lifecycle badge — one consistent vocabulary (Draft / Scheduled / Live /
// Ended) wherever a season's state is shown. Wraps the admin StatusChip so the tone +
// label stay in lockstep with the lifecycle mapping (lifecycle.ts). Pass either a
// resolved `state` or the raw stored `status`. Presentational, server-safe.

export function StateBadge({
  state,
  status,
  size = 'md',
}: {
  /** A resolved lifecycle state. */
  state?: SeasonState
  /** Or the raw stored `seasons.status` (mapped to a state). */
  status?: string | null
  size?: 'sm' | 'md'
}) {
  const resolved = state ?? seasonStateFromStatus(status)
  const { label, tone } = seasonStateMeta(resolved)
  return (
    <StatusChip tone={tone} size={size}>
      {label}
    </StatusChip>
  )
}

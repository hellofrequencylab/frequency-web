// Season lifecycle — the one vocabulary for a season's state, shared by the list and
// the detail/Composer. A season moves Draft -> Scheduled -> Live -> Ended. These display
// states map onto the stored `seasons.status` text column (no migration): Live IS the
// stored 'active' status, so getCurrentSeason() (status='active') keeps working. 'draft'
// and 'scheduled' are new text values; the legacy 'upcoming' status reads as Draft so old
// rows render sensibly. Pure mapping (no DB, no React) so it is trivially reusable + testable.

import type { StatusTone } from '@/components/admin/status'

/** The four lifecycle states an operator reasons about. */
export type SeasonState = 'draft' | 'scheduled' | 'live' | 'ended'

/** The transition targets the actions accept (Live is stored as 'active'). */
export type SeasonStatusTarget = 'draft' | 'scheduled' | 'active' | 'ended'

const STATE_META: Record<SeasonState, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  live: { label: 'Live', tone: 'success' },
  ended: { label: 'Ended', tone: 'neutral' },
}

/** Map a stored `seasons.status` value to the operator-facing lifecycle state. The
 *  legacy 'upcoming' status (pre-lifecycle rows) reads as Draft; anything unknown is
 *  treated as Ended (a safe, inert default). */
export function seasonStateFromStatus(status: string | null | undefined): SeasonState {
  switch (status) {
    case 'active':
      return 'live'
    case 'scheduled':
      return 'scheduled'
    case 'draft':
    case 'upcoming':
      return 'draft'
    case 'ended':
      return 'ended'
    default:
      return 'ended'
  }
}

/** The label + tone for a lifecycle state (the StateBadge reads this). */
export function seasonStateMeta(state: SeasonState): { label: string; tone: StatusTone } {
  return STATE_META[state]
}

/** The label + tone for a stored status, in one call (list rows). */
export function seasonStatusMeta(status: string | null | undefined): { label: string; tone: StatusTone } {
  return STATE_META[seasonStateFromStatus(status)]
}

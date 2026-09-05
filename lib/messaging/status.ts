// The ONE status vocabulary for the Messaging console (EMAIL-CAMPAIGNS-FUNNELS-PLAN P1).
// A Campaign (one-time send) and a Funnel (triggered journey) each carry their own DB
// status, but the console shows them side by side, so both normalize into this single
// legend. Client-safe + pure (no server imports) so the console UI, the flow view, and
// the unit test all read the same map. Tones map onto the shared admin StatusChip
// vocabulary (components/admin/status.tsx). Copy is plain, no em dashes (CONTENT-VOICE).

import type { StatusTone } from '@/components/admin/status'

/** The unified lifecycle a Campaign OR a Funnel is shown in. */
export type MessagingStatus = 'draft' | 'scheduled' | 'live' | 'paused' | 'sent' | 'archived' | 'failed' | 'stalled'

/**
 * How long a 'sending' claim is trusted before it counts as a dead sender (scan two L6-10). The ONE
 * constant behind three readers: the scheduled-send cron and the drip runner re-claim a 'sending'
 * row whose sending_started_at is older than this, and the console shows such a row as 'stalled'
 * rather than 'live'. Mirrors the outbox, which reclaims a 'processing' job after 5 minutes; a
 * campaign fan-out is longer, so 15.
 */
export const SENDING_LEASE_MINUTES = 15
export const SENDING_LEASE_MS = SENDING_LEASE_MINUTES * 60_000

/** True when a 'sending' claim taken at `sendingStartedAt` is older than the lease. A missing stamp
 *  (a row claimed before the lease column existed, or a caller without the column) is NOT stale:
 *  the runners cannot reclaim it either, so the two readers agree. */
export function isSendingLeaseStale(
  sendingStartedAt: string | Date | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!sendingStartedAt) return false
  const started = sendingStartedAt instanceof Date ? sendingStartedAt.getTime() : Date.parse(sendingStartedAt)
  if (!Number.isFinite(started)) return false
  return nowMs - started > SENDING_LEASE_MS
}

export interface MessagingStatusMeta {
  key: MessagingStatus
  /** Operator-facing label. */
  label: string
  /** The shared admin chip tone. */
  tone: StatusTone
  /** The presentation-standard status glyph (docs/PRESENTATION.md legend). */
  glyph: string
  /** One-line meaning for the legend row. */
  hint: string
}

// Ordered as the legend reads, most-active first. Glyphs follow the ✅/⏳/⚠️/🔴 legend.
export const MESSAGING_STATUS_META: Record<MessagingStatus, MessagingStatusMeta> = {
  live: { key: 'live', label: 'Live', tone: 'success', glyph: '✅', hint: 'Running now: enrolling people and sending.' },
  sent: { key: 'sent', label: 'Sent', tone: 'success', glyph: '✅', hint: 'Delivered to its audience.' },
  scheduled: { key: 'scheduled', label: 'Scheduled', tone: 'info', glyph: '⏳', hint: 'Queued to go out at a set time.' },
  draft: { key: 'draft', label: 'Draft', tone: 'neutral', glyph: '✏️', hint: 'Still being built. Nothing has sent.' },
  paused: { key: 'paused', label: 'Paused', tone: 'warning', glyph: '⚠️', hint: 'Held. No one new is being sent to.' },
  archived: { key: 'archived', label: 'Archived', tone: 'neutral', glyph: '🗄️', hint: 'Retired from the working list.' },
  failed: { key: 'failed', label: 'Needs a look', tone: 'danger', glyph: '🔴', hint: 'A send did not go through.' },
  stalled: { key: 'stalled', label: 'Stalled', tone: 'warning', glyph: '⚠️', hint: 'Started sending but has not finished. It resumes on the next run.' },
}

/** The legend rows, in reading order. */
export const MESSAGING_STATUS_LEGEND: readonly MessagingStatusMeta[] = [
  MESSAGING_STATUS_META.live,
  MESSAGING_STATUS_META.scheduled,
  MESSAGING_STATUS_META.draft,
  MESSAGING_STATUS_META.paused,
  MESSAGING_STATUS_META.sent,
]

export function messagingStatusMeta(status: MessagingStatus): MessagingStatusMeta {
  return MESSAGING_STATUS_META[status] ?? MESSAGING_STATUS_META.draft
}

/** Map a raw `campaigns.status` string onto the unified vocabulary. `sendingStartedAt` is the row's
 *  sending_started_at (scan two L6-10): a 'sending' row whose lease has expired reads as 'stalled',
 *  not 'live'. Callers that do not pass it keep the pre-lease mapping ('sending' is 'live'). */
export function campaignStatusToMessaging(
  raw: string,
  sendingStartedAt?: string | Date | null,
): MessagingStatus {
  const s = (raw || '').toLowerCase()
  if (s === 'sent' || s === 'delivered') return 'sent'
  if (s === 'sending') return isSendingLeaseStale(sendingStartedAt) ? 'stalled' : 'live'
  if (s === 'scheduled' || s === 'queued') return 'scheduled'
  if (s === 'paused') return 'paused'
  if (s === 'failed' || s === 'error') return 'failed'
  if (s === 'archived') return 'archived'
  return 'draft'
}

/** Map a `funnels.status` (draft | active | archived) onto the unified vocabulary. */
export function funnelStatusToMessaging(raw: string): MessagingStatus {
  const s = (raw || '').toLowerCase()
  if (s === 'active') return 'live'
  if (s === 'paused') return 'paused'
  if (s === 'archived') return 'archived'
  return 'draft'
}

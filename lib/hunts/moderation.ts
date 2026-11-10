/**
 * Hunt moderation (FH-018): the rules for reports, emergency pause and closure as pure functions.
 *
 * A report is a member saying "this Hunt is unsafe or wrong". The operator queue, the pause switch
 * and the closure banner all read the answers here, so the rules are testable without a database.
 * Nothing here deletes anything: a paused or closed Hunt keeps every player's progress, it just stops
 * granting. Who may pause or end is decided by `decide` in ./authz.ts, not here.
 */

const REPORT_REASONS = ['unsafe', 'private_property', 'minor_risk', 'wrong_or_broken', 'offensive', 'other'] as const

type ReportReason = (typeof REPORT_REASONS)[number]

/** Reasons that put a person or a place at risk. One report is enough to ask an operator to pause. */
const URGENT_REASONS: readonly ReportReason[] = ['unsafe', 'private_property', 'minor_risk']

const DETAILS_MAX = 1000

interface Report {
  huntId: string
  reporterId: string
  reason: ReportReason
  details: string
}

type FileResult = { ok: true; report: Report } | { ok: false; reason: 'bad_reason' | 'details_too_long' | 'duplicate' }

export function fileReport(
  input: { huntId: string; reporterId: string; reason: string; details?: string },
  openReports: readonly { huntId: string; reporterId: string }[],
): FileResult {
  if (!(REPORT_REASONS as readonly string[]).includes(input.reason)) return { ok: false, reason: 'bad_reason' }
  const details = (input.details ?? '').trim()
  if (details.length > DETAILS_MAX) return { ok: false, reason: 'details_too_long' }
  // One open report per person per Hunt. A second tap is not a second voice.
  if (openReports.some((r) => r.huntId === input.huntId && r.reporterId === input.reporterId)) {
    return { ok: false, reason: 'duplicate' }
  }
  return { ok: true, report: { huntId: input.huntId, reporterId: input.reporterId, reason: input.reason as ReportReason, details } }
}

type Triage = { level: 'urgent' | 'review' | 'none'; recommendPause: boolean; reporters: number }

/**
 * How loud the queue should be for one Hunt. Urgent reasons recommend a pause at once; anything else
 * asks for a review once two different people have reported. This only recommends: a person pauses.
 */
export function triage(reports: readonly Pick<Report, 'reporterId' | 'reason'>[]): Triage {
  const reporters = new Set(reports.map((r) => r.reporterId)).size
  if (reports.some((r) => URGENT_REASONS.includes(r.reason))) return { level: 'urgent', recommendPause: true, reporters }
  if (reporters >= 2) return { level: 'review', recommendPause: false, reporters }
  return { level: reporters === 0 ? 'none' : 'review', recommendPause: false, reporters }
}

type HuntState = 'published' | 'paused' | 'closed'
type StateAction = 'pause' | 'resume' | 'close'

/** The only moves. Closed is final: a Hunt that ended or was cancelled is never reopened in place. */
export function nextState(state: HuntState, action: StateAction): HuntState | null {
  if (state === 'published' && action === 'pause') return 'paused'
  if (state === 'paused' && action === 'resume') return 'published'
  if ((state === 'published' || state === 'paused') && action === 'close') return 'closed'
  return null
}

type PlayerView = { canClaim: boolean; keepsProgress: true; banner: 'none' | 'paused' | 'closed' }

/** What an active player sees. Progress is never dropped; only granting stops. */
export function playerView(state: HuntState): PlayerView {
  if (state === 'published') return { canClaim: true, keepsProgress: true, banner: 'none' }
  return { canClaim: false, keepsProgress: true, banner: state }
}

/** Publish needs the venue's permission on file and a clean checklist. Both, every time. */
export function canPublish(i: { permissionConfirmed: boolean; checklistOk: boolean }): boolean {
  return i.permissionConfirmed && i.checklistOk
}

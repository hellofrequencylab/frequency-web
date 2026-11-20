// EMAIL-081: the edit lock for an Email Studio campaign. Pure (no IO), shared by the autosave action and its tests.

/** EMAIL-081: approval states an edit takes back to draft (the approver reviewed the old content). */
export const APPROVALS_RESET_ON_EDIT: ReadonlySet<string> = new Set(['ready', 'approved', 'scheduled'])

/** EMAIL-081: what an edit refused on a campaign that is already going out says. */
export const EDIT_LOCKED_ERROR = 'This email is already going out, so it can no longer change. Duplicate it to make a new version.'

/**
 * EMAIL-081: may this campaign be edited, and what does the edit cost? 'open' (a draft, or a stopped one that
 * never queued anyone), 'disarm' (scheduled: the edit takes it off the schedule), or 'locked' (sending, paused
 * mid-send, sent, or a failed send that already queued people; editing would split one campaign into two
 * versions). A row that cannot be read as any of these is 'open', exactly like before (the update then
 * matches nothing). Pure, so the whole table is unit-tested.
 */
export function editLockFor(row: { status?: string | null; recipient_count?: number | null } | null): 'open' | 'disarm' | 'locked' {
  const status = row?.status ?? 'draft'
  if (status === 'scheduled') return 'disarm'
  if (status === 'sending' || status === 'paused' || status === 'sent') return 'locked'
  if (status === 'failed' && (row?.recipient_count ?? 0) > 0) return 'locked'
  return 'open'
}

/** EMAIL-081: the statuses a content write may land on. Every write re-asserts this in its WHERE clause. */
export const EDITABLE_STATUSES = ['draft', 'cancelled', 'failed']

/** EMAIL-081: what an edit says when the campaign changed state (scheduled or started sending) mid-save. */
export const EDIT_CHANGED_ERROR = 'This email was just scheduled or started sending, so your edit was not saved. Reopen it to see where it stands.'

/** True when a guarded update touched a row (the status still allowed the edit). */
export function landed(rows: unknown): boolean {
  return Array.isArray(rows) && rows.length > 0
}

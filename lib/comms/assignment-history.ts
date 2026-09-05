// ASSIGNMENT HISTORY (scan2 L9-10). `comms_assignments` is the append-only "trade" trail every
// reassignment writes (lib/comms/conversations.ts recordAssignment); until 2026-09-05 nothing read it,
// so the workspace could not show who handed a thread to whom. This module is the PURE half: the row
// shape the spine stores, the entry shape the reader pane renders, and the mapper between them (names
// resolved from a batch-loaded profile map, exactly as the thread's authors are). No IO, so it is
// unit-tested in isolation; lib/comms/workspace.ts does the read and hands the rows here.

/** One stored row of comms_assignments, as the workspace reads it. */
export interface AssignmentRow {
  id: string
  assigned_to: string | null
  assigned_by: string | null
  reason: string | null
  created_at: string
}

/** One rendered entry: who it went to (null = returned to the queue), who did it (null = the
 *  system), why, and when. Names fall back to "Someone" / "the system" rather than a raw id. */
export interface ConversationAssignmentEntry {
  id: string
  assignedTo: string | null
  assigneeName: string | null
  assignedBy: string | null
  assignedByName: string | null
  reason: string | null
  createdAt: string
}

/** The human label for a stored reason ('manual' | 'round_robin' | 'escalation' | 'reopen'). Unknown
 *  reasons pass through as-is so a new writer never renders blank. */
export function assignmentReasonLabel(reason: string | null): string | null {
  switch (reason) {
    case null:
    case '':
    case 'manual':
      return null // the default; saying "manual" adds nothing
    case 'round_robin':
      return 'round robin'
    case 'escalation':
      return 'escalated'
    case 'reopen':
      return 'reopened'
    default:
      return reason
  }
}

/** Profile ids the history needs names for (the assignee + the assigner of every row). */
export function assignmentProfileIds(rows: AssignmentRow[]): string[] {
  return rows.flatMap((r) => [r.assigned_to, r.assigned_by]).filter(Boolean) as string[]
}

/** Map stored rows to rendered entries, newest first. PURE. */
export function mapAssignmentHistory(rows: AssignmentRow[], profiles: Map<string, string>): ConversationAssignmentEntry[] {
  return [...rows]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((r) => ({
      id: String(r.id),
      assignedTo: r.assigned_to,
      assigneeName: r.assigned_to ? (profiles.get(r.assigned_to) ?? null) : null,
      assignedBy: r.assigned_by,
      assignedByName: r.assigned_by ? (profiles.get(r.assigned_by) ?? null) : null,
      reason: r.reason,
      createdAt: r.created_at,
    }))
}

/** The one-line sentence an entry reads as, e.g. "Assigned to Ana by Sam" or "Returned to the queue
 *  by the system (reopened)". PURE, so the copy is tested once and the view only prints it. */
export function assignmentSentence(e: ConversationAssignmentEntry): string {
  const by = e.assignedBy ? (e.assignedByName ?? 'someone') : 'the system'
  const head = e.assignedTo ? `Assigned to ${e.assigneeName ?? 'someone'} by ${by}` : `Returned to the queue by ${by}`
  const why = assignmentReasonLabel(e.reason)
  return why ? `${head} (${why})` : head
}

// Human labels for conversation status + priority (ADR-812). PURE — safe to import from client and server.
// The values mirror the CHECK constraints in the comms_conversations migration. Copy passes the voice
// canon (docs/CONTENT-VOICE.md): plain, no em dashes.

export const CONVERSATION_STATUSES = ['open', 'in_progress', 'waiting', 'snoozed', 'resolved', 'closed'] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export const STATUS_LABELS: Record<ConversationStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting: 'Waiting',
  snoozed: 'Snoozed',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const CONVERSATION_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number]

export const PRIORITY_LABELS: Record<ConversationPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

/** The active (non-terminal) statuses — an "open work" count for the segments header. */
export const OPEN_CONVERSATION_STATUSES: readonly string[] = ['open', 'in_progress', 'waiting', 'snoozed']

/** Semantic token classes for a status pill (kept token-clean; no raw hex). */
export function statusTone(status: string): string {
  switch (status) {
    case 'resolved':
    case 'closed':
      return 'bg-success-bg text-success'
    case 'waiting':
    case 'snoozed':
      return 'bg-warning-bg text-warning'
    default:
      return 'bg-primary-bg text-primary-strong'
  }
}

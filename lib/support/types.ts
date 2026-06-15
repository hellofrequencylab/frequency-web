// Support system shared types (ADR-159). Client-safe — no server imports — so the
// report dialog, the history pages, and the admin console all speak one shape.

export type TicketType = 'bug' | 'question' | 'feedback' | 'idea'
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type AuthorKind = 'member' | 'staff' | 'vera' | 'system'

// Page + activity data captured client-side at report time. Everything optional so a
// partial capture never blocks a report.
export interface SupportContext {
  url?: string
  pathname?: string
  referrer?: string
  viewport?: { w: number; h: number }
  userAgent?: string
  language?: string
  appVersion?: string
  capturedAt?: string
}

export interface TicketMessage {
  id: string
  authorId: string | null
  authorKind: AuthorKind
  authorName: string | null
  body: string
  isInternal: boolean
  createdAt: string
}

export interface SupportTicket {
  id: string
  ref: number
  profileId: string
  type: TicketType
  subject: string
  status: TicketStatus
  priority: TicketPriority
  pageUrl: string | null
  context: SupportContext
  screenshotPath: string | null
  assignedTo: string | null
  resolvedAt: string | null
  lastActivityAt: string
  createdAt: string
  updatedAt: string
}

export interface TicketParty {
  id: string
  name: string
  handle: string
  avatarUrl: string | null
}

export interface TicketWithThread extends SupportTicket {
  messages: TicketMessage[]
  /** Short-lived signed URL for the screenshot (server-minted), or null. */
  screenshotUrl: string | null
  reporter: TicketParty | null
  assignee: TicketParty | null
}

export const TYPE_LABELS: Record<TicketType, string> = {
  bug: 'Bug',
  question: 'Question',
  feedback: 'Feedback',
  idea: 'Idea',
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const TICKET_TYPES: TicketType[] = ['bug', 'question', 'feedback', 'idea']
export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent']

/** Statuses that count as still needing attention. */
export const OPEN_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting']

export function isOpenStatus(s: TicketStatus): boolean {
  return OPEN_STATUSES.includes(s)
}

/** Semantic-token classes for a status chip (no hardcoded hex — PRESENTATION std). */
export function statusChipClass(s: TicketStatus): string {
  switch (s) {
    case 'open': return 'bg-primary-bg text-primary-strong'
    case 'in_progress': return 'bg-broadcast-bg text-broadcast-strong'
    case 'waiting': return 'bg-warning-bg text-warning'
    case 'resolved': return 'bg-success-bg text-success'
    case 'closed': return 'bg-surface-elevated text-subtle'
  }
}

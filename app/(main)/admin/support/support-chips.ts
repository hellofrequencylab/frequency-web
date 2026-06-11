import type { StatusTone } from '@/components/admin/status'
import type { TicketStatus, TicketPriority } from '@/lib/support/types'

// Ticket status/priority → the shared StatusChip vocabulary (ADR-233 §4). Keeps the
// support surfaces on the one admin status language; the source labels still come from
// STATUS_LABELS / PRIORITY_LABELS in lib/support/types.

export const STATUS_TONE: Record<TicketStatus, StatusTone> = {
  open: 'info',
  in_progress: 'info',
  waiting: 'warning',
  resolved: 'success',
  closed: 'neutral',
}

export const PRIORITY_TONE: Record<TicketPriority, StatusTone> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  urgent: 'danger',
}

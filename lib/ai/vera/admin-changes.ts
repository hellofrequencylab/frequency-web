// THE ADMIN CHANGES VERA MAY PROPOSE (LIVE-2191, Vera assistants plan phase V4, the Admin Assistant's confirmed
// changes). A closed list, each mapped to an admin page's OWN guarded action, so a tap is the same write the page
// makes, re-checked against the caller. Starts with support ticket triage (status and priority), which a team member
// can undo from /admin/support any time. Moderation verdicts, suspensions, money and anything that cannot be
// undone are never on this list: Vera points at the admin page for those.
//
// Pure and client-safe: ids and words only.

import type { TicketPriority, TicketStatus } from '@/lib/support/types'

const STATUS_WORDS: Record<TicketStatus, string> = {
  open: 'open',
  in_progress: 'in progress',
  waiting: 'waiting on the member',
  resolved: 'resolved',
  closed: 'closed',
}
const PRIORITY_WORDS: Record<TicketPriority, string> = { low: 'low', normal: 'normal', high: 'high', urgent: 'urgent' }

type TicketField = 'status' | 'priority'
const FIELDS: Record<TicketField, Record<string, string>> = { status: STATUS_WORDS, priority: PRIORITY_WORDS }

/** A checked ticket change: the ticket number, which field, and a value on that field's list. */
interface TicketChange {
  ref: number
  field: TicketField
  value: string
}

/** The checked change, or null for a ticket number, field or value Vera may not propose. */
export function ticketChange(ref: unknown, field: unknown, value: unknown): TicketChange | null {
  const num = typeof ref === 'string' ? /^#?(\d{1,12})$/.exec(ref.trim())?.[1] : undefined
  if (!num || typeof field !== 'string' || !Object.hasOwn(FIELDS, field) || typeof value !== 'string') return null
  const words = FIELDS[field as TicketField]
  return Object.hasOwn(words, value) ? { ref: Number(num), field: field as TicketField, value } : null
}

/** The plain words on the confirm card, or null for a change Vera may not propose. */
export function ticketCard(ref: unknown, field: unknown, value: unknown): string | null {
  const c = ticketChange(ref, field, value)
  if (!c) return null
  return c.field === 'status' ? `Mark support ticket #${c.ref} ${STATUS_WORDS[c.value as TicketStatus]}?` : `Set support ticket #${c.ref} to ${c.value} priority?`
}

/** What the tool description tells the model a change looks like. */
export function ticketChangeGuide(): string {
  return `field status (${Object.keys(STATUS_WORDS).join(', ')}) or priority (${Object.keys(PRIORITY_WORDS).join(', ')})`
}

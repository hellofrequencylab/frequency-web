// THE INBOX, the pure half (LIVE-2526, hub plan 2026-11-24). One list of what needs you, sorted into
// three views the way Linear's Inbox is (Priority and Other since Sept 2026), plus the notices you
// snoozed. No IO: lib/notifications/inbox-store.ts reads the rows on the member's own session.
//
//   Priority  someone named you or handed you something: a tag, a direct message, a to-do handed over
//   Other     everything else that is still open
//   Snoozed   hidden until a time you picked; back in its view the moment that time passes
//
// Archived notices (Done) leave every view. Reading a notice does not archive it: unread is a dot,
// Done is a decision.

import type { NotificationItem } from '@/lib/notifications-map'

const INBOX_VIEWS = ['priority', 'other', 'snoozed'] as const
export type InboxView = (typeof INBOX_VIEWS)[number]

export interface InboxItem extends NotificationItem {
  snoozed_until: string | null
  archived_at: string | null
}

/** The bell types that mean "someone named you or handed you something". */
const PRIORITY_TYPES = new Set(['mention', 'direct_message', 'plan_assign'])

function isPriority(n: Pick<NotificationItem, 'type'>): boolean {
  return PRIORITY_TYPES.has(n.type)
}

function isSnoozed(n: Pick<InboxItem, 'snoozed_until'>, now: Date): boolean {
  return Boolean(n.snoozed_until && Date.parse(n.snoozed_until) > now.getTime())
}

/** The rows one view shows, newest first (snoozed: soonest back first). */
export function inboxView(items: readonly InboxItem[], view: InboxView, now: Date): InboxItem[] {
  const open = items.filter((n) => !n.archived_at)
  if (view === 'snoozed') {
    return open.filter((n) => isSnoozed(n, now)).sort((a, b) => Date.parse(a.snoozed_until!) - Date.parse(b.snoozed_until!))
  }
  return open.filter((n) => !isSnoozed(n, now) && isPriority(n) === (view === 'priority'))
}

/** How many unread rows each view holds, for the tab labels. Snoozed counts all of its rows. */
export function inboxCounts(items: readonly InboxItem[], now: Date): Record<InboxView, number> {
  return {
    priority: inboxView(items, 'priority', now).filter((n) => !n.read_at).length,
    other: inboxView(items, 'other', now).filter((n) => !n.read_at).length,
    snoozed: inboxView(items, 'snoozed', now).length,
  }
}

export function parseInboxView(raw: unknown): InboxView {
  const v = Array.isArray(raw) ? raw[0] : raw
  return (INBOX_VIEWS as readonly string[]).includes(v as string) ? (v as InboxView) : 'priority'
}

export const SNOOZE_CHOICES = [
  { key: '3h', label: '3 hours', hours: 3 },
  { key: '1d', label: 'Tomorrow', hours: 24 },
  { key: '7d', label: 'Next week', hours: 24 * 7 },
] as const

/** The time a snooze choice ends, or null for a key that is not one of the choices. */
export function snoozeUntil(key: unknown, now: Date): string | null {
  const choice = SNOOZE_CHOICES.find((c) => c.key === key)
  return choice ? new Date(now.getTime() + choice.hours * 3_600_000).toISOString() : null
}

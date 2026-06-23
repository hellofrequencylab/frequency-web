'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, CalendarClock } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { completeReminder } from '@/app/(main)/connections/actions'
import type { ReminderWithContact } from '@/lib/connections/types'

/** Friendly due-date line: handles overdue, today, and upcoming (relativeTime only
 *  speaks past tense, so a follow-up layer needs its own small formatter). */
function dueLabel(iso: string): string {
  const dayMs = 86_400_000
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  const startDue = new Date(iso); startDue.setHours(0, 0, 0, 0)
  const days = Math.round((startDue.getTime() - startToday.getTime()) / dayMs)
  if (days < 0) return days === -1 ? 'Due yesterday' : `${-days} days overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days < 7) return `Due in ${days} days`
  return `Due ${new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function isOverdue(iso: string): boolean {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  return new Date(iso).getTime() < startToday.getTime()
}

/** The free "reach out" list: open follow-ups due soon (overdue first). Renders
 *  nothing when empty so it never leaves a blank band on My Contacts. */
export function ReachOutList({ reminders }: { reminders: ReminderWithContact[] }) {
  const [items, setItems] = useState(reminders)
  if (items.length === 0) return null

  return (
    <section className="mb-6 rounded-2xl border border-border/70 bg-surface/60 p-5">
      <div className="mb-3 flex items-center gap-1.5">
        <CalendarClock className="h-4 w-4 text-primary-strong" />
        <h2 className="text-sm font-semibold tracking-tight text-text">Reach out</h2>
        <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-2xs font-bold tabular-nums text-muted">
          {items.length}
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((r) => (
          <ReachOutRow
            key={r.id}
            reminder={r}
            onDone={() => setItems((prev) => prev.filter((p) => p.id !== r.id))}
          />
        ))}
      </ul>
    </section>
  )
}

function ReachOutRow({ reminder, onDone }: { reminder: ReminderWithContact; onDone: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const name = reminder.contactName ?? 'Unnamed'

  function done() {
    start(async () => {
      const ok = await completeReminder(reminder.id, reminder.contactId)
      if (ok) { onDone(); router.refresh() }
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <Link
        href={`/connections/${reminder.contactId}`}
        className="flex min-w-0 flex-1 items-center gap-3 outline-none"
      >
        {reminder.contactAvatarUrl ? (
          // Private `network-contacts` signed URL — skip the optimizer (see page.tsx note).
          <Image src={reminder.contactAvatarUrl} alt="" width={36} height={36} unoptimized className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted">
            {getInitials(name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{name}</p>
          <p className="truncate text-xs">
            <span className={isOverdue(reminder.dueAt) ? 'font-medium text-danger' : 'text-muted'}>
              {dueLabel(reminder.dueAt)}
            </span>
            {reminder.note && <span className="text-subtle"> · {reminder.note}</span>}
          </p>
        </div>
      </Link>
      <button
        type="button"
        onClick={done}
        disabled={pending}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Done
      </button>
    </li>
  )
}

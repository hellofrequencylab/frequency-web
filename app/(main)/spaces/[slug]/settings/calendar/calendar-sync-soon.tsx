import { ComingSoonMark } from '@/components/ui/coming-soon-mark'

// TWO-WAY SYNC, SHOWN BEFORE IT WORKS (Space calendar redesign, 2026-10-22). The design lists Google,
// Apple, Outlook and Notion under "Sync and feeds". Nothing here is connected yet, so each row
// carries the shared Coming soon mark and no button. What does work today is the feed: a team member
// subscribes once and the calendar stays current, which is the line under the list.
const PROVIDERS = [
  { name: 'Google Calendar', note: 'Your team’s busy times show up as Unavailable.' },
  { name: 'Apple Calendar', note: 'Two-way, through iCloud.' },
  { name: 'Outlook', note: 'Two-way, for work calendars.' },
  { name: 'Notion', note: 'Tasks land in the To-do inbox.' },
] as const

export function CalendarSyncSoon() {
  return (
    <section aria-labelledby="calendar-sync" className="space-y-2">
      <h3 id="calendar-sync" className="text-body-sm font-semibold text-text">
        Two-way sync
      </h3>
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {PROVIDERS.map((p) => (
          <li key={p.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span>
              <span className="block text-body-sm font-medium text-text">{p.name}</span>
              <span className="block text-meta text-muted">{p.note}</span>
            </span>
            <ComingSoonMark />
          </li>
        ))}
      </ul>
      <p className="text-meta text-muted">Until then, subscribe to the calendar feed above and it stays current in any calendar app.</p>
    </section>
  )
}

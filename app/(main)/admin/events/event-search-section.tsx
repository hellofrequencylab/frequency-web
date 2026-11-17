import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { StatusChip } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { formatEventDate } from '@/lib/utils'
import { searchAdminEvents } from './load-events'

// SRCH-003: find any event on the platform from /admin/events. The page lists only the viewer's own
// Circle events and the poster-captured ones, and its one search box found members to assign as host,
// so an operator looking for a specific event had nowhere to type its name. Every status and
// visibility answers here (the page renders the FilterBar above this) (drafts, private, cancelled, removed), each row opening the event's editor.
export async function EventSearchSection({ q }: { q: string }) {
  const found = q.length >= 2 ? await searchAdminEvents(q).catch(() => null) : null
  return (
    <div className="space-y-3">
      {q.length > 0 && q.length < 2 && <p className="text-meta text-subtle">Type at least two letters.</p>}
      {found === null && q.length >= 2 && <p role="alert" className="text-meta text-danger">Event search is unavailable right now. Try again.</p>}
      {found && found.rows.length === 0 && (
        <EmptyState icon={CalendarDays} title="No events match" description={`Nothing matches “${q}”. Try one word from the title, or the town.`} />
      )}
      {found && found.rows.length > 0 && (
        <ul className="divide-y divide-border rounded-card border border-border">
          {found.rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <Link href={`/admin/events/${e.id}`} className="min-w-0 flex-1 truncate text-body-sm font-medium text-text hover:underline">
                {e.title}
              </Link>
              <span className="text-meta text-subtle">{formatEventDate(e.starts_at)}</span>
              {e.host && <span className="text-meta text-subtle">{e.host.display_name}</span>}
              <StatusChip tone={e.removed_at || e.is_cancelled ? 'danger' : e.status === 'published' ? 'success' : 'neutral'} size="sm">
                {e.removed_at ? 'removed' : e.is_cancelled ? 'cancelled' : e.status}
              </StatusChip>
              {e.visibility !== 'public' && <StatusChip tone="neutral" size="sm">{e.visibility}</StatusChip>}
              <Link href={`/events/${e.slug}`} className="text-meta text-primary-strong hover:underline">View</Link>
            </li>
          ))}
        </ul>
      )}
      {found?.truncated && <p className="text-meta text-subtle">Showing the newest {found.rows.length}. Add a word to narrow it.</p>}
    </div>
  )
}

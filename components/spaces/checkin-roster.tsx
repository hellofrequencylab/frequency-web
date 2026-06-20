import Link from 'next/link'
import { Users } from 'lucide-react'
import { listCheckins } from '@/lib/spaces/checkin'
import { EmptyState } from '@/components/ui/empty-state'

// THE CHECK-IN ROSTER (ENTITY-SPACES-BUILD §C, Phase 2). A self-fetching server component for the
// owner check-in surface: who checked in at this Space, newest first, gated on canEditProfile inside
// listCheckins (a janitor previewing as staff reads it too). Each row is a checker (name + handle +
// when). A check-in is an ordinary node capture on the Space's check-in code; this list reads those
// captures, scoped to the Space (cross-tenant isolated in the lib). No em/en dashes (CONTENT-VOICE).

export async function CheckinRoster({ spaceId }: { spaceId: string }) {
  const roster = await listCheckins(spaceId)

  if (roster.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No check-ins yet."
        description="When someone scans your check-in code, they show here."
      />
    )
  }

  const timeFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
      {roster.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            {entry.handle ? (
              <Link
                href={`/people/${entry.handle}`}
                className="truncate text-sm font-semibold text-text transition-colors hover:text-primary-strong"
              >
                {entry.name}
              </Link>
            ) : (
              <p className="truncate text-sm font-semibold text-text">{entry.name}</p>
            )}
            <p className="text-xs text-muted">{timeFmt.format(new Date(entry.checkedInAt))}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

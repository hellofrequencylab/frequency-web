import { Users } from 'lucide-react'
import { listSpaceRsvps } from '@/lib/spaces/tickets'
import { EmptyState } from '@/components/ui/empty-state'

// OWNER RSVP LIST (MASTER-PLAN ADMIN-03, ticketing v1). A self-fetching server component for the owner
// tickets surface: the Event Space's going RSVPs (member name + tier + reserved date), gated on
// canEditProfile inside listSpaceRsvps. v1 records the RSVP only; no charge is taken (no money). The
// member-facing reserve / cancel surface ships with ADMIN-04. No em/en dashes (CONTENT-VOICE §10).

export async function TicketRsvpList({ spaceId }: { spaceId: string }) {
  const rsvps = await listSpaceRsvps(spaceId)

  if (rsvps.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No RSVPs yet."
        description="When someone reserves a spot on one of your tiers, they show here."
      />
    )
  }

  const sinceFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
      {rsvps.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{r.memberName}</p>
            <p className="text-xs text-muted">
              {r.tierName} · reserved {sinceFmt.format(new Date(r.reservedAt))}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

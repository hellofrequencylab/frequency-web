import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'
import { listPendingPlacementRequests, type PlacementTargetType } from '@/lib/events/placement'
import { PlacementApprovalControls } from './placement-approval-controls'

// Approver surface for "Where does this event live" — the pending placement requests a steward of
// a Space or Circle can approve or decline. Mounted inside the entity's existing manage console
// (a Server Component, already gated on manage caps), so it adds no route and no menu item.
// Renders nothing when there is nothing to approve, keeping the console clean.

export async function PlacementApprovals({
  target,
}: {
  target: { type: PlacementTargetType; id: string }
}) {
  const requests = await listPendingPlacementRequests(target)
  if (requests.length === 0) return null

  const noun = target.type === 'space' ? 'Space' : 'Circle'

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarPlus className="h-4 w-4 text-subtle" />
        <h2 className="text-sm font-bold text-text">Event placement requests</h2>
        <span className="text-xs font-normal text-subtle">{requests.length}</span>
      </div>
      <p className="mb-3 text-xs text-subtle">
        Hosts who want their event to live in your {noun}. Approve to show it here, or decline to pass.
      </p>
      <ul className="space-y-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-elevated/40 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <Link href={`/events/${r.eventSlug}`} className="truncate text-sm font-medium text-text hover:underline">
                {r.eventTitle}
              </Link>
              <p className="truncate text-xs text-subtle">Requested by {r.requestedByName}</p>
            </div>
            <PlacementApprovalControls requestId={r.id} />
          </li>
        ))}
      </ul>
    </section>
  )
}

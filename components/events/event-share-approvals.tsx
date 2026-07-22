import Link from 'next/link'
import { Share2 } from 'lucide-react'
import { listIncomingShareRequestsForSpace } from '@/lib/events/event-share'
import { ShareApprovalControls } from './share-approval-controls'

// Approver surface for shared / co-hosted events (Events EC3). The pending share requests a steward of
// a Space can approve or decline — hosts who invited this Space to co-host their event. Mounted inside
// the Space's existing manage console (a Server Component, already gated on manage caps) beside the
// placement approvals, so it adds no route and no menu item. Renders nothing when the inbox is empty.

export async function EventShareApprovals({ spaceId }: { spaceId: string }) {
  const requests = await listIncomingShareRequestsForSpace(spaceId)
  if (requests.length === 0) return null

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-subtle" />
        <h2 className="text-sm font-bold text-text">Co-hosted event requests</h2>
        <span className="text-xs font-normal text-subtle">{requests.length}</span>
      </div>
      <p className="mb-3 text-xs text-subtle">
        Hosts who want their event on your Space calendar too. Add it to show it here, or decline to pass.
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
            <ShareApprovalControls shareId={r.id} />
          </li>
        ))}
      </ul>
    </section>
  )
}

import { Users } from 'lucide-react'
import { listSpaceMemberships } from '@/lib/spaces/memberships'
import { EmptyState } from '@/components/ui/empty-state'
import { MembershipCancelButton } from '@/components/spaces/membership-cancel-button'

// OWNER MEMBER LIST (ENTITY-SPACES-SYSTEM §2.5, memberships v1). A self-fetching server component for
// the owner memberships surface: the Business's active members (member name + tier + joined date),
// gated on canEditProfile inside listSpaceMemberships. Each row carries a Cancel affordance (the
// member or a space admin may cancel; the owner is always an admin of their Space). No em/en dashes
// (CONTENT-VOICE §10).

export async function MembershipOwnerList({ spaceId }: { spaceId: string }) {
  const members = await listSpaceMemberships(spaceId)

  if (members.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No members yet."
        description="When someone joins one of your tiers, they show here."
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
      {members.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{m.memberName}</p>
            <p className="text-xs text-muted">
              {m.tierName} · joined {sinceFmt.format(new Date(m.startedAt))}
            </p>
          </div>
          <MembershipCancelButton membershipId={m.id} />
        </li>
      ))}
    </ul>
  )
}

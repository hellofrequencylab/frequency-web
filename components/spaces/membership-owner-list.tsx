import { Users } from 'lucide-react'
import { listSpaceMemberships } from '@/lib/spaces/memberships'
import { EmptyState } from '@/components/ui/empty-state'
import { MembershipCancelButton } from '@/components/spaces/membership-cancel-button'
import { MembershipPromoteButton } from '@/components/spaces/membership-promote-button'

// OWNER MEMBER LIST (ENTITY-SPACES-SYSTEM §2.5, memberships v1). A self-fetching server component for
// the owner memberships surface: the Business's members (member name + tier + joined date), gated on
// canEditProfile inside listSpaceMemberships. WAITLIST rows (ADR-824) show a chip + a Promote
// affordance; every row carries a Cancel (the member or a space admin may cancel; the owner is
// always an admin of their Space). No em/en dashes (CONTENT-VOICE §10).

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
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface lift-1">
      {members.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-body-sm font-semibold text-text">
              {m.memberName}
              {m.status === 'waitlist' && (
                <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
                  Waitlist
                </span>
              )}
            </p>
            <p className="text-meta text-muted">
              {m.tierName} ·{' '}
              {m.status === 'waitlist'
                ? `waiting since ${sinceFmt.format(new Date(m.startedAt))}`
                : `joined ${sinceFmt.format(new Date(m.startedAt))}`}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            {m.status === 'waitlist' && <MembershipPromoteButton membershipId={m.id} />}
            <MembershipCancelButton membershipId={m.id} />
          </span>
        </li>
      ))}
    </ul>
  )
}

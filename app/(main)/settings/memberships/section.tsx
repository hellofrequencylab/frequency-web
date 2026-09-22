import Link from 'next/link'
import { Users } from 'lucide-react'
import { EntityCard } from '@/components/cards/entity-card'
import { EmptyState } from '@/components/ui/empty-state'
import { MembershipCancelButton } from '@/components/spaces/membership-cancel-button'
import {
  listMySpaceMemberships,
  membershipCadenceLabel,
} from '@/lib/spaces/my-memberships'

// THE MEMBER'S OWN SPACE MEMBERSHIPS on Settings (LIVE-423 / ADR-1472).
// Plan and billing is the Frequency Crew plan. This band is the communities
// the member joined. Cancel reuses the existing membership action.

export async function MyMembershipsSection() {
  const rows = await listMySpaceMemberships()

  if (rows.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        icon={Users}
        title="You have not joined a Space yet"
        description="When you do, it shows up here so you can open it or leave."
        action={
          <Link
            href="/spaces"
            className="inline-flex items-center rounded-control bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            Browse Spaces
          </Link>
        }
      />
    )
  }

  // The list, not the EmptyState above it: every row is a space_memberships read with a live
  // tier and cadence label (HYG-121). A membership added or removed is a height the mask
  // cannot hold; that is an accepted recapture.
  return (
    <ul data-visual-mask="settings-my-memberships" className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <EntityCard
            href={`/spaces/${row.spaceSlug}`}
            title={row.spaceName}
            context={`${row.tierName} · ${membershipCadenceLabel(row.billingInterval, row.status)}`}
            action={
              <MembershipCancelButton
                membershipId={row.id}
                label={row.status === 'waitlist' ? 'Leave the waitlist' : 'Cancel membership'}
              />
            }
          />
        </li>
      ))}
    </ul>
  )
}

import { Suspense } from 'react'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listAllMembershipTiers } from '@/lib/spaces/memberships'
import { MembershipTierForm } from '@/components/spaces/membership-tier-form'
import { MembershipOwnerList } from '@/components/spaces/membership-owner-list'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'
import type { Space } from '@/lib/spaces/types'

// MEMBERSHIPS section BODY (extracted from memberships/page.tsx so the unified Offerings surface can
// compose it as one stacked section). The route + auth gate stays on the caller (the Offerings page).
// The WRITE action (setMembershipTiers, behind MembershipTierForm) is unchanged and stays the source
// of truth (canEditProfile server-side). This component re-checks the memberships function gate and
// loads the same data the page always loaded.
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes no payment. No em/en dashes.

export async function MembershipsSection({
  space,
  viewerProfileId,
  staffViewing,
}: {
  space: Space
  viewerProfileId: string | null
  staffViewing: boolean
}) {
  const brandName = space.brandName ?? space.name

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'memberships', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Memberships"
        reason={spaceFunctionAccess(space, 'memberships', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
      />
    )
  }

  const tiers = await listAllMembershipTiers(space.id)

  return (
    <div className="space-y-8">
      {/* A disabled fieldset renders the editor READ-ONLY for a staff preview (it natively disables
          every nested control in the form). `display: contents` keeps it out of the layout box. */}
      <fieldset disabled={staffViewing} className="contents">
        <MembershipTierForm spaceId={space.id} slug={space.slug} initialTiers={tiers} />
      </fieldset>

      <section>
        <SectionHeader title="Members" />
        <Suspense fallback={<MembersSkeleton />}>
          <MembershipOwnerList spaceId={space.id} />
        </Suspense>
      </section>
    </div>
  )
}

// Dimension-matched skeleton for the streamed members list (no CLS, PAGE-FRAMEWORK §5.4).
function MembersSkeleton() {
  return (
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}

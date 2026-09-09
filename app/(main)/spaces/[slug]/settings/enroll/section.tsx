import { Suspense } from 'react'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { getSpaceProgramForOwner } from '@/lib/spaces/enroll'
import { ProgramForm } from '@/components/spaces/enroll/program-form'
import { EnrollmentOwnerList } from '@/components/spaces/enroll/enrollment-owner-list'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'
import type { Space } from '@/lib/spaces/types'

// ENROLLMENT section BODY. Its ONE caller is ./enroll-body.tsx, the `?panel=enroll` workspace. Offerings
// does not compose it: "define the program and see who enrolled" is a Journey plus the Memberships roster,
// so the section came off that page and the `enroll` function key is retired to `journeys` (LIVE-226,
// lib/spaces/functions.ts RETIRED_SPACE_FUNCTIONS).
//
// The route + auth gate stays on the caller. The WRITE action (setSpaceProgram, behind ProgramForm) is
// unchanged and stays the source of truth (canEditProfile server-side). The gate below resolves through
// the retired key to the `journeys` switch + min-role. This surface takes no payment. No em/en dashes.

export async function EnrollSection({
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
  if (!staffViewing && !spaceFunctionAccess(space, 'enroll', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Enrollment"
        reason={spaceFunctionAccess(space, 'enroll', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
      />
    )
  }

  const program = await getSpaceProgramForOwner(space.id)

  return (
    <div className="space-y-8">
      {/* A disabled fieldset renders the editor READ-ONLY for a staff preview (it natively disables
          every nested control in the form). `display: contents` keeps it out of the layout box. */}
      <fieldset disabled={staffViewing} className="contents">
        <ProgramForm spaceId={space.id} slug={space.slug} initialProgram={program} />
      </fieldset>

      <section>
        <SectionHeader title="Enrolled" />
        <Suspense fallback={<EnrolleesSkeleton />}>
          <EnrollmentOwnerList spaceId={space.id} />
        </Suspense>
      </section>
    </div>
  )
}

// Dimension-matched skeleton for the streamed enrollee list (no CLS, PAGE-FRAMEWORK §5.4).
function EnrolleesSkeleton() {
  return (
    <div className="space-y-px rounded-card border border-border bg-surface p-2 lift-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}

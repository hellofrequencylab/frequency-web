import { Suspense } from 'react'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { getSpaceProgramForOwner } from '@/lib/spaces/enroll'
import { ProgramForm } from '@/components/spaces/enroll/program-form'
import { EnrollmentOwnerList } from '@/components/spaces/enroll/enrollment-owner-list'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'
import type { Space } from '@/lib/spaces/types'

// ENROLLMENT section BODY (extracted from enroll/page.tsx so the unified Offerings surface can compose
// it as one stacked section). The route + auth gate stays on the caller (the Offerings page). The WRITE
// action (setSpaceProgram, behind ProgramForm) is unchanged and stays the source of truth
// (canEditProfile server-side). This component re-checks the enroll function gate and loads the same
// program the page always loaded.
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes no payment. No em/en dashes.

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
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}

import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceManageHref } from '@/lib/spaces/types'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { getSpaceProgramForOwner } from '@/lib/spaces/enroll'
import { ProgramForm } from '@/components/spaces/enroll/program-form'
import { EnrollmentOwnerList } from '@/components/spaces/enroll/enrollment-owner-list'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'

// OWNER PROGRAM EDITOR + ENROLLEES (ENTITY-SPACES-SYSTEM §2.7, MASTER-PLAN ADMIN-02, enroll v1). A
// centered, no-rail Focus surface (registered 'none' for /spaces/<slug>/settings/enroll in
// page-chrome.ts, alongside memberships). It resolves the Space, gates RENDER on canManage ||
// staffViewing (404s otherwise so a non-editor / non-staff viewer cannot tell the surface exists),
// then renders:
//   1. the program editor (setSpaceProgram behind the form), seeded with the current program, and
//   2. the owner's current ENROLLEES (name + enrolled date), streamed behind <Suspense>.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// editor is wrapped in a disabled fieldset (read-only). The write action (setSpaceProgram) stays
// gated on canEditProfile server-side, so staff viewing never confers a write. NOTE: the seeded
// program + enrollee list (getSpaceProgramForOwner / listSpaceEnrollments) are themselves gated on
// canEditProfile, so a staff viewer sees the editor structure but they read empty.
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes no payment. The editor has no price field and the
// description says enrolling reserves a seat and paid enrollment comes later. No em or en dashes.

export const metadata = {
  title: 'Enrollment',
}

export default async function SpaceEnrollPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else. The WRITE action (setSpaceProgram) stays gated on canEditProfile,
  // so staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). The default (enroll = editor) reproduces the old
  // canEditProfile threshold; a staff janitor keeps the read-only preview (write stays gated).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'enroll', caps.role)) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Enrollment"
        description="The program members enroll in for this space."
        back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      >
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          type={space.type}
          label="Enrollment"
          reason={spaceFunctionAccess(space, 'enroll', 'admin') ? 'role' : 'disabled'}
          canManageMembers={caps.canManageMembers}
        />
      </FocusTemplate>
    )
  }

  const program = await getSpaceProgramForOwner(space.id)

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Enrollment"
      description="Define the program members can enroll in, then see who has enrolled. Enrolling reserves a seat, and paid enrollment comes later."
      back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

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
    </FocusTemplate>
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

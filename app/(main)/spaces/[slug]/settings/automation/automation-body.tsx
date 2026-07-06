import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import {
  resolveSpaceManageAccess,
  getSpaceCapabilities,
  spaceHasEntitlement,
} from '@/lib/spaces/entitlements'
import { listAudienceTags } from '@/lib/spaces/audiences'
import { listSpaceSegments } from '@/lib/spaces/segments'
import { listSpaceRules, listSpaceSequences } from '@/lib/spaces/automation'
import { SectionHeader } from '@/components/ui/section-header'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { RulesPanel } from '@/components/spaces/automation/rules-panel'
import { SequencesPanel } from '@/components/spaces/automation/sequences-panel'

// AUTOMATION BODY — the chrome-free automation surface (rules + drip sequences), self-gating so it is
// safe to mount anywhere. It returns null when the viewer may not manage this Space (the page still 404s
// via its own gate). When automation is locked for a non-staff viewer it returns the FeatureLockedNotice
// (the page keeps the plain framing); otherwise the rules + sequences editors.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// editors render read-only. Every WRITE action stays gated on canEditProfile server-side.

export async function AutomationBody({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  const brandName = space.brandName ?? space.name
  const caps = await getSpaceCapabilities(space, viewerProfileId)

  // The `crm.space.automation` gate: the Space's plan must grant the automation entitlement. A staff
  // janitor keeps a read-only preview even when the plan lacks it (so staff can see the surface).
  if (!staffViewing && !spaceHasEntitlement(space, 'automation')) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Automation"
        reason="plan"
        canManageMembers={caps.canManageMembers}
        currentPlan={space.plan}
      />
    )
  }

  // RENDER is gated above, so these per-Space reads (each space_id-scoped + fail-safe) only run for an
  // authorized viewer. Tags + segments feed the audience pickers.
  const [rules, sequences, tags, segments] = await Promise.all([
    listSpaceRules(space.id),
    listSpaceSequences(space.id),
    listAudienceTags(space.id),
    listSpaceSegments(space.id),
  ])

  const segmentOptions = segments.map((s) => ({ id: s.id, name: s.name }))

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        <section>
          <SectionHeader title="Rules" />
          <p className="mb-3 text-sm text-muted">
            When something happens, send an email. Rules are saved here and run when their trigger
            fires.
          </p>
          <RulesPanel
            spaceId={space.id}
            slug={space.slug}
            rules={rules}
            tags={tags}
            segments={segmentOptions}
            readOnly={staffViewing}
          />
        </section>

        <section>
          <SectionHeader title="Drip sequences" />
          <p className="mb-3 text-sm text-muted">
            A named series of timed emails to a chosen audience. Add steps in order and set how long
            to wait before each.
          </p>
          <SequencesPanel
            spaceId={space.id}
            slug={space.slug}
            sequences={sequences}
            tags={tags}
            segments={segmentOptions}
            readOnly={staffViewing}
          />
        </section>
      </div>
    </>
  )
}

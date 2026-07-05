import { Suspense } from 'react'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { spaceFunctionAccessLive } from '@/lib/spaces/function-access'
import { isSpaceEmailEnabled } from '@/lib/spaces/email-toggle'
import { listAudienceTags } from '@/lib/spaces/audiences'
import { listSpaceSegments } from '@/lib/spaces/segments'
import { listSpaceEmailTemplates } from '@/lib/spaces/email-templates'
import { SectionHeader } from '@/components/ui/section-header'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { EmailEnableCard } from '@/components/spaces/email/email-enable-card'
import { ComposerShell } from '@/components/spaces/email/composer-shell'
import { CampaignList } from '@/components/spaces/email/campaign-list'
import { AnalyticsPanel } from '@/components/spaces/email/analytics-panel'
import { SuppressionList } from '@/components/spaces/email/suppression-list'
import { RecentSends } from '@/components/spaces/email/recent-sends'

// EMAIL BODY — the chrome-free campaign-authoring surface, lifted out of the standalone /settings/email
// page (Stage D2) so it renders in TWO places from one source: (1) that page, wrapped in its FocusTemplate
// chrome, and (2) INLINE in the Space profile body as the Email `?panel=` workspace
// (components/spaces/workspace/space-body-panel.tsx). It owns NO page chrome (the caller frames it) and
// SELF-GATES server-side so it is safe to mount anywhere: it returns null when the viewer may not manage
// this Space (the standalone page still 404s via its own gate, so a null here never renders a bare 200).
// When email is locked for a non-staff viewer it returns the FeatureLockedNotice (the caller keeps the
// plain framing); otherwise the enable gate, composer, deliverability, and campaign list.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// composer / enable card render read-only. Every WRITE action stays gated on canEditProfile server-side.
// VOICE (CONTENT-VOICE §10): plain labels, no narrated feelings, no em/en dashes.

export async function EmailBody({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  // SELF-GATE on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). Render
  // nothing for everyone else — the standalone page adds its own notFound() so it still 404s.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). Email is PLAN-GATED (the on/off switch is the
  // plan's `email` entitlement) with an `admin` default role. The LIVE resolver (ADR-370) folds the role +
  // entitlement check PLUS the featureAllowed('space_email') plan-ladder check. A staff janitor keeps the
  // read-only preview. The separate per-space email kill-switch (isSpaceEmailEnabled) still governs SENDING.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !(await spaceFunctionAccessLive(space, 'email', caps.role, space.plan))) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Email"
        // Plan-gated: no entitlement -> a plan nudge; entitlement present but role too low -> a team note.
        reason={spaceHasEntitlement(space, 'email') ? 'role' : 'plan'}
        canManageMembers={caps.canManageMembers}
        // ADR-518 Phase G: the tier range + placeholder price points on the plan gap.
        featureKey="space_email"
        currentPlan={space.plan}
      />
    )
  }

  // RENDER is already gated on canManage || staffViewing above, so these per-Space reads (each
  // space_id-scoped + fail-safe) only run for an authorized viewer. Segments + templates (ADR-380) feed
  // the composer's audience + template pickers.
  const [emailOn, tags, segments, templates] = await Promise.all([
    isSpaceEmailEnabled(space.id),
    listAudienceTags(space.id),
    listSpaceSegments(space.id),
    listSpaceEmailTemplates(space.id),
  ])

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        {!emailOn && (
          <EmailEnableCard spaceId={space.id} slug={space.slug} readOnly={staffViewing} />
        )}

        <section>
          <SectionHeader title="New campaign" />
          <ComposerShell
            spaceId={space.id}
            slug={space.slug}
            tags={tags}
            segments={segments.map((s) => ({ id: s.id, name: s.name }))}
            templates={templates.map((t) => ({
              id: t.id,
              name: t.name,
              subject: t.subject,
              body: t.body,
            }))}
            canSend={emailOn}
            readOnly={staffViewing}
          />
        </section>

        <section>
          <SectionHeader title="Deliverability" />
          <div className="space-y-6">
            <Suspense fallback={null}>
              <AnalyticsPanel spaceId={space.id} />
            </Suspense>
            <Suspense fallback={null}>
              <SuppressionList spaceId={space.id} />
            </Suspense>
            <Suspense fallback={null}>
              <RecentSends spaceId={space.id} />
            </Suspense>
          </div>
        </section>

        <section>
          <SectionHeader title="Campaigns" />
          <Suspense fallback={<CampaignsSkeleton />}>
            <CampaignList spaceId={space.id} />
          </Suspense>
        </section>
      </div>
    </>
  )
}

// Dimension-matched skeleton for the streamed campaign list (no CLS, PAGE-FRAMEWORK §5.4).
function CampaignsSkeleton() {
  return (
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}

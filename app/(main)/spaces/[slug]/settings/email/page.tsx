import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FocusTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isSpaceEmailEnabled } from '@/lib/spaces/email-toggle'
import { listAudienceTags } from '@/lib/spaces/audiences'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { EmailEnableCard } from '@/components/spaces/email/email-enable-card'
import { ComposerShell } from '@/components/spaces/email/composer-shell'
import { CampaignList } from '@/components/spaces/email/campaign-list'
import { AnalyticsPanel } from '@/components/spaces/email/analytics-panel'
import { SuppressionList } from '@/components/spaces/email/suppression-list'
import { RecentSends } from '@/components/spaces/email/recent-sends'

// OWNER EMAIL SURFACE (ENTITY-SPACES-BUILD §C Phase 3, "campaign authoring"). A centered, no-rail Focus
// surface (registered 'none' for /spaces/<slug>/settings/email in page-chrome.ts, alongside the other
// owner sub-surfaces). It resolves the Space, gates RENDER on canManage || staffViewing (404s
// otherwise so a non-editor / non-staff viewer cannot tell the surface exists), then renders:
//   1. the per-Space email ENABLE GATE: when email is off, an enable card with the anti-spam
//      acknowledgment (the only thing shown until email is on). When on, the composer.
//   2. the composer (subject + body, the existing block/compose pattern with KIT primitives) + the
//      AUDIENCE picker (all contacts or by tag, live count) + a Send / Schedule control.
//   3. the Space's campaigns, streamed behind <Suspense>.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// composer / enable card render read-only. Every WRITE action stays gated on canEditProfile
// server-side, so staff viewing never confers a write.
//
// SENDING is wired to the backbone seam (sendSpaceCampaign / the kill-switch in @/lib/spaces/email).
// This surface authors + schedules + sends. The Deliverability section renders the analytics panel
// (AnalyticsPanel) and the opt-out list (SuppressionList), both self-fetching and gated server-side.

export const metadata = {
  title: 'Email',
}

export default async function SpaceEmailPage({
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
  // (not 403) for everyone else. The WRITE actions stay gated on canEditProfile, so staff viewing is
  // read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). Email is PLAN-GATED (the on/off switch is the
  // plan's `email` entitlement) with an `admin` default role. The resolver folds both: a space whose
  // plan lacks email, or a viewer below the role, gets the locked state. A staff janitor keeps the
  // read-only preview (the EmailEnableCard + composer render read-only; every write stays gated). The
  // separate per-space email kill-switch (isSpaceEmailEnabled) still governs whether SENDING is live.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'email', caps.role)) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Email"
        description="Campaigns for this space."
        back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      >
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          label="Email"
          // Plan-gated: no entitlement -> a plan nudge; entitlement present but role too low -> a team note.
          reason={spaceHasEntitlement(space, 'email') ? 'role' : 'plan'}
          canManageMembers={caps.canManageMembers}
        />
      </FocusTemplate>
    )
  }

  const [emailOn, tags] = await Promise.all([
    isSpaceEmailEnabled(space.id),
    listAudienceTags(space.id),
  ])

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Email"
      description="Write a campaign, pick who gets it from your own contacts, and send or schedule it."
      back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      width="wide"
    >
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
    </FocusTemplate>
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

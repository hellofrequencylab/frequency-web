import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { Users } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStaff } from '@/lib/core/roles'
import { getStaffMember, staffCan } from '@/lib/staff'
import { SITE_URL } from '@/lib/site'
import { FocusTemplate } from '@/components/templates'
import { BroadcastComposer } from '@/components/comms/broadcast-composer'
import type { BroadcastChannelOption, BroadcastSegment } from '@/components/comms/broadcast-types'
import { resolveJourneyLaunchContext } from '@/lib/journeys/launch-access'
import { buildLaunchCampaignDrafts } from '@/lib/journeys/launch-campaigns'
import { allowedLaunchKeys, LAUNCH_SERIES_PAID_MESSAGE } from '@/lib/journeys/launch-surface'
import { JourneyLaunch, type LaunchDraftView } from '@/components/journey/v2/journey-launch'
import { sendJourneyBroadcastAction } from './actions'

// THE LAUNCH SURFACE (ADR-840). Where a publisher lands the moment a Journey goes live: the
// best-practice campaign series, already drafted against this Journey's own run window, laid out
// for review, edit, and scheduling in one pass — plus the one-click funnel and a way to message
// the people who have already enrolled.
//
// Author-gated exactly like the guide (/journeys/[slug]/guide): a signed-out or non-authoring
// visitor goes to the player. Tier-aware through resolveJourneyAccess (lane J1's resolver, reached
// via lib/journeys/launch-access.ts) — a tier without the scheduled series still sees the sends it
// may run plus ONE quiet upgrade line, never a wall of locked panels.
//
// Server Component. The enrollee composer streams behind its own <Suspense> so a big roster never
// blocks the series (PAGE-FRAMEWORK §5).
export const dynamic = 'force-dynamic'

/** Message enrollees — a self-fetching RSC that mounts the shared, scope-agnostic BroadcastComposer
 *  with the plan-bound send action. It supplies the segments; the action owns authorization,
 *  re-resolves the audience from the segment keys, and reports per-channel outcomes. */
async function EnrolleeBroadcastSection({ planId }: { planId: string }) {
  const { data } = await createAdminClient()
    .from('journey_enrollments')
    .select('profile_id, completed_at')
    .eq('plan_id', planId)
  const rows = (data ?? []) as { profile_id: string; completed_at: string | null }[]
  if (rows.length === 0) return null

  const all = [...new Set(rows.map((r) => r.profile_id))]
  const finished = [...new Set(rows.filter((r) => r.completed_at).map((r) => r.profile_id))]
  const inProgress = all.filter((id) => !finished.includes(id))

  const segments: BroadcastSegment[] = [
    { key: 'all', label: 'Everyone enrolled', profileIds: all },
    { key: 'in_progress', label: 'Still going', profileIds: inProgress },
    { key: 'finished', label: 'Finished', profileIds: finished },
  ].filter((s) => s.profileIds.length > 0)

  // Refuse-first channels (ADR-256 convention): only the lane that really works is enabled, and
  // every other chip says plainly why it is not.
  const channels: BroadcastChannelOption[] = [
    { key: 'dm', enabled: true, note: 'Lands in each person’s Frequency inbox as a message from you.' },
    { key: 'email', enabled: false, note: 'Use the launch series above to email your list' },
    { key: 'dispatch', enabled: false, note: 'Not wired for Journeys yet' },
    { key: 'sms', enabled: false, note: 'Coming soon' },
  ]

  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary-strong" aria-hidden />
        <h2 className="text-sm font-semibold text-text">Message enrollees</h2>
      </div>
      <BroadcastComposer
        heading="Message enrollees"
        segments={segments}
        channels={channels}
        send={sendJourneyBroadcastAction.bind(null, planId)}
        bodyPlaceholder="What should everyone know? A start time, what to bring, where to begin."
      />
    </section>
  )
}

export default async function JourneyLaunchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  if (!caller) redirect(`/journeys/${slug}/learn`)

  const { data } = await createAdminClient()
    .from('journey_plans')
    .select('id, visibility')
    .eq('slug', slug)
    .maybeSingle()
  const row = (data ?? null) as { id: string; visibility: string | null } | null
  if (!row) notFound()

  // The author gate + the tier answer in one resolve (canEditJourney inside). A viewer who cannot
  // edit this Journey goes to the player, exactly like the guide surface.
  const ctx = await resolveJourneyLaunchContext(row.id, {
    profileId: caller.id,
    role: caller.community_role,
    webRole: caller.webRole,
    tier: caller.membershipTier,
    realTier: caller.realMembershipTier,
  })
  if (!ctx) redirect(`/journeys/${slug}/learn`)

  // The pre-drafted series, dates derived from this Journey's own run window. Filtered to what this
  // tier may actually schedule; the server action re-applies the same rule on every write.
  const seriesAllowed = ctx.access.launchCampaignsAllowed
  const keys = allowedLaunchKeys(seriesAllowed)
  const drafts: LaunchDraftView[] = buildLaunchCampaignDrafts({
    title: ctx.title,
    journeyUrl: `${SITE_URL}/journeys/${slug}/learn`,
    windowStartsAt: ctx.windowStartsAt,
  })
    .filter((d) => keys.includes(d.key))
    .map((d) => ({
      key: d.key,
      name: d.name,
      purpose: d.purpose,
      subject: d.subject,
      body: d.body,
      sendAt: d.sendAt,
    }))

  // The Growth OS funnel builder is a marketing-capability surface (its own actions re-check this);
  // showing the button to someone who cannot use it would only produce a refusal.
  const staff = await getStaffMember().catch(() => null)
  const canBuildFunnel = isStaff(caller.webRole) || (!!staff && staffCan(staff.role, 'marketing', 'write'))

  const live = row.visibility === 'public' || row.visibility === 'unlisted'

  return (
    <FocusTemplate
      eyebrow={live ? 'Published' : 'Not published yet'}
      title="Launch it"
      description={`${ctx.title} is ready for people. Here is the run of sends that brings them in.`}
      back={{ href: `/journeys/${slug}/learn`, label: 'Back to the Journey' }}
      width="wide"
    >
      <JourneyLaunch
        planId={ctx.planId}
        slug={slug}
        title={ctx.title}
        drafts={drafts}
        access={{
          seriesAllowed,
          hasSpace: !!ctx.spaceId,
          canBuildFunnel,
          upsell: seriesAllowed ? null : LAUNCH_SERIES_PAID_MESSAGE,
        }}
      >
        <Suspense fallback={null}>
          <EnrolleeBroadcastSection planId={ctx.planId} />
        </Suspense>
      </JourneyLaunch>
    </FocusTemplate>
  )
}

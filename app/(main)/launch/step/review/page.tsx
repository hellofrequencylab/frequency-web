import { notFound, redirect } from 'next/navigation'
import { ReviewPublish } from '@/components/launch/review-publish'
import { DashboardTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { REVIEW_ERRORS, type ReviewErrorCode } from '@/lib/launch/review'
import { loadReviewDraft } from '@/lib/launch/review-io'
import { getActiveLaunch } from '@/lib/launch/store'

// /launch/step/review: the one Review + Publish screen. Everything built from what the person told us, with their own
// words beside it, editable in place, and one Publish. Read under the person's own session, so it only ever shows their
// own launch. Dark while LAUNCH_SYSTEM_ENABLED is off.
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/launch/step/review')
  const launch = await getActiveLaunch(profileId)
  if (!launch) redirect('/launch')
  const { e } = await searchParams
  const errorCode = typeof e === 'string' && e in REVIEW_ERRORS ? (e as ReviewErrorCode) : undefined
  return (
    <DashboardTemplate
      eyebrow="Almost there"
      title="Review and publish"
      description="Everything here is built from what you told us, with your own words beside it. Change anything. Nothing goes live until you press Publish."
      adminBar={false}
      width="default"
    >
      <ReviewPublish draft={await loadReviewDraft(launch)} errorCode={errorCode} />
    </DashboardTemplate>
  )
}

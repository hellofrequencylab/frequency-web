import { notFound, redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { getMyProfileId } from '@/lib/auth'
import { restartLaunchFormAction } from '@/lib/launch/actions'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { flowView } from '@/lib/launch/flow'
import { resumeView } from '@/lib/launch/resume'
import { getLaunchForOwner } from '@/lib/launch/store'
import Link from 'next/link'
import { LaunchOverview } from '@/components/launch/launch-overview'
import { LaunchClockSlot } from '@/components/launch/launch-clock-slot'
import { loadInventory } from '@/lib/launch/inventory-io'
import { overviewProgress } from '@/lib/launch/overview'
import { loadKnownProfile } from '@/lib/launch/known-io'

// /launch (VLS-10): the welcome-back page for a launch that is already started. One of three things: where
// you stopped and what you have made so far, a card to start again after a stop, or a note that it is done.
// Dark while LAUNCH_SYSTEM_ENABLED is off. Reads the launch under the person's own session, so it only ever
// shows their own.
export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ lid?: string }> }) {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const { lid } = await searchParams
  const launch = await getLaunchForOwner(profileId, typeof lid === 'string' ? lid : undefined)
  if (!launch && lid) notFound()
  if (!launch) {
    return (
      <FocusTemplate title="Your launch" width="narrow">
        <EmptyState title="No launch yet" description="When you start one, your place in it is kept here." />
      </FocusTemplate>
    )
  }

  const view = resumeView(launch, new Date())

  if (view.kind === 'restart') {
    return (
      <FocusTemplate title="Your launch" description="You stopped it. What you made is still yours." width="narrow">
        <EmptyState
          title="Start again whenever you like"
          description="Your drafts are kept for 30 days. Starting again opens a fresh launch."
          action={
            <form action={restartLaunchFormAction}>
              <Button type="submit">Start my launch again</Button>
            </form>
          }
        />
      </FocusTemplate>
    )
  }

  if (view.kind === 'complete') {
    return (
      <FocusTemplate title="You're live" description="Your Spotlight, Space, site and list are up." width="narrow">
        <EmptyState variant="cleared" title="Your launch is done" description="Anything optional you skipped stays in your profile menu." />
      </FocusTemplate>
    )
  }

  // The one page every way in lands on: what the account already has, ticked, and what is next.
  const sections = await loadInventory(launch.spaceId ?? null, profileId)
  if (sections) {
    const known = await loadKnownProfile(profileId)
    const progress = overviewProgress(sections)
    const who = (known?.displayName ?? '').trim().split(/\s+/)[0] || 'friend'
    return (
      <FocusTemplate title="Your launch" description={`You stopped at ${view.label}. Saved ${view.savedAgo}.`} width="narrow">
        <div className="flex flex-col gap-5">
          <LaunchClockSlot launchId={launch.id} ownerId={profileId} stages={progress.sections.map((s) => s.title)} stagesDone={progress.sections.filter((s) => s.state === 'done').length} done={progress.done} total={progress.total} />
          <LaunchOverview sections={sections} who={who} nextHref={view.href} />
        </div>
      </FocusTemplate>
    )
  }

  const stages = flowView(launch).stages
  const stagesDone = stages.filter((s) => s.state === 'live').length
  return (
    <FocusTemplate
      title="Welcome back"
      description={`You stopped at ${view.label}. Saved ${view.savedAgo}.`}
      width="narrow"
    >
      <div className="flex flex-col gap-4">
        <LaunchClockSlot launchId={launch.id} ownerId={profileId} stages={stages.map((s) => s.label)} stagesDone={stagesDone} done={stagesDone} total={stages.length} />
        {view.made.length > 0 && (
          <p className="t2">What you have made so far: {view.made.join(', ')}.</p>
        )}
        <div>
          <Button asChild>
            <Link href={view.href}>Pick up where I left off</Link>
          </Button>
        </div>
      </div>
    </FocusTemplate>
  )
}

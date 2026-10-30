import { notFound, redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { getMyProfileId } from '@/lib/auth'
import { restartLaunchFormAction } from '@/lib/launch/actions'
import { inFlowHref } from '@/lib/launch/destination'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { flowView } from '@/lib/launch/flow'
import { recordLaunchEvent } from '@/lib/launch/events'
import { readPendingLaunch } from '@/lib/launch/pending-io'
import { resumeView } from '@/lib/launch/resume'
import { completeLaunch, getLaunchForOwner, startLaunch } from '@/lib/launch/store'
import { launchStepHref } from '@/lib/launch/steps'
import Link from 'next/link'
import { LaunchOverview } from '@/components/launch/launch-overview'
import { LaunchClockSlot } from '@/components/launch/launch-clock-slot'
import { LaunchIntent } from '@/components/launch/launch-intent'
import { showIntent } from '@/lib/launch/intent'
import { PublishedNote } from '@/components/launch/published-note'
import { wentLive } from '@/lib/launch/review'
import { loadInventory } from '@/lib/launch/inventory-io'
import { overviewProgress } from '@/lib/launch/overview'
import { loadKnownProfile } from '@/lib/launch/known-io'

// /launch (VLS-10): the one home of the launch, and where every way in lands (lib/launch/destination.ts). With nothing
// started yet it starts the launch. Then one of three things: where
// you stopped and what you have made so far, a card to start again after a stop, or a note that it is done.
// Dark while LAUNCH_SYSTEM_ENABLED is off. Reads the launch under the person's own session, so it only ever
// shows their own.
export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ lid?: string; published?: string }> }) {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const { lid, published } = await searchParams
  let launch = await getLaunchForOwner(profileId, typeof lid === 'string' ? lid : undefined)
  if (!launch && lid) notFound()
  if (!launch) {
    // Never a dead end: arriving with nothing started starts it, carrying anything held before sign-in (the niche and
    // intents of lib/launch/pending.ts, whose answers the Spotlight form reads and claims itself). startLaunch hands
    // back a launch already running, so a second tab never makes a second row.
    const held = await readPendingLaunch()
    launch = await startLaunch(profileId, { niche: held?.niche ?? null, intents: held?.intents ?? [] })
    if (launch) await recordLaunchEvent(profileId, { type: 'launch_started', launchId: launch.id })
    // No Space yet: nothing to take stock of, so the Spotlight form (which makes it) is the way on.
    if (!launch) redirect(inFlowHref(launchStepHref('spotlight')))
  }

  const view = resumeView(launch, new Date())
  const justPublished = published === '1'
  const spotlightRef = launch.steps.spotlight?.status === 'published' ? launch.steps.spotlight.ref : undefined

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
  const inventory = await loadInventory(launch.spaceId ?? null, profileId, launch.skippedPhotos)
  if (inventory) {
    const known = await loadKnownProfile(profileId)
    const progress = overviewProgress(inventory.sections)
    // Every item ticked is the finish line: mark it once, so the box, the clock and the emails stand down for good.
    if (!launch.completedAt && progress.total > 0 && progress.done === progress.total) await completeLaunch(launch)
    const who = (known?.displayName ?? '').trim().split(/\s+/)[0] || 'friend'
    return (
      <FocusTemplate title={justPublished ? 'Published' : 'Your launch'} description={justPublished ? 'Here is everything, ticked as it went live.' : `You stopped at ${view.label}. Saved ${view.savedAgo}.`} width="narrow">
        <div style={{ display: 'grid', gap: 20 }}>
          <LaunchClockSlot launchId={launch.id} ownerId={profileId} stages={progress.sections.map((s) => s.title)} stagesDone={progress.sections.filter((s) => s.state === 'done').length} done={progress.done} total={progress.total} />
          {justPublished ? <PublishedNote who={who} spotlightHref={spotlightRef ? `/spaces/${encodeURIComponent(spotlightRef)}/spotlight` : null} wentLive={wentLive(inventory.sections)} /> : null}
          <LaunchOverview sections={inventory.sections} who={who} nextHref={inFlowHref(view.href)} space={inventory.space} />
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
        {showIntent({ spaceId: launch.spaceId, made: view.made }) ? (
          <LaunchIntent spaceHref={inFlowHref(view.href)} />
        ) : (
          <div>
            <Button asChild>
              <Link href={inFlowHref(view.href)}>Pick up where I left off</Link>
            </Button>
          </div>
        )}
      </div>
    </FocusTemplate>
  )
}

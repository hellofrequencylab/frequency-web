import { notFound, redirect } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { getMyProfileId } from '@/lib/auth'
import { restartLaunchFormAction } from '@/lib/launch/actions'
import { inFlowHref } from '@/lib/launch/destination'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { recordLaunchEvent } from '@/lib/launch/events'
import { readPendingLaunch } from '@/lib/launch/pending-io'
import { resumeView } from '@/lib/launch/resume'
import { getLaunchForOwner, startLaunch } from '@/lib/launch/store'
import { launchStepHref } from '@/lib/launch/steps'
import Link from 'next/link'
import { LaunchOverview } from '@/components/launch/launch-overview'
import { loadInventory } from '@/lib/launch/inventory-io'
import { loadKnownProfile } from '@/lib/launch/known-io'

// /launch (VLS-10): the one home of the launch, and where every way in lands (lib/launch/destination.ts). With nothing
// started yet it starts the launch. Then one of three things: where
// you stopped and what you have made so far, a card to start again after a stop, or a note that it is done.
// Dark while LAUNCH_SYSTEM_ENABLED is off. Reads the launch under the person's own session, so it only ever
// shows their own.
export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ lid?: string }> }) {
  if (!launchSystemEnabled()) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const { lid } = await searchParams
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
    const who = (known?.displayName ?? '').trim().split(/\s+/)[0] || 'friend'
    return (
      <FocusTemplate title="Your launch" description={`You stopped at ${view.label}. Saved ${view.savedAgo}.`} width="narrow">
        <LaunchOverview sections={inventory.sections} who={who} nextHref={inFlowHref(view.href)} space={inventory.space} />
      </FocusTemplate>
    )
  }

  return (
    <FocusTemplate
      title="Welcome back"
      description={`You stopped at ${view.label}. Saved ${view.savedAgo}.`}
      width="narrow"
    >
      <div className="flex flex-col gap-4">
        {view.made.length > 0 && (
          <p className="t2">What you have made so far: {view.made.join(', ')}.</p>
        )}
        <div>
          <Button asChild>
            <Link href={inFlowHref(view.href)}>Pick up where I left off</Link>
          </Button>
        </div>
      </div>
    </FocusTemplate>
  )
}

import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { recordLaunchEvent } from '@/lib/launch/events'
import { readPendingLaunch, writePendingLaunch } from '@/lib/launch/pending-io'
import { launchHomeHref } from '@/lib/launch/destination'
import { getActiveLaunch, startLaunch } from '@/lib/launch/store'
import { resolvePicker } from '@/lib/spaces/space-picker'

// /launch/start (VLS-07): where every "Get a Free Spotlight" button lands. The niche comes from `niche`, or from the
// door or theme the button sat on (`utm_content`); anything that is not a known niche is dropped. No account is asked
// for here: a visitor is held in the launch cookie and walks the Spotlight form, and a signed-in member starts their
// launch (or picks up the one running) and lands on /launch (lib/launch/destination.ts). The utm values ride the URL so the first-touch capture
// has already recorded them. Dark while LAUNCH_SYSTEM_ENABLED is off.
export async function GET(request: Request) {
  if (!launchSystemEnabled()) notFound()
  const q = new URL(request.url).searchParams
  const niche = resolvePicker({ niche: q.get('niche') ?? q.get('utm_content') }).niche ?? null
  
  const profileId = await getMyProfileId()
  if (!profileId) {
    const held = await readPendingLaunch()
    await writePendingLaunch({ niche: niche ?? held?.niche ?? null, intents: held?.intents ?? [], answers: held?.answers ?? {} })
    redirect(launchHomeHref({ signedIn: false }))
  }

  if (!(await getActiveLaunch(profileId))) {
    const launch = await startLaunch(profileId, { niche, intents: [] })
    if (launch) await recordLaunchEvent(profileId, { type: 'launch_started', launchId: launch.id })
  }
  redirect(launchHomeHref({ signedIn: true }))
}

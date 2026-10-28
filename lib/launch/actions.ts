'use server'

// THE CLIENT-CALLABLE LAUNCH ACTIONS (VLS-08). The launch box calls these. A 'use server' module exports only
// async functions, so the rules stay in lib/launch/state.ts and the IO in lib/launch/store.ts; this is the
// thin seam that adds the two gates every call needs: the launch is switched on (LAUNCH_SYSTEM_ENABLED) and
// the caller is signed in. The row's owner policy is the real authorization: every write is made under the
// person's own session and names them as the owner.
//
// What is NOT here on purpose: publishing a step. A step is done when its real thing exists (done-checks.ts),
// so a step's own server code records it. A client cannot claim it.

import { getMyProfileId } from '@/lib/auth'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { launchSystemEnabled } from './enabled'
import { recordLaunchEvent } from './events'
import type { LaunchSnapshot } from './state'
import * as store from './store'

const OFF = 'The launch is not open yet.'
const SIGN_IN = 'Sign in to keep going.'
const GONE = 'There is no launch in progress.'
const RETRY = 'We could not save that. Try again.'

async function mine(): Promise<{ profileId: string; launch: LaunchSnapshot } | { error: string }> {
  if (!launchSystemEnabled()) return { error: OFF }
  const profileId = await getMyProfileId()
  if (!profileId) return { error: SIGN_IN }
  const launch = await store.getActiveLaunch(profileId)
  return launch ? { profileId, launch } : { error: GONE }
}

export async function setMinimizedAction(minimized: boolean): Promise<ActionResult> {
  const who = await mine()
  if ('error' in who) return fail(who.error)
  return (await store.setMinimized(who.launch, minimized === true)) ? ok() : fail(RETRY)
}

/** Cancel, call one. The launch stays active until the second call carries the typed word. */
export async function requestCancelAction(): Promise<ActionResult> {
  const who = await mine()
  if ('error' in who) return fail(who.error)
  return (await store.requestCancel(who.launch)) ? ok() : fail(RETRY)
}

/** Cancel, call two: the typed word, inside the window. */
export async function confirmCancelAction(typed: string): Promise<ActionResult> {
  const who = await mine()
  if ('error' in who) return fail(who.error)
  const res = await store.confirmCancel(who.launch, typed)
  if (res.ok) {
    await recordLaunchEvent(who.profileId, { type: 'launch_cancelled', launchId: who.launch.id })
    return ok()
  }
  if (res.reason === 'wrong_word') return fail('Type STOP to end your launch.')
  if (res.reason === 'expired' || res.reason === 'not_requested') return fail('Ask to stop again, then type STOP.')
  return fail(GONE)
}

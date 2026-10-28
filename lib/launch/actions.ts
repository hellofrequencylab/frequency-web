'use server'

// THE CLIENT-CALLABLE LAUNCH ACTIONS (VLS-08). The launch box calls these. A 'use server' module exports only
// async functions, so the rules stay in lib/launch/state.ts and the IO in lib/launch/store.ts; this is the
// thin seam that adds the two gates every call needs: the launch is switched on (LAUNCH_SYSTEM_ENABLED) and
// the caller is signed in. The row's owner policy is the real authorization: every write is made under the
// person's own session and names them as the owner.
//
// What is NOT here on purpose: publishing a step. A step is done when its real thing exists (done-checks.ts),
// so a step's own server code records it. A client cannot claim it.

import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { launchSystemEnabled } from './enabled'
import { recordLaunchEvent } from './events'
import { clearPendingLaunch, readPendingLaunch, writePendingLaunch } from './pending-io'
import { launchStepPublishedHref } from './published'
import { parseSpotlightAnswers } from './spotlight-step'
import { publishSpotlightStep } from './spotlight-io'
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

/** The restart card's button (a plain form action): begin again with the stopped launch's niche and starting
 *  intents, then land on the welcome-back page. A launch already running is picked back up, never doubled. */
export async function restartLaunchFormAction(): Promise<void> {
  if (!launchSystemEnabled()) redirect('/launch')
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const last = await store.getLaunchForOwner(profileId)
  const launch = await store.startLaunch(profileId, { niche: last?.niche ?? null, intents: last?.intents ?? [] })
  if (launch && launch.id !== last?.id) await recordLaunchEvent(profileId, { type: 'launch_started', launchId: launch.id })
  redirect('/launch')
}

const SPOTLIGHT_ERRORS = { name: 'Add the name people know you by.', line: 'Add one line about what you do, in your own words.', retry: 'We could not publish that. Try again.' } as const
type SpotlightErrorCode = keyof typeof SPOTLIGHT_ERRORS

/** The Spotlight step's address with an error code the page turns into a line. Codes, never text, so the address
 *  cannot be used to put words on the page. */
function spotlightStepUrl(code?: SpotlightErrorCode): string {
  return code ? `/launch/step/spotlight?e=${code}` : '/launch/step/spotlight'
}

/** The Spotlight step's Publish button (VLS-07). Signed out, the answers are held in the launch cookie and the
 *  visitor is sent to sign in, which is the one moment an account is asked for. Signed in, the Space is made if this
 *  launch has none, its Spotlight is published, and the step is recorded. Lands on the step's published screen. */
export async function publishSpotlightFormAction(formData: FormData): Promise<void> {
  if (!launchSystemEnabled()) redirect('/')
  const answers = parseSpotlightAnswers({ name: formData.get('name'), line: formData.get('line'), link: formData.get('link') })
  if ('error' in answers) redirect(spotlightStepUrl(answers.error === SPOTLIGHT_ERRORS.name ? 'name' : 'line'))

  const held = await readPendingLaunch()
  const profileId = await getMyProfileId()
  if (!profileId) {
    await writePendingLaunch({ niche: held?.niche ?? null, intents: held?.intents ?? [], answers: { ...held?.answers, spotlight: { name: answers.name, line: answers.line, link: answers.link } } })
    redirect('/sign-in?next=/launch/claim')
  }

  let launch = await store.getActiveLaunch(profileId)
  if (!launch) {
    launch = await store.startLaunch(profileId, { niche: held?.niche ?? null, intents: held?.intents ?? [] })
    if (launch) await recordLaunchEvent(profileId, { type: 'launch_started', launchId: launch.id })
  }
  if (!launch) redirect(spotlightStepUrl('retry'))

  const made = await publishSpotlightStep(profileId, launch, answers)
  if ('error' in made) redirect(spotlightStepUrl('retry'))
  await clearPendingLaunch()
  redirect(launchStepPublishedHref('spotlight'))
}

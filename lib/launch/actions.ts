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
import { recordClockBeat } from './clock-io'
import type { BeatKind } from './clock'
import { buildLaunchDraft } from './buildout-io'
import { inFlowHref } from './destination'
import { launchSystemEnabled } from './enabled'
import { recordLaunchEvent } from './events'
import { readCarry } from './carry'
import { clearPendingLaunch, readPendingLaunch, writePendingLaunch } from './pending-io'
import { launchStepPublishedHref } from './published'
import { NEW_SPACE, parseSpaceChoice } from './space-choice'
import { listOwnedSpaces } from './spaces-io'
import { PUBLISHED_HREF, REVIEW_HREF, parseReviewDraft, type ReviewErrorCode } from './review'
import { publishReview } from './review-io'
import { parseSpotlightAnswers } from './spotlight-step'
import { publishSpotlightStep } from './spotlight-io'
import type { LaunchSnapshot } from './state'
import { askHideSetup, confirmHideSetup, showSetupAgain } from './setup-hidden-io'
import * as store from './store'
import { launchStepHref } from './steps'

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

/** The clock's heartbeat (start, beat, stop). The open page sends one every 15 seconds while the person is working;
 *  the server adds the time since the last one, never more than 30 seconds, and returns the active milliseconds kept. */
export async function clockBeatAction(kind: BeatKind): Promise<ActionResult<{ activeMs: number }>> {
  if (kind !== 'start' && kind !== 'beat' && kind !== 'stop') return fail(RETRY)
  const who = await mine()
  if ('error' in who) return fail(who.error)
  const activeMs = await recordClockBeat(who.launch.id, who.profileId, kind)
  return activeMs === null ? fail(RETRY) : ok({ activeMs })
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
  return code ? `${launchStepHref('spotlight')}?e=${code}` : inFlowHref(launchStepHref('spotlight'))
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
    await writePendingLaunch({ niche: held?.niche ?? null, intents: held?.intents ?? [], answers: { ...held?.answers, spotlight: { ...held?.answers.spotlight, name: answers.name, line: answers.line, link: answers.link } } })
    redirect('/sign-in?next=/launch/claim')
  }

  let launch = await store.getActiveLaunch(profileId)
  if (!launch) {
    launch = await store.startLaunch(profileId, { niche: held?.niche ?? null, intents: held?.intents ?? [] })
    if (launch) await recordLaunchEvent(profileId, { type: 'launch_started', launchId: launch.id })
  }
  if (!launch) redirect(spotlightStepUrl('retry'))

  const made = await publishSpotlightStep(profileId, launch, answers, readCarry(held?.answers.spotlight))
  if ('error' in made) redirect(spotlightStepUrl('retry'))
  await clearPendingLaunch()
  redirect(launchStepPublishedHref('spotlight'))
}

/** The Space step's Keep button (VLS-17, first cut). The Space already exists the moment the Spotlight is published, so
 *  this records that the person has looked it over and opens Website; nothing here leaves the page. It only counts
 *  once the Spotlight is published, so the order holds. Ends back on the one launch page. */
export async function keepSpaceFormAction(): Promise<void> {
  if (!launchSystemEnabled()) redirect('/')
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const launch = await store.getActiveLaunch(profileId)
  const slug = launch?.steps.spotlight?.status === 'published' ? launch.steps.spotlight.ref : undefined
  if (!launch || !slug) redirect(spotlightStepUrl())
  if (launch.steps.space?.status !== 'published') {
    await store.markStepPublished(launch, 'space', slug)
    await recordLaunchEvent(profileId, { type: 'step_published', launchId: launch.id, step: 'space' })
  }
  redirect(spotlightStepUrl())
}

/** The "Which Space is this for?" button. The person picks one of their own Spaces or a new one. A Space is attached to
 *  the launch (no second one is made), and when its Spotlight is already live that step counts as done, so what exists
 *  fills the page and anything they change is written back to the same records. Ends back on the one launch page. */
export async function chooseSpaceFormAction(formData: FormData): Promise<void> {
  if (!launchSystemEnabled()) redirect('/')
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/launch/claim')
  const spaces = await listOwnedSpaces(profileId)
  const choice = parseSpaceChoice(formData.get('space'), spaces)
  if (choice === null) redirect(spotlightStepUrl())
  if (choice === NEW_SPACE) redirect(`${launchStepHref('spotlight')}?new=1`)
  const held = await readPendingLaunch()
  const running = await store.getActiveLaunch(profileId)
  const launch = running ?? (await store.startLaunch(profileId, { niche: held?.niche ?? null, intents: held?.intents ?? [] }))
  if (!launch) redirect(spotlightStepUrl('retry'))
  if (!running) await recordLaunchEvent(profileId, { type: 'launch_started', launchId: launch.id })
  await store.attachSpace(launch, choice.id)
  if (choice.spotlightLive && launch.steps.spotlight?.status !== 'published') {
    await store.markStepPublished(launch, 'spotlight', choice.slug)
    await recordLaunchEvent(profileId, { type: 'step_published', launchId: launch.id, step: 'spotlight' })
  }
  redirect(spotlightStepUrl())
}

/** Vera builds the draft from the person's own words (Spotlight, Space, profile, accepted sources) and saves it on the launch.
 *  Quotes only unless the polish switch is on; a field she cannot quote is left empty for them to fill in. Publishes nothing. */
export async function buildDraftAction(): Promise<ActionResult> {
  const who = await mine()
  if ('error' in who) return fail(who.error)
  return (await buildLaunchDraft(who.profileId, who.launch)) ? ok() : fail(RETRY)
}

const reviewUrl = (code: ReviewErrorCode) => `${REVIEW_HREF}?e=${code}`

/** The Review + Publish screen's one Publish button. Reads the edited draft back from the form, writes it to the
 *  Space's own records (publishReview), and lands on the overview with everything it ticked. Signed out goes to sign
 *  in; nothing is written without the signed-in owner and their own launch. */
export async function publishReviewFormAction(formData: FormData): Promise<void> {
  if (!launchSystemEnabled()) redirect('/')
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/launch/claim')
  const edits = parseReviewDraft(Object.fromEntries(formData.entries()))
  if ('error' in edits) redirect(reviewUrl(edits.error))
  const launch = await store.getActiveLaunch(profileId)
  if (!launch) redirect('/launch')
  const done = await publishReview(profileId, launch, edits)
  if ('error' in done) redirect(reviewUrl('retry'))
  redirect(PUBLISHED_HREF)
}

/** The "Skip for now" button on a photo item. A plain form post: it remembers the skip on the launch and lands back on
 *  the one launch page, where the photo stays on the list with an easy way to add one later. Never a gate. */
export async function skipPhotoFormAction(formData: FormData): Promise<void> {
  if (!launchSystemEnabled()) redirect('/')
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')
  const launch = await store.getActiveLaunch(profileId)
  if (launch) await store.skipPhotoItem(launch, String(formData.get('item') ?? ''))
  redirect('/launch')
}

/** Hiding Finish setup, call one. Nothing is hidden yet: the server stamps the ask. */
export async function askHideSetupAction(): Promise<ActionResult> {
  if (!launchSystemEnabled()) return fail(OFF)
  const profileId = await getMyProfileId()
  if (!profileId) return fail(SIGN_IN)
  return (await askHideSetup(profileId)) ? ok() : fail(RETRY)
}

/** Hiding Finish setup, call two: only counts when call one came in the last ten minutes. */
export async function confirmHideSetupAction(): Promise<ActionResult> {
  if (!launchSystemEnabled()) return fail(OFF)
  const profileId = await getMyProfileId()
  if (!profileId) return fail(SIGN_IN)
  return (await confirmHideSetup(profileId)) ? ok() : fail('Ask to hide it again first, then confirm.')
}

/** Bring the Finish setup reminder back. Called from Settings. */
export async function showSetupAction(): Promise<ActionResult> {
  if (!launchSystemEnabled()) return fail(OFF)
  const profileId = await getMyProfileId()
  if (!profileId) return fail(SIGN_IN)
  return (await showSetupAgain(profileId)) ? ok() : fail(RETRY)
}

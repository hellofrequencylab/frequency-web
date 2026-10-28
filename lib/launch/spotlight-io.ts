// STEP 1, THE SPOTLIGHT (VLS-07), the IO half. Makes the free Space behind the Spotlight (the same provisioning the
// create wizard runs), writes and publishes the Space Spotlight, and records the step. Server-only. Called by the
// step's own server action after it has checked the switch and the signed-in owner. The Space is read and its
// Spotlight node patched through lib/spaces/store.ts, the one module that already holds the service-role client for
// `spaces` (which has no update policy), so this file adds no RLS bypass of its own. Idempotent: a launch that already has its Space reuses it, so a second tap never makes a second.

import { revalidatePath } from 'next/cache'
import { createSpaceForLaunch } from '@/lib/spaces/provision'
import { getSpaceById, patchSpacePreferences } from '@/lib/spaces/store'
import { recordLaunchEvent } from './events'
import type { LaunchSnapshot } from './state'
import { handleFor, publishedSpotlightPreferences, type SpotlightAnswers } from './spotlight-step'
import { attachSpace, markStepPublished } from './store'

const HANDLE_TRIES = 4

/** Make the Space (or reuse this launch's), publish its Spotlight, and mark the step. The handle is the person's
 *  name; a taken one is retried with a suffix. Returns the Space's handle, or the line to show. */
export async function publishSpotlightStep(profileId: string, launch: LaunchSnapshot, answers: SpotlightAnswers): Promise<{ slug: string } | { error: string }> {
  let space = launch.spaceId ? await getSpaceById(launch.spaceId) : null

  if (!space) {
    let last = 'We could not make your Space. Try again.'
    for (let attempt = 0; attempt < HANDLE_TRIES && !space; attempt++) {
      const made = await createSpaceForLaunch({ type: 'business', name: answers.name, slug: handleFor(answers.name, attempt), niche: launch.niche, intents: launch.intents })
      if ('error' in made) {
        last = made.error
        if (!/already taken/i.test(made.error)) return { error: made.error }
        continue
      }
      space = await getSpaceById(made.spaceId)
      if (space) await attachSpace(launch, space.id)
    }
    if (!space) return { error: last }
  }

  const current = space.preferences && typeof space.preferences === 'object' && !Array.isArray(space.preferences) ? (space.preferences as Record<string, unknown>) : {}
  const { spotlight } = publishedSpotlightPreferences(current, answers)
  if (!(await patchSpacePreferences(space.id, { spotlight }))) return { error: 'We made your Space but could not publish the Spotlight. Try again.' }

  revalidatePath(`/spaces/${space.slug}/spotlight`)
  await markStepPublished(launch, 'spotlight', space.slug)
  await recordLaunchEvent(profileId, { type: 'step_published', launchId: launch.id, step: 'spotlight' })
  return { slug: space.slug }
}

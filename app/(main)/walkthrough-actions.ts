'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import {
  markWalkthroughSeen,
  dismissWalkthrough,
  completeWalkthrough,
} from '@/lib/walkthroughs/progress'

// Walkthroughs Phase B — thin member-facing actions. Each resolves the signed-in
// member via getMyProfileId() (so a member only ever writes THEIR OWN
// profiles.meta.walkthroughs) and delegates to the best-effort progress writers, then
// revalidates the feed so the next render re-runs selection with the new progress.

export async function seenWalkthroughAction(slug: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId || !slug) return
  await markWalkthroughSeen(profileId, slug)
  revalidatePath('/feed')
}

export async function dismissWalkthroughAction(slug: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId || !slug) return
  await dismissWalkthrough(profileId, slug)
  revalidatePath('/feed')
}

export async function completeWalkthroughAction(slug: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId || !slug) return
  await completeWalkthrough(profileId, slug)
  revalidatePath('/feed')
}

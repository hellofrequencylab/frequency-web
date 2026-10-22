'use server'

// MY CARD actions (LIVE-1282, ADR-1874). The one write this route adds: a Crew member with no card
// asks for one. It files the same pending badge_requests row a Space page's "Get a scannable badge"
// files (lib/devices/badges.ts), so the staff queue that writes cards sees it with no new table.
// badge_requests.space_id is NOT NULL today, so a Crew request is filed against the Frequency root
// Space. Getting a card is a Crew perk (owner ruling 2026-10-22): the tier is checked here, not only
// in the page, so a hand-driven call from a non-Crew member files nothing.

import { revalidatePath } from 'next/cache'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getMyProfileId } from '@/lib/auth'
import { fileBadgeRequest } from '@/lib/devices/badges'
import { isCrewMember, memberCardsEnabled } from '@/lib/member-cards/store'
import { loadRootSpaceId } from '@/lib/spaces/store'

export async function requestMemberCard(): Promise<ActionResult> {
  if (!memberCardsEnabled()) return fail('Member cards are not open yet.')
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to ask for a card.')
  if (!(await isCrewMember(profileId))) return fail('Member cards come with Crew.')
  const rootId = await loadRootSpaceId()
  if (!rootId) return fail('Could not send your request. Try again in a minute.')
  if (!(await fileBadgeRequest(rootId, profileId))) return fail('Could not send your request. Try again in a minute.')
  revalidatePath('/crew/card')
  return ok()
}

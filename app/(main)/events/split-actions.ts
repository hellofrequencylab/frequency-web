'use server'

// REVENUE SPLITS ON A CO-HOSTED EVENT (LIVE-767): the owner's two actions. Read the shares beside
// each accepted Collaborator, and replace the set. The rule (accepted Collaborators only, at most
// 95% together, every payee with payouts live) lives in lib/events/revenue-splits.ts; this file
// owns WHO may ask: the Event's home Space OWNER, re-proved on every call against the live row.
// A host or cohost who does not own the home Space sees nothing and writes nothing, because a
// share is that Space's money.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  listEventRevenueSplits,
  saveEventRevenueSplits,
  viewerOwnsEventHomeSpace,
  type EventRevenueSplitView,
} from '@/lib/events/revenue-splits-store'

/** The shares and the Collaborators they can go to. Empty for anyone but the home Space owner. */
export async function loadEventRevenueSplits(
  eventId: string,
): Promise<{ canSet: boolean; rows: EventRevenueSplitView[] }> {
  const profileId = await getMyProfileId()
  if (!profileId || !(await viewerOwnsEventHomeSpace(eventId, profileId))) return { canSet: false, rows: [] }
  return { canSet: true, rows: await listEventRevenueSplits(eventId) }
}

/** Replace the Event's shares. `percents` is whole percent per Collaborator Space; 0 removes. */
export async function setEventRevenueSplits(
  eventId: string,
  eventSlug: string,
  percents: { spaceId: string; percent: number }[],
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in.')
  if (!(await viewerOwnsEventHomeSpace(eventId, profileId))) {
    return fail('Only the owner of the Space hosting this event can set shares.')
  }
  const shares = percents.map((p) => ({
    spaceId: String(p.spaceId),
    bps: Number.isFinite(p.percent) ? Math.round(p.percent) * 100 : -1,
  }))
  const res = await saveEventRevenueSplits(eventId, shares, profileId)
  if ('error' in res) return fail(res.error)
  revalidatePath(`/events/${eventSlug}`)
  revalidatePath(`/events/${eventSlug}/manage`)
  return ok()
}

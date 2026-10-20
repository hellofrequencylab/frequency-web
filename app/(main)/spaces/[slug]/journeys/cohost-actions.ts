'use server'

// CO-HOSTING A JOURNEY (SCAN-840): the WRITES behind journey_plan_space_shares. A Journey lives in one home
// Space; its stewards invite a second Space to co-host, and that Space's stewards accept or decline. An
// accepted share lists the Journey on the co-host Space and credits it on the Journey page (necessary,
// never sufficient: the Journey's own visibility still applies, see lib/journeys/space-shares.ts).
// Mirrors app/(main)/events/share-actions.ts.
//
// AUTHZ: journey_plan_space_shares is service-role only, so these gates ARE the authority. Home side:
// a steward of the Journey's own Space. Co-host side: a steward of the invited Space. Transitions are
// status-guarded in the WHERE so a concurrent accept, decline or revoke cannot be clobbered by a stale
// read. An active row that already exists (the partial unique index, 23505) is idempotent success.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { listShareApproverIds } from '@/lib/events/event-share'
import { loadCoHostShare } from '@/lib/journeys/cohost-shares'
import { type ActionResult, ok, fail } from '@/lib/action-result'

function db() {
  return createAdminClient() as unknown as {
    from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

async function stewards(spaceId: string, profileId: string): Promise<boolean> {
  return (await listShareApproverIds(spaceId)).includes(profileId)
}

async function refresh(...spaceIds: Array<string | null>): Promise<void> {
  for (const id of spaceIds) {
    if (!id) continue
    const space = await getSpaceById(id)
    if (space) revalidatePath(`/spaces/${space.slug}/journeys`)
  }
}

/** The home Space's steward invites another Space, by its address (slug), to co-host one of its Journeys. */
export async function inviteJourneyCoHost(input: { planId: string; targetSlug: string }): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to invite a co-host.')

  const { data: plan } = await db().from('journey_plans').select('space_id, title').eq('id', input.planId).maybeSingle()
  const homeId = (plan as { space_id: string | null } | null)?.space_id ?? null
  if (!plan || !homeId || homeId === (await loadRootSpaceId())) return fail('Only a Space can co-host a Journey with another Space.')
  if (!(await stewards(homeId, profileId))) return fail('You do not manage the Space this Journey belongs to.')

  const slug = (input.targetSlug ?? '').trim().toLowerCase().replace(/^.*\/spaces\//, '').replace(/[/?#].*$/, '')
  if (!slug) return fail('Enter the address of the Space to invite.')
  const { data: target } = await db().from('spaces').select('id, status, visibility, name').eq('slug', slug).maybeSingle()
  const t = target as { id: string; status: string | null; visibility: string | null; name: string | null } | null
  if (!t || t.status !== 'active' || t.visibility === 'private') return fail('That Space could not be found. Check the address and try again.')
  if (t.id === homeId) return fail('This Journey already belongs to that Space.')

  const autoAccept = await stewards(t.id, profileId)
  const { error } = await db().from('journey_plan_space_shares').insert([
    {
      plan_id: input.planId,
      space_id: t.id,
      invited_by_space_id: homeId,
      requested_by: profileId,
      status: autoAccept ? 'accepted' : 'pending',
      ...(autoAccept ? { responded_at: new Date().toISOString(), responded_by: profileId } : {}),
    },
  ])
  if (error && error.code !== '23505') {
    console.error('[journey-cohost] insert failed', { code: error.code, message: error.message, planId: input.planId })
    return fail('Could not send the invite. Try again.')
  }
  await refresh(homeId, t.id)
  return ok()
}

async function respond(shareId: string, next: 'accepted' | 'declined'): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to respond to this invite.')
  const row = await loadCoHostShare(shareId)
  if (!row) return fail('That invite could not be found.')
  if (row.status !== 'pending') return fail('That invite has already been handled.')
  if (!(await stewards(row.space_id, profileId))) return fail('You do not manage the Space that was invited.')

  const { data: updated, error } = await db()
    .from('journey_plan_space_shares')
    .update({ status: next, responded_at: new Date().toISOString(), responded_by: profileId })
    .eq('id', shareId)
    .eq('status', 'pending')
    .select('id')
  if (error) return fail('Could not update the invite. Try again.')
  if (!updated || updated.length === 0) return fail('That invite has already been handled.')
  await refresh(row.space_id, row.homeSpaceId)
  return ok()
}

/** The invited Space's steward accepts: the Journey is listed on their Space and they are credited on its page. */
export async function acceptJourneyCoHost(shareId: string): Promise<ActionResult> {
  return respond(shareId, 'accepted')
}

/** The invited Space's steward declines. The pair can be invited again later. */
export async function declineJourneyCoHost(shareId: string): Promise<ActionResult> {
  return respond(shareId, 'declined')
}

/** Either side ends a live share (or cancels a pending invite). Terminal; frees a future re-invite. */
export async function revokeJourneyCoHost(shareId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage this co-host.')
  const row = await loadCoHostShare(shareId)
  if (!row) return fail('That co-host could not be found.')
  if (row.status !== 'pending' && row.status !== 'accepted') return fail('This co-host has already ended.')
  const [coHost, home] = await Promise.all([
    stewards(row.space_id, profileId),
    row.homeSpaceId ? stewards(row.homeSpaceId, profileId) : Promise.resolve(false),
  ])
  if (!coHost && !home) return fail('You cannot end this co-host.')

  const { error } = await db()
    .from('journey_plan_space_shares')
    .update({ status: 'revoked', responded_at: new Date().toISOString(), responded_by: profileId })
    .eq('id', shareId)
    .in('status', ['pending', 'accepted'])
  if (error) return fail('Could not end the co-host. Try again.')
  await refresh(row.space_id, row.homeSpaceId)
  return ok()
}

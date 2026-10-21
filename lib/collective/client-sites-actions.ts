'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { addSpaceMember } from '@/lib/spaces/membership'
import { spaceBirthConfig, finishSpaceBirth } from '@/lib/spaces/provision-core'
import { DEFAULT_SPACE_SKIN, isProvisionableType } from '@/lib/spaces/profile-config'
import { isSafeSlug } from '@/lib/theme/validate'
import { ok, fail, isError, type ActionResult } from '@/lib/action-result'
import { ownedSubscription } from './extra-space-billing'
import { isNetworkPlan } from './member-spaces'
import { clientSiteEntitlements } from './client-sites'
import { mintSpaceClaimToken } from '@/lib/spaces/claim'
import { syncClientSiteBilling, setClientSiteBadgeRemoval } from './client-site-billing'

// CREATE A CLIENT WEBSITE (ADR-1816). The Network's owner stands up a Business-level Space for one of their
// people. It is born the way a member-created Space is (the shared birth steps), owned by the Network's
// owner until the hand-off (a later step gives it to the member), linked through reseller_network_id, and
// added to the Network's bill in the same breath: if the bill cannot take it (no live Stripe price yet), the
// site is removed again, so nothing is ever stood up unpaid.

export async function createClientSite(networkId: string, input: { name: string; slug: string; type?: string }): Promise<ActionResult<{ slug: string }>> {
  const name = (input.name ?? '').trim()
  const slug = (input.slug ?? '').trim().toLowerCase()
  const type = (input.type ?? '').trim() || 'business'
  if (!name || name.length > 200) return fail('Give the site a name under 200 characters.')
  if (!isSafeSlug(slug)) return fail('Use a short handle with lowercase letters, numbers, and hyphens only.')
  if (!isProvisionableType(type)) return fail('Pick a Space type from the list.')
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to add a client site.')
  const owned = await ownedSubscription(networkId)
  if (!owned || !isNetworkPlan(owned.plan) || owned.ownerId !== profileId) return fail('Only the owner of a subscribed Network can add client sites.')

  const db = createAdminClient()
  const taken = await db.from('spaces').select('id').eq('slug', slug).maybeSingle()
  if (taken.error || taken.data) return fail('That handle is already taken. Try another.')
  const rootId = await loadRootSpaceId()
  const root = rootId ? await db.from('spaces').select('entity_id').eq('id', rootId).maybeSingle() : null
  const entityId = root?.data?.entity_id ?? null
  if (!entityId) return fail('Spaces are not ready yet. Try again in a moment.')

  const birth = await spaceBirthConfig(type)
  // Born archived so the bill does not count it until the row is complete; activated below.
  const inserted = await db.from('spaces').insert({
    slug, name, type, status: 'archived', entity_id: entityId, skin: DEFAULT_SPACE_SKIN, network_connected: false, visibility: 'private',
    plan: 'business', entitlements: clientSiteEntitlements(birth.entitlements), feature_roles: birth.featureRoles,
    mode_variant: birth.modeVariant, owner_profile_id: profileId, brand_name: name, reseller_network_id: networkId,
    ...(Object.keys(birth.preferences).length ? { preferences: birth.preferences } : {}),
  } as never).select('id').maybeSingle()
  const siteId = inserted.data?.id
  if (inserted.error || !siteId) return fail('Could not create the site. Try again.')

  await addSpaceMember({ spaceId: siteId, profileId, role: 'admin', status: 'active' })
  await finishSpaceBirth(siteId, type, birth)

  const activate = await db.from('spaces').update({ status: 'active' } as never).eq('id', siteId)
  const billed = activate.error ? fail('Could not create the site. Try again.') : await syncClientSiteBilling(networkId)
  if (isError(billed)) {
    // Never leave a site standing that the Network is not paying for.
    await db.from('space_members').delete().eq('space_id', siteId)
    const removed = await db.from('spaces').delete().eq('id', siteId)
    if (removed.error) await db.from('spaces').update({ status: 'archived' } as never).eq('id', siteId)
    return billed
  }
  const parent = await db.from('spaces').select('slug').eq('id', networkId).maybeSingle()
  if (parent.data?.slug) revalidatePath(`/spaces/${parent.data.slug}/settings/websites`)
  return ok({ slug })
}

/** Turn badge removal on or off for one client site (+$15 a month on the Network's bill). */
export async function toggleClientSiteBadge(networkId: string, siteId: string, on: boolean): Promise<ActionResult> {
  const result = await setClientSiteBadgeRemoval(networkId, siteId, on)
  if (isError(result)) return result
  const parent = await createAdminClient().from('spaces').select('slug').eq('id', networkId).maybeSingle()
  if (parent.data?.slug) revalidatePath(`/spaces/${parent.data.slug}/settings/websites`)
  return ok()
}

/** The link a Network owner sends the person who will own a client site. Opening it signs them in and makes them
 *  the site's owner (the same claim road a seeded Space uses); the site stays on the Network's bill and keeps
 *  its link to the Network. Owner-gated, and only for a live site of this Network the owner still holds. */
export async function getClientSiteHandoffLink(networkId: string, siteId: string): Promise<ActionResult<{ path: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to hand off a site.')
  const owned = await ownedSubscription(networkId)
  if (!owned || !isNetworkPlan(owned.plan) || owned.ownerId !== profileId) return fail('Only the owner of a subscribed Network can hand off a site.')
  const site = await createAdminClient().from('spaces').select('id, owner_profile_id')
    .eq('id', siteId).eq('reseller_network_id' as never, networkId).eq('status', 'active').maybeSingle()
  if (site.error || !site.data) return fail('We could not find that client site.')
  if (site.data.owner_profile_id !== profileId) return fail('That site already belongs to its owner.')
  const token = await mintSpaceClaimToken(siteId)
  if (!token) return fail('Could not make the link. Try again.')
  return ok({ path: `/spaces/claim/${token}` })
}

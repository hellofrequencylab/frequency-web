'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { loadSpaceDiscoveryConsent, writeSpaceDiscoveryConsent, loadSpaceCoachProfile } from '@/lib/spaces/private-state'
import { discoveryConsentActive, grantDiscoveryConsent, type SpaceDiscoveryConsent } from '@/lib/spaces/discovery-consent'
import { getSpaceProfileEvidence } from '@/lib/spaces/analytics'
import { observeSpaceDiscovery } from '@/lib/ai/discovery-observation-service'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { appOrigin } from '@/lib/sites/host'

async function editor(spaceId: string) {
  const actor = await getMyProfileId()
  if (!actor) return null
  const space = await getSpaceById(spaceId)
  if (!space || !(await getSpaceCapabilities(space, actor)).canEditProfile) return null
  return { actor, space }
}

/** This explicit choice never changes saved writing preferences or publishes anything. */
export async function setSpaceDiscoveryConsent(spaceId: string, enabled: boolean): Promise<ActionResult<SpaceDiscoveryConsent | null>> {
  const owner = await editor(spaceId)
  if (!owner) return fail('You do not have permission to change discovery coaching for this Space.')
  if (typeof enabled !== 'boolean') return fail('Choose whether to allow aggregate discovery coaching.')
  const stored = await loadSpaceDiscoveryConsent(spaceId)
  if (!stored.available) return fail('Discovery coaching setup is unavailable. Permission was not changed.')
  if (!enabled && !stored.consent) return ok(null)
  const consent = enabled ? grantDiscoveryConsent(owner.actor, randomUUID()) : { ...stored.consent!, revokedAt: new Date().toISOString() }
  if (!(await writeSpaceDiscoveryConsent(spaceId, consent))) return fail('Your permission could not be saved. Try again.')
  revalidatePath(`/spaces/${encodeURIComponent(owner.space.slug)}/settings/coach`)
  return ok(consent)
}

/** On-demand first-party aggregates only; no provider/API connection or retained observation store. */
export async function reviewSpaceDiscovery(spaceId: string, requestedGoal: unknown = 'attendance') {
  const goal = requestedGoal === 'bookings' || requestedGoal === 'return_visits' || requestedGoal === 'enquiries' ? requestedGoal : 'attendance'
  const owner = await editor(spaceId)
  if (!owner) return { status: 'unavailable' as const, reason: 'permission_denied' as const }
  let grantedId: string | null = null
  const outcome = await observeSpaceDiscovery(spaceId, {
    authorize: async (id) => {
      const fresh = await editor(id)
      return fresh ? { spaceId: id, actorProfileId: fresh.actor, canEditProfile: true } : null
    },
    resolveConsent: async (id, actor) => {
      const stored = await loadSpaceDiscoveryConsent(id)
      if (!stored.available || !discoveryConsentActive(stored.consent)) return null
      grantedId = stored.consent.id
      return { spaceId: id, actorProfileId: actor, consent: stored.consent }
    },
    resolvePages: async (id) => {
      const page = `${appOrigin()}/spaces/${encodeURIComponent(owner.space.slug)}`
      return { spaceId: id, primaryPageUrl: page, authorizedPageUrls: [page] }
    },
    readAggregates: async (id) => {
      const [evidence, context] = await Promise.all([getSpaceProfileEvidence(id, 30), loadSpaceCoachProfile(id)])
      return { spaceId: id, pageUrl: `${appOrigin()}/spaces/${encodeURIComponent(owner.space.slug)}`, evidence,
        owner: { audience: context.available ? context.profile.audience : '', voice: context.available ? context.profile.voice : '', goal } }
    },
  })
  // Permission or consent can change during IO. Never return observations from a revoked/replaced grant.
  if (!(await editor(spaceId))) return { status: 'unavailable' as const, reason: 'permission_denied' as const }
  const current = await loadSpaceDiscoveryConsent(spaceId)
  if (!current.available || !discoveryConsentActive(current.consent) || current.consent.id !== grantedId) return { status: 'unavailable' as const, reason: 'consent_required' as const }
  return outcome
}

import 'server-only'

import { validateDiscoveryObservation, type DiscoveryAccessScope } from './discovery-evidence'
import { normalizeSpaceProfileObservations, type DiscoveryImportResult } from './discovery-observations'
import { coachDiscovery, type DiscoveryOwnerContext, type DiscoveryCoachingResult } from './discovery-coach'
import type { ProfileCoachingEvidence } from './coaching-evidence'

/** Server-resolved dependencies only. Never deserialize these capabilities or consent from a request.
 * Implementations must resolve the current authenticated actor and permission afresh, not cache
 * a client role, historic permission, analytics consent, or AI-memory consent as discovery authority.
 * This module supplies no default reader/connector; adopting it requires a real consent source.
 */
export interface DiscoveryObservationDependencies {
  authorize: (spaceId: string) => Promise<{ spaceId: string; actorProfileId: string; canEditProfile: boolean } | null>
  resolveConsent: (spaceId: string, actorProfileId: string) => Promise<{ spaceId: string; actorProfileId: string; consent: DiscoveryAccessScope['consent'] } | null>
  resolvePages: (spaceId: string) => Promise<{ spaceId: string; primaryPageUrl: string; authorizedPageUrls: readonly string[] } | null>
  readAggregates: (spaceId: string) => Promise<{ spaceId: string; pageUrl: string; evidence: ProfileCoachingEvidence; owner: DiscoveryOwnerContext } | null>
}
export type DiscoveryObservationServiceResult =
  | { status: 'unavailable'; reason: 'permission_denied' | 'consent_required' | 'source_unavailable' | 'invalid_context' }
  | { status: 'completed'; coaching: DiscoveryCoachingResult; observationLimits: string[] }

function canonicalPage(raw: string): boolean {
  if (typeof raw !== 'string' || raw.length > 2048) return false
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.href === raw } catch { return false }
}

/** Orchestration boundary, not a connected feature. Permission -> purpose-specific consent ->
 * owned pages -> bounded aggregates -> validation -> deterministic coaching. No private reader runs
 * before both gates clear. An unavailable dependency never becomes a zero-performance claim.
 */
export async function observeSpaceDiscovery(
  spaceId: string,
  deps: DiscoveryObservationDependencies,
  now?: Date,
): Promise<DiscoveryObservationServiceResult> {
  const gateTime = now ?? new Date()
  if (typeof spaceId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(spaceId) || !Number.isFinite(gateTime.getTime())) return { status: 'unavailable', reason: 'invalid_context' }
  let actor: Awaited<ReturnType<DiscoveryObservationDependencies['authorize']>>
  try { actor = await deps.authorize(spaceId) } catch { return { status: 'unavailable', reason: 'permission_denied' } }
  if (!actor || actor.spaceId !== spaceId || !actor.actorProfileId || actor.canEditProfile !== true) return { status: 'unavailable', reason: 'permission_denied' }
  let grant: Awaited<ReturnType<DiscoveryObservationDependencies['resolveConsent']>>
  try { grant = await deps.resolveConsent(spaceId, actor.actorProfileId) } catch { return { status: 'unavailable', reason: 'consent_required' } }
  if (!grant || grant.spaceId !== spaceId || grant.actorProfileId !== actor.actorProfileId) return { status: 'unavailable', reason: 'consent_required' }
  const access: DiscoveryAccessScope = { spaceId, authorized: true, consent: grant.consent }
  // Validate the actual purpose/current consent through the authoritative validator. This is an
  // unavailable diagnostic, not a synthetic measurement; no evidence or sample is invented.
  const consentGate = validateDiscoveryObservation({ status: 'unavailable', provider: 'first_party_aggregate', metric: 'space_profile', reason: 'no_data', scope: { spaceId, consentId: grant.consent?.id }, retrievedAt: gateTime.toISOString() }, access, gateTime)
  if (consentGate.status !== 'unavailable' || consentGate.reason !== 'no_data') return { status: 'unavailable', reason: 'consent_required' }
  try {
    const pages = await deps.resolvePages(spaceId)
    if (!pages || pages.spaceId !== spaceId || !pages.authorizedPageUrls.length || pages.authorizedPageUrls.length > 200 || !pages.authorizedPageUrls.every(canonicalPage) || !pages.authorizedPageUrls.includes(pages.primaryPageUrl)) return { status: 'unavailable', reason: 'invalid_context' }
    const aggregate = await deps.readAggregates(spaceId)
    if (!aggregate || aggregate.spaceId !== spaceId || aggregate.pageUrl !== pages.primaryPageUrl) return { status: 'unavailable', reason: 'source_unavailable' }
    const evaluationTime = now ?? new Date()
    const normalized: DiscoveryImportResult = normalizeSpaceProfileObservations({
      access, spaceId, importId: 'space_profile_observation', authorizedPageUrls: pages.authorizedPageUrls,
      observedAt: aggregate.evidence.observedThrough, retrievedAt: evaluationTime.toISOString(),
      period: { from: aggregate.evidence.observedFrom, to: aggregate.evidence.observedThrough },
    }, aggregate, evaluationTime)
    if (normalized.error) return { status: 'unavailable', reason: 'invalid_context' }
    return { status: 'completed', coaching: coachDiscovery({ observations: normalized.observations, access, owner: aggregate.owner, now: evaluationTime }), observationLimits: normalized.limitations }
  } catch { return { status: 'unavailable', reason: 'source_unavailable' } }
}

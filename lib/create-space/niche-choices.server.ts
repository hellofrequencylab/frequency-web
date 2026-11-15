import 'server-only'
import { getFunnelConfig } from '@/lib/marketing/funnel-config'
import { NICHE_FUNNEL_DESTINATIONS } from '@/lib/funnels/definitions'
import { buildNicheChoices, resolveNicheSeed } from './niche-choices'

/** Server boundary: marketing/pricing stays here; only these nine plain choices reach the client. */
export function getOnboardingNicheChoices() {
  return buildNicheChoices(getFunnelConfig, NICHE_FUNNEL_DESTINATIONS)
}

/** Re-derive a canonical seed on the server rather than trusting a client-supplied choice object. */
export function resolveOnboardingNicheSeed(rawNiche: unknown, explicitMode?: unknown) {
  return resolveNicheSeed(getOnboardingNicheChoices(), rawNiche, explicitMode)
}

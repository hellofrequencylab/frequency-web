import { planKeysWithAddons } from '@/lib/pricing/plans'
import { BADGE_REMOVAL_ENTITLEMENT } from '@/lib/sites/site-badge'

// A NETWORK'S CLIENT WEBSITES (ADR-1816), the pure half. A client site is a Business-level Space the Network
// resells and pays for per site: it is NOT a chapter (parent_id stays null, no shared membership), it points
// at its Network through spaces.reseller_network_id, and the wholesale price includes the custom domain. The
// IO half is client-sites-store.ts (reads) and client-sites-actions.ts (create); billing is
// client-site-billing.ts.

/** The entitlements a client site opens with: the operator's per-type tool defaults, with the Business depth
 *  and the custom domain switched on (the wholesale price includes the domain). Badge removal is NOT here: it
 *  is sold per site and granted by billing. PURE. */
export function clientSiteEntitlements(birth: Record<string, boolean>): Record<string, boolean> {
  const granted: Record<string, boolean> = {}
  for (const key of planKeysWithAddons('business', ['custom_domain'])) granted[key] = true
  const out = { ...birth, ...granted }
  delete out[BADGE_REMOVAL_ENTITLEMENT]
  return out
}

export interface ClientSiteRow {
  id: string
  slug: string
  name: string
  domain: string | null
  published: boolean
  badgeFree: boolean
  ownerProfileId: string | null
}

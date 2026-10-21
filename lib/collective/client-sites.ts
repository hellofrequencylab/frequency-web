import { NETWORK_SITE_PLAN, planKeysWithAddons } from '@/lib/pricing/plans'
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
  domainState: ClientSiteDomainState
}

/** Where a client site's own domain stands. `none`: it runs on its free address. `live`: the domain resolves to
 *  the site. `pending`: a domain is saved but does not reach the site yet (DNS still to point). PURE. */
type ClientSiteDomainState = 'none' | 'live' | 'pending'

export function clientSiteDomainState(domain: string | null, resolvesToSite: boolean): ClientSiteDomainState {
  if (!domain) return 'none'
  return resolvesToSite ? 'live' : 'pending'
}

interface BillLine { label: string; count: number; unitCents: number; totalCents: number }

/** The Network's monthly bill for its client sites, line by line (the same ladder billing charges). PURE. */
export function clientSiteBillLines(sites: number, unbranded: number): BillLine[] {
  const n = Number.isFinite(sites) && sites > 0 ? Math.floor(sites) : 0
  const [first, second, third] = NETWORK_SITE_PLAN.tiers
  const counts = [Math.min(n, first.upTo), Math.min(Math.max(n - first.upTo, 0), second.upTo - first.upTo), Math.max(n - second.upTo, 0)]
  const labels = [`Sites 1 to ${first.upTo}`, `Sites ${first.upTo + 1} to ${second.upTo}`, `Sites ${second.upTo + 1} and up`]
  const lines: BillLine[] = [first, second, third].map((tier, i) => ({ label: labels[i], count: counts[i], unitCents: tier.cents, totalCents: counts[i] * tier.cents }))
  const free = Number.isFinite(unbranded) && unbranded > 0 ? Math.min(Math.floor(unbranded), n) : 0
  lines.push({ label: 'Badge removal', count: free, unitCents: NETWORK_SITE_PLAN.badgeRemovalCents, totalCents: free * NETWORK_SITE_PLAN.badgeRemovalCents })
  return lines.filter((l) => l.count > 0)
}

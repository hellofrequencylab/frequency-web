// Public-safe setup metadata only. A candidate is not a live domain or ownership grant.
import { parseSiteDomain } from './domain'
import type { DomainStatus } from './vercel-domains'

export const SITE_DOMAIN_SETUP_KEY = 'siteDomainSetup'
export function readSiteDomainCandidate(preferences: unknown): string | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null
  const setup = (preferences as Record<string, unknown>)[SITE_DOMAIN_SETUP_KEY]
  if (!setup || typeof setup !== 'object' || Array.isArray(setup)) return null
  const value = (setup as Record<string, unknown>).domain
  if (typeof value !== 'string') return null
  const parsed = parseSiteDomain(value)
  return parsed.ok && parsed.domain === value ? value : null
}
export function siteDomainReady(status: DomainStatus): boolean {
  return !status.unchecked && status.attached && status.verified && status.dnsReady && status.secure
}

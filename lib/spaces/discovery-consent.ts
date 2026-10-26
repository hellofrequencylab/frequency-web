/** Private purpose-specific permission. No analytics/AI-memory preference implies this grant. */
export interface SpaceDiscoveryConsent {
  version: 1
  id: string
  purpose: 'discovery_coaching'
  grantedBy: string
  grantedAt: string
  expiresAt: string
  revokedAt: string | null
}
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value))
const token = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value)
export function parseDiscoveryConsent(raw: unknown): SpaceDiscoveryConsent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (Object.keys(value).some(key => !['version', 'id', 'purpose', 'grantedBy', 'grantedAt', 'expiresAt', 'revokedAt'].includes(key)) || value.version !== 1 || value.purpose !== 'discovery_coaching' || !token(value.id) || !token(value.grantedBy) || !instant(value.grantedAt) || !instant(value.expiresAt) || (value.revokedAt !== null && !instant(value.revokedAt)) || Date.parse(value.expiresAt) <= Date.parse(value.grantedAt) || Date.parse(value.expiresAt) - Date.parse(value.grantedAt) > 90 * 86_400_000 || (value.revokedAt !== null && Date.parse(value.revokedAt) < Date.parse(value.grantedAt))) return null
  return value as unknown as SpaceDiscoveryConsent
}
export function discoveryConsentActive(value: SpaceDiscoveryConsent | null, now = new Date()): value is SpaceDiscoveryConsent {
  return !!value && Number.isFinite(now.getTime()) && Date.parse(value.grantedAt) <= now.getTime() && Date.parse(value.expiresAt) > now.getTime() && value.revokedAt === null
}
/** Server chooses identity and clock. Re-enabling always creates a fresh grant, never resurrects an old ID. */
export function grantDiscoveryConsent(actorId: string, id: string, now = new Date()): SpaceDiscoveryConsent {
  if (!token(actorId) || !token(id) || !Number.isFinite(now.getTime())) throw new Error('Invalid discovery consent context')
  return { version: 1, id, purpose: 'discovery_coaching', grantedBy: actorId, grantedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 90 * 86_400_000).toISOString(), revokedAt: null }
}

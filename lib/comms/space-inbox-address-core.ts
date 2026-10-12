// SPACE INBOX ADDRESS, the pure half (EMAIL-022, owner ruling 2026-10-12: "Every account: if they message
// through Frequency they can have a reply address at their Space, like hello@<slug>.frequencylocal.com.
// If they have premium, they can use their own email (own domain)").
//
// Every Space, on every plan, gets ONE public address: `hello@<slug>.<root>`, where <root> is the
// SPACE_EMAIL_INBOX_ROOT zone the platform runs DNS for. The local part is fixed. This module holds the
// shapes and rules with no IO so the backlog probe can run them: the address and domain builders, the
// recipient matcher the inbound webhook routes on, the provider-record to zone-record mapper, and the
// state the provider's verification maps to. The IO (Resend, Vercel DNS, the row) is in
// space-inbox-address.ts.

import { formatDisplayName } from './from-address'

export const SPACE_INBOX_LOCAL_PART = 'hello'

export type SpaceInboxState = 'pending' | 'verified' | 'failed' | 'paused'

const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const DOMAIN = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/

/** The root zone, lowercased, or null when it is not a plain registrable domain. */
export function normalizeInboxRoot(raw: string | null | undefined): string | null {
  const root = raw?.trim().toLowerCase() ?? ''
  return DOMAIN.test(root) ? root : null
}

/** `<slug>.<root>`, or null when the slug cannot be a DNS label (a Space slug normally can). */
export function spaceInboxDomain(slug: string, root: string): string | null {
  const label = slug.trim().toLowerCase()
  if (!LABEL.test(label) || label.length > 63) return null
  const normalizedRoot = normalizeInboxRoot(root)
  return normalizedRoot ? `${label}.${normalizedRoot}` : null
}

export function spaceInboxAddress(domain: string, localPart = SPACE_INBOX_LOCAL_PART): string {
  return `${localPart}@${domain}`
}

/** The From line a verified address sends as: `"Brand" <hello@slug.root>`. Null when the brand name is
 *  empty after cleaning, so a bare address never goes out with an empty display name. */
export function spaceInboxFromLine(brandName: string, address: string): string | null {
  const name = formatDisplayName(brandName)
  return name ? `${name} <${address}>` : null
}

export type InboxRecipientMatch =
  | { kind: 'none' }
  | { kind: 'ambiguous' }
  | { kind: 'match'; domain: string; localPart: string; address: string }

/** Pick the one Space inbox address among a message's recipients. Only `<local>@<label>.<root>` counts:
 *  a deeper host, the root itself, or two different Space addresses in one message do not route. */
export function matchSpaceInboxRecipient(recipients: string[], root: string | null): InboxRecipientMatch {
  const zone = normalizeInboxRoot(root)
  if (!zone) return { kind: 'none' }
  const seen = new Set<string>()
  const hits: { domain: string; localPart: string; address: string }[] = []
  for (const raw of recipients) {
    const bare = raw.trim().toLowerCase().replace(/^.*<([^<>]+)>$/, '$1')
    if (seen.has(bare)) continue
    seen.add(bare)
    const at = bare.lastIndexOf('@')
    if (at <= 0) continue
    const localPart = bare.slice(0, at)
    const domain = bare.slice(at + 1)
    if (!domain.endsWith(`.${zone}`)) continue
    const label = domain.slice(0, -(zone.length + 1))
    if (!LABEL.test(label) || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(localPart)) continue
    hits.push({ domain, localPart, address: bare })
  }
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length > 1) return { kind: 'ambiguous' }
  return { kind: 'match', ...hits[0] }
}

/** A provider DNS record as Resend returns it (names relative to the domain, or already fully qualified). */
export interface ProviderDnsRecord {
  record?: string
  type: string
  name: string
  value: string
  priority?: number
  ttl?: string
  status?: string
}

/** A record as the zone host takes it: name relative to the ROOT zone. */
export interface ZoneRecord {
  type: 'MX' | 'TXT' | 'CNAME'
  name: string
  value: string
  mxPriority?: number
  record?: string
}

/** Resend names records relative to the domain it verified (`send`, `resend._domainkey`, `@`), and the
 *  zone wants them relative to the root. `send` on `slug.root` becomes `send.slug` in the `root` zone. */
export function providerRecordsToZoneRecords(domain: string, root: string, records: ProviderDnsRecord[]): ZoneRecord[] {
  const out: ZoneRecord[] = []
  for (const r of records) {
    const type = r.type.toUpperCase()
    if (type !== 'MX' && type !== 'TXT' && type !== 'CNAME') continue
    const rel = r.name.trim().toLowerCase()
    const host = rel === '' || rel === '@' ? domain : rel === domain || rel.endsWith(`.${domain}`) ? rel : `${rel}.${domain}`
    const name = host === root ? '@' : host.endsWith(`.${root}`) ? host.slice(0, -(root.length + 1)) : host
    const zone: ZoneRecord = { type, name, value: r.value.replace(/\.$/, '') }
    if (type === 'MX') zone.mxPriority = r.priority ?? 10
    if (r.record) zone.record = r.record
    out.push(zone)
  }
  return out
}

/** What the provider's verification says the address is. Verified only when the domain is verified AND
 *  both capabilities are on: a sending-only domain cannot receive the replies the address exists for. */
export function inboxStateFromProvider(provider: {
  status: string
  capabilities?: { sending?: string; receiving?: string } | null
}): SpaceInboxState {
  const caps = provider.capabilities ?? {}
  if (provider.status === 'verified' && caps.sending === 'enabled' && caps.receiving === 'enabled') return 'verified'
  if (provider.status === 'failed' || provider.status === 'partially_failed') return 'failed'
  return 'pending'
}

/** The three words the Settings card shows. */
export function inboxStateLabel(state: SpaceInboxState | null): 'Not set up' | 'Setting up' | 'Ready' | 'Needs attention' {
  if (state === 'verified') return 'Ready'
  if (state === 'failed' || state === 'paused') return 'Needs attention'
  if (state === 'pending') return 'Setting up'
  return 'Not set up'
}

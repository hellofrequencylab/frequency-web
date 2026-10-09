import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { formatDisplayName } from '@/lib/comms/from-address'
import { spaceHasEntitlement } from './entitlements'
import { asSpacePlan, SPACE_EMAIL_CUSTOM_IDENTITY_KEY } from '@/lib/pricing/plans'
import { spaceEmailIdentityPolicy, type EmailIdentityPolicySpace } from './email-identity-policy'
import { retrieveEmailDomainVerification } from './email-domain-provider'

// Scoped cast until integration generates the additive registry's database types.
type Query = {
  select(columns: string): Query; eq(column: string, value: unknown): Query
  insert(values: Record<string, unknown>): Query; update(values: Record<string, unknown>): Query
  single(): Promise<{ data: Record<string, unknown> | null; error: unknown }>
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>
}
const table = (name: string) => (createAdminClient() as unknown as { from(name: string): Query }).from(name)
async function readSpace(id: string) {
  const { data, error } = await table('spaces').select('id, plan, entitlements, owner_profile_id, domain').eq('id', id).maybeSingle()
  if (error || !data) throw new Error('Space email settings are unavailable.')
  return data as unknown as EmailIdentityPolicySpace & { owner_profile_id: string; domain: string | null }
}
async function requireOwner(spaceId: string, requirePaid = true) {
  const profileId = await getMyProfileId()
  const space = await readSpace(spaceId)
  if (!profileId || space.owner_profile_id !== profileId) throw new Error('Only the Space owner can manage email identities.')
  if (requirePaid && (asSpacePlan(space.plan) === 'free' || !spaceHasEntitlement(space, SPACE_EMAIL_CUSTOM_IDENTITY_KEY)))
    throw new Error('Custom email identity requires a paid Space capability.')
  return space
}

/** Attach an existing provider domain only after direct provider confirmation. Provisioning is separate. */
export async function registerSpaceEmailDomain(spaceId: string, domain: string, providerId: string) {
  const space = await requireOwner(spaceId)
  const normalized = domain.toLowerCase().trim()
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(normalized) || normalized.length > 253)
    throw new Error('Enter a valid email domain.')
  // Initial registry accepts only the domain already assigned to this Space or its subdomains.
  const owned = space.domain?.toLowerCase()
  if (!owned || (normalized !== owned && !normalized.endsWith(`.${owned}`)))
    throw new Error('Connect this domain to the Space before registering its email identity.')
  const verified = await retrieveEmailDomainVerification(providerId, normalized)
  const { data, error } = await table('space_email_domains').insert({ space_id: spaceId, domain: normalized,
    provider_domain_id: providerId, sending_verified: verified.sendingVerified, last_verified_at: new Date().toISOString() }).select('id').single()
  if (error || !data) throw new Error('Could not register the email domain.')
  return String(data.id)
}

export async function createSpaceEmailIdentity(spaceId: string, domainId: string, localPart: string, displayName: string) {
  await requireOwner(spaceId)
  const { data: domain, error: domainError } = await table('space_email_domains').select('id').eq('id', domainId).eq('space_id', spaceId).maybeSingle()
  if (domainError || !domain) throw new Error('Email domain does not belong to this Space.')
  if (!/^[a-z0-9][a-z0-9._+-]{0,63}$/.test(localPart) || !displayName.trim() || displayName.length > 78 || /[\x00-\x1f\x7f<>]/.test(displayName))
    throw new Error('Enter a valid sender address and name.')
  const { data, error } = await table('space_email_identities').insert({ space_id: spaceId, domain_id: domainId,
    local_part: localPart, display_name: displayName.trim() }).select('id').single()
  if (error || !data) throw new Error('Could not create the email identity.')
  return String(data.id)
}

/** Resolve fresh Space policy plus provider verification at the actual custom-send boundary. */
export async function resolveSpaceEmailIdentity(spaceId: string, identityId: string) {
  const space = await readSpace(spaceId)
  const { data: identity, error } = await table('space_email_identities').select('*').eq('id', identityId).eq('space_id', spaceId).maybeSingle()
  if (error || !identity) throw new Error('Email identity is unavailable.')
  const { data: domain, error: domainError } = await table('space_email_domains').select('*').eq('id', identity.domain_id).eq('space_id', spaceId).maybeSingle()
  if (domainError || !domain) throw new Error('Email domain is unavailable.')
  // Never trust a queued verified flag or indefinitely cached registry state.
  const verified = await retrieveEmailDomainVerification(String(domain.provider_domain_id), String(domain.domain))
  const decision = spaceEmailIdentityPolicy(space, { kind: 'space', identityId }, {
    id: String(identity.id), spaceId, sendingVerified: verified.sendingVerified,
    paused: !!identity.paused_at || !!domain.paused_at,
  })
  if (!decision.allowed) throw new Error(`Email identity held: ${decision.reason}`)
  return { identityId, from: `${formatDisplayName(String(identity.display_name))} <${identity.local_part}@${domain.domain}>` }
}

/** Revocation is available after downgrade; it never deletes old inbound ownership. */
export async function pauseSpaceEmailIdentity(spaceId: string, identityId: string) {
  await requireOwner(spaceId, false)
  const { data, error } = await table('space_email_identities').update({ paused_at: new Date().toISOString() })
    .eq('id', identityId).eq('space_id', spaceId).select('id').maybeSingle()
  if (error || !data) throw new Error('Could not pause the email identity.')
}

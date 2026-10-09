/** Internal provenance, never authorization. Workers must resolve current tenant policy independently. */
export interface EmailDeliveryContextV1 {
  version: 1
  logicalSendKey: string
  recipientKey: string
  spaceId: string | null
  purpose: 'platform-security' | 'operational' | 'marketing' | 'human-reply' | 'notification'
  topic: string | null
  identity: { kind: 'frequency' | 'space'; identityId: string | null; revision: string | null }
  source: { kind: 'platform' | 'campaign' | 'conversation' | 'automation' | 'dm'; id: string | null }
}

function nullableString(value: unknown): boolean {
  return value === null || (typeof value === 'string' && value.trim().length > 0)
}

/** Legacy jobs may lack context. A claimed context must validate; never silently downgrade bad v1. */
export function readEmailDeliveryContext(value: unknown): EmailDeliveryContextV1 | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid email delivery context')
  const p = value as Record<string, unknown>
  const identity = p.identity as Record<string, unknown> | undefined
  const source = p.source as Record<string, unknown> | undefined
  if (p.version !== 1 || typeof p.logicalSendKey !== 'string' || !p.logicalSendKey.trim()
    || typeof p.recipientKey !== 'string' || !p.recipientKey.trim()
    || !nullableString(p.spaceId) || !nullableString(p.topic)
    || typeof p.purpose !== 'string' || !['platform-security', 'operational', 'marketing', 'human-reply', 'notification'].includes(p.purpose)
    || !identity || typeof identity.kind !== 'string' || !['frequency', 'space'].includes(identity.kind)
    || !nullableString(identity.identityId) || !nullableString(identity.revision)
    || !source || typeof source.kind !== 'string' || !['platform', 'campaign', 'conversation', 'automation', 'dm'].includes(source.kind)
    || !nullableString(source.id)) throw new Error('Invalid email delivery context v1')
  if (identity.kind === 'space' && (!p.spaceId || !identity.identityId || !identity.revision)) {
    throw new Error('Space email identity requires tenant, identity and revision')
  }
  if (identity.kind === 'frequency' && (identity.identityId !== null || identity.revision !== null)) {
    throw new Error('Frequency email identity cannot reference a Space identity')
  }
  if (p.purpose === 'platform-security' && (p.spaceId !== null || identity.kind !== 'frequency' || source.kind !== 'platform')) {
    throw new Error('Account security email requires Frequency platform identity')
  }
  // Whitelist fields so transport serialization never propagates unknown metadata or user content.
  return {
    version: 1, logicalSendKey: p.logicalSendKey, recipientKey: p.recipientKey,
    spaceId: p.spaceId as string | null, purpose: p.purpose as EmailDeliveryContextV1['purpose'],
    topic: p.topic as string | null,
    identity: { kind: identity.kind as 'frequency' | 'space', identityId: identity.identityId as string | null, revision: identity.revision as string | null },
    source: { kind: source.kind as EmailDeliveryContextV1['source']['kind'], id: source.id as string | null },
  }
}

// Consent scopes (ADR-069 Phase 5b). The catalog of things a member can opt into —
// declared up front (registry pattern). `defaultGranted` is the state before the
// member has ever recorded a choice: opt-OUT defaults (true) for product-essential
// telemetry tied to their own account, opt-IN defaults (false) for outbound marketing.

export type ConsentScope = 'email_lifecycle' | 'email_marketing' | 'ai_memory' | 'analytics'

export interface ConsentScopeDef {
  key: ConsentScope
  label: string
  description: string
  defaultGranted: boolean
}

export const CONSENT_SCOPES: readonly ConsentScopeDef[] = [
  {
    key: 'email_lifecycle',
    label: 'Lifecycle email',
    description: 'Helpful nudges about your circles, practices, and events.',
    defaultGranted: true,
  },
  {
    key: 'email_marketing',
    label: 'Marketing email',
    description: 'Occasional news, offers, and early-access invites.',
    defaultGranted: false, // opt-in
  },
  {
    key: 'ai_memory',
    label: 'Vera’s memory',
    description: 'Let Vera remember what you share so she can help you better.',
    defaultGranted: true,
  },
  {
    key: 'analytics',
    label: 'Product analytics',
    description: 'First-party usage data tied to your account, used to improve the product.',
    defaultGranted: true,
  },
] as const

const BY_KEY = new Map<string, ConsentScopeDef>(CONSENT_SCOPES.map((s) => [s.key, s]))

export function getConsentScope(key: string): ConsentScopeDef | undefined {
  return BY_KEY.get(key)
}

export function defaultGranted(scope: string): boolean {
  return BY_KEY.get(scope)?.defaultGranted ?? false
}

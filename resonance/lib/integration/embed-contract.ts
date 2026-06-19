/**
 * The embed seam: the public contract between a host app (Frequency first, then
 * Hook customers, then the open web) and an embedded world. See docs/INTEGRATION.md.
 *
 * Types ONLY. No implementation here. Honoring this contract is what lets the
 * SAME build serve a standalone destination and an embedded module.
 */

/**
 * Identity is federated. The host signs a JWT; we verify it. We store the
 * subject as a plain uuid with NO foreign key into the host's tables (ADR-002),
 * so a world is portable and changing hosts is a token-issuer swap, not a
 * migration.
 */
export interface HostIdentityClaims {
  /** External user id (uuid). Stored verbatim, never FK'd. */
  sub: string;
  /** Tenant: which world this user belongs to. */
  worldId: string;
  displayName?: string;
  avatarUrl?: string;
  /** Host-granted capabilities (e.g. premium, moderator). */
  entitlements?: string[];
  iat: number;
  exp: number;
}

/** postMessage bridge: events emitted by the world OUT to the host. */
export type WorldOutboundEvent =
  | { type: "world:ready" }
  | { type: "zaps:awarded"; userId: string; delta: number; reason: string; refId?: string }
  | { type: "rank:changed"; userId: string; rank: string; seasonId: string }
  | { type: "event:attended"; userId: string; eventId: string };

/** postMessage bridge: events pushed by the host IN to the world. */
export type HostInboundEvent =
  | { type: "user:identity"; token: string }
  | { type: "theme"; tokens: Record<string, string> }
  | { type: "entitlements"; userId: string; entitlements: string[] };

/**
 * Server-to-server mirror. The host economy (Frequency's Zaps + The Field) must
 * stay in sync even when the iframe is closed, so gamification events are also
 * delivered as signed, retried webhooks. Same shape as the outbound events.
 */
export type WebhookEvent = Exclude<WorldOutboundEvent, { type: "world:ready" }>;

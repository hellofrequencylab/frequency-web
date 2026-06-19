// Anthropic client + the immediate kill switch. Mirrors the guarded pattern in
// lib/studio/winback.ts: no key ⇒ no client, and every caller must degrade to a
// deterministic fallback (the product never depends on AI being up).
//
// This is the ENV-level switch (key presence + AI_DISABLED). The DB-backed
// platform_flags.ai_enabled switch — flippable by an operator without a deploy —
// lands with the usage-ledger migration and layers on top of this.
//
// GATEWAY SEAM (ENTITY-SPACES-BUILD §B.7, Epic 0.5b/0.5.6, ADR-318): every AI call
// in the app funnels through getAnthropic() → completeText/completeRaw/runToolLoop.
// That single chokepoint is what makes the provider a one-line swap. When
// AI_GATEWAY_URL is set we point the Anthropic SDK at a model-agnostic gateway
// (Vercel AI Gateway: an Anthropic-compatible /v1/messages exit, zero markup) by
// overriding baseURL/auth on the SAME SDK — no call-site changes, identical request
// shapes. Default (flag unset) is the direct Anthropic path, byte-for-byte as today.

import Anthropic from '@anthropic-ai/sdk'

let cached: Anthropic | null | undefined

/**
 * Gateway config, read once from the env. The flag is AI_GATEWAY_URL:
 *  - unset  ⇒ direct Anthropic (default; current behavior, no change).
 *  - set    ⇒ route the SDK through the gateway baseURL. The gateway speaks the
 *             Anthropic Messages API, so the SDK, models registry, and every call
 *             shape stay identical; only the transport (host + auth header) swaps.
 *
 * AI_GATEWAY_API_KEY (optional) authenticates to the gateway; when omitted we reuse
 * ANTHROPIC_API_KEY so an existing key keeps working through the gateway.
 */
interface GatewayConfig {
  baseURL: string
  apiKey: string
}

function resolveGateway(): GatewayConfig | null {
  const baseURL = process.env.AI_GATEWAY_URL?.trim()
  if (!baseURL) return null
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  return { baseURL, apiKey }
}

/** The shared Anthropic client, or null when no API key is configured.
 *  Routed through the model-agnostic gateway when AI_GATEWAY_URL is set,
 *  otherwise the direct Anthropic path (the default). */
export function getAnthropic(): Anthropic | null {
  if (cached !== undefined) return cached

  const gateway = resolveGateway()
  if (gateway) {
    // Same SDK, gateway transport. baseURL + key are the only difference, so every
    // existing messages.create call routes through the gateway unchanged.
    cached = new Anthropic({ apiKey: gateway.apiKey, baseURL: gateway.baseURL })
    return cached
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  cached = apiKey ? new Anthropic({ apiKey }) : null
  return cached
}

/** Is AI usable right now? (a client is configured and not env-disabled). True when
 *  either the direct Anthropic key or the gateway is configured. */
export function aiEnabled(): boolean {
  if (process.env.AI_DISABLED === '1') return false
  return !!process.env.ANTHROPIC_API_KEY || !!resolveGateway()
}

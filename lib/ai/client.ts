// Anthropic client + the immediate kill switch. Mirrors the guarded pattern in
// lib/studio/winback.ts: no key ⇒ no client, and every caller must degrade to a
// deterministic fallback (the product never depends on AI being up).
//
// This is the ENV-level switch (key presence + AI_DISABLED). The DB-backed
// platform_flags.ai_enabled switch — flippable by an operator without a deploy —
// lands with the usage-ledger migration and layers on top of this.

import Anthropic from '@anthropic-ai/sdk'

let cached: Anthropic | null | undefined

/** The shared Anthropic client, or null when no API key is configured. */
export function getAnthropic(): Anthropic | null {
  if (cached !== undefined) return cached
  const apiKey = process.env.ANTHROPIC_API_KEY
  cached = apiKey ? new Anthropic({ apiKey }) : null
  return cached
}

/** Is AI usable right now? (key present and not env-disabled). */
export function aiEnabled(): boolean {
  return process.env.AI_DISABLED !== '1' && !!process.env.ANTHROPIC_API_KEY
}

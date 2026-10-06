import 'server-only'
import { cache } from 'react'
import { getPlatformSetting, setPlatformSetting } from '@/lib/platform-flags'
import { type GenerationId, DEFAULT_GENERATION, isGenerationId } from '../generations'

// THE COMMUNITY DEFAULT GENERATION (LIVE-658). The third rung of the generation precedence in
// ./resolve.ts (member cookie, then the Space's `spaces.generation`, then THIS), and the one an
// operator now changes in Theme Studio instead of a code deploy. Stored as one row in the existing
// `platform_settings` key/text store, the same home as the other operator knobs, so no migration.
//
// NO SEED ROW, on purpose (the series-config rule): an absent row means DEFAULT_GENERATION in code,
// so changing the code default is never silently beaten by a stale row in production. Clearing the
// choice deletes nothing; it writes '' and the reader falls back.

export const DEFAULT_GENERATION_KEY = 'theme_default_generation'

/** The stored id when it is a registered generation, else null. PURE. */
export function coerceStoredGeneration(raw: string | null | undefined): GenerationId | null {
  const v = (raw ?? '').trim()
  return v && isGenerationId(v) ? v : null
}

/** The community default. Cached per request. FAIL-SAFE: any miss or error is the code default. */
export const communityDefaultGeneration = cache(async (): Promise<GenerationId> => {
  try {
    return coerceStoredGeneration(await getPlatformSetting(DEFAULT_GENERATION_KEY, '')) ?? DEFAULT_GENERATION
  } catch {
    return DEFAULT_GENERATION
  }
})

/** Persist it (janitor-gated callers only). Returns what landed. */
export async function setCommunityDefaultGeneration(id: string, changedBy?: string | null): Promise<GenerationId> {
  const next = coerceStoredGeneration(id) ?? DEFAULT_GENERATION
  await setPlatformSetting(DEFAULT_GENERATION_KEY, next, changedBy ?? null)
  return next
}

// Legacy reframe compatibility returns no generated copy.
// Writing guidance is separate from the verified draft and cannot mutate it.
import { writingCoach } from '@/lib/ai/writing-coach'
import type { BusinessProfile } from '../schema'
import type { SeedMood } from '../moods'
import type { VoiceVerdict } from './voice-check'
import type { ReframedCopy } from './apply'


/** The result of a reframe run: the raw voiced copy the model returned + the per-field voice verdict
 *  + the USD spent. Null when AI is unavailable (the pipeline then keeps the verified draft as-is). */
export interface ReframeRunResult {
  copy: ReframedCopy
  /** The §10 checklist verdict on the FINAL copy (after at most one regeneration). Non-ok = flag amber. */
  voice: VoiceVerdict
  costUsd: number
}

/** Coerce the model's raw save_reframed_copy output into a clean ReframedCopy. Drops non-strings,
 *  trims, and keeps only well-formed offering-blurb entries. PURE + total. */
export function coerceReframe(raw: unknown): ReframedCopy {
  const o = (raw ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined
    const t = v.trim()
    return t ? t : undefined
  }
  const out: ReframedCopy = {}
  const tagline = str(o.tagline)
  const about = str(o.about)
  const story = str(o.story)
  if (tagline) out.tagline = tagline
  if (about) out.about = about
  if (story) out.story = story
  if (Array.isArray(o.offeringBlurbs)) {
    const blurbs: { index: number; blurb: string }[] = []
    for (const e of o.offeringBlurbs) {
      if (!e || typeof e !== 'object') continue
      const index = (e as { index?: unknown }).index
      const blurb = str((e as { blurb?: unknown }).blurb)
      if (typeof index === 'number' && Number.isInteger(index) && index >= 0 && blurb) {
        blurbs.push({ index, blurb })
      }
    }
    if (blurbs.length) out.offeringBlurbs = blurbs
  }
  return out
}

/** The concatenated generated copy, for one voice check over the whole reframe output. PURE. */
export function joinReframeCopy(copy: ReframedCopy): string {
  return [
    copy.tagline,
    copy.about,
    copy.story,
    ...(copy.offeringBlurbs ?? []).map((b) => b.blurb),
  ]
    .filter(Boolean)
    .join('\n')
}

/** Legacy automatic rewriting is disabled. Extraction and human review retain their source prose. */
export async function reframe(_input: { verified: BusinessProfile; profileId?: string | null; mood?: SeedMood; directions?: string; sourceExcerpt?: string }): Promise<ReframeRunResult | null> { return null }
/** Explicit coaching never returns writable copy or applies a live-page change. */
export async function coachBusinessWriting(input: { verified: BusinessProfile; profileId?: string | null; directions?: string }): Promise<{ questions: string[] }> {
 return { questions: await writingCoach({ feature: 'business-import-reframe', profileId: input.profileId, context: JSON.stringify({ name: input.verified.name, about: input.verified.about, story: input.verified.story, directions: input.directions }) }) }
}

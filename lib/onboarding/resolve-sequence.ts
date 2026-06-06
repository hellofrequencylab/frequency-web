import { getSequence, listSequences, DEFAULT_SEQUENCE, type BetaSequence } from './beta-sequences'
import { getSequenceOverride, listSequenceVersions, type SequenceOverride } from './sequence-overrides'
import type { VeraCopy } from './beta-script'

// Resolve onboarding sequences from BOTH sources (ADR-162): the code-first sequences
// (beta-sequences.ts) and the DB layer (sequence_overrides — owner edits + brand-new
// versions built in the wizard). Server-only (reads the admin client). The induction
// page + the builder go through here so a version renders the real /onboarding/beta
// flow with its own copy.

/** A blank version cloned from the default sequence — the wizard's starting point. */
export function blankSequence(slug: string, audience = 'New version'): BetaSequence {
  const base = getSequence(DEFAULT_SEQUENCE)
  return {
    ...base,
    slug,
    audience,
    marketingTag: `beta_${slug.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'version'}`,
  }
}

function mergeVera(base: VeraCopy, o?: Partial<VeraCopy>): VeraCopy {
  if (!o) return base
  // Build fresh (VeraCopy's keys are readonly under the `as const` source).
  return Object.fromEntries(
    (Object.keys(base) as (keyof VeraCopy)[]).map((k) => [k, { ...base[k], ...(o[k] ?? {}) }]),
  ) as VeraCopy
}

function apply(base: BetaSequence, o: SequenceOverride): BetaSequence {
  return {
    ...base,
    audience: o.audience ?? base.audience,
    marketingTag: o.marketingTag ?? base.marketingTag,
    splash: { ...base.splash, ...(o.splash ?? {}) },
    vera: mergeVera(base.vera, o.vera),
    oaths: o.oaths ?? base.oaths,
    heardAbout: o.heardAbout ?? base.heardAbout,
  }
}

/** A fully-merged sequence for a slug — code base (or a blank clone for a brand-new
 *  slug) with the DB override applied on top. */
export async function resolveSequence(slug: string | null | undefined): Promise<BetaSequence> {
  const s = (slug ?? '').trim()
  const codeExists = listSequences().some((x) => x.slug === s)
  const base = codeExists ? getSequence(s) : blankSequence(s || DEFAULT_SEQUENCE)
  const o = s ? await getSequenceOverride(s) : null
  return o ? apply(base, o) : base
}

export interface SequenceSummary {
  slug: string
  audience: string
  source: 'code' | 'custom'
}

/** Every sequence to list in the builder: the code sequences plus DB-created versions. */
export async function listAllSequences(): Promise<SequenceSummary[]> {
  const code: SequenceSummary[] = listSequences().map((s) => ({ slug: s.slug, audience: s.audience, source: 'code' }))
  const codeSlugs = new Set(code.map((c) => c.slug))
  const versions = await listSequenceVersions()
  const custom: SequenceSummary[] = versions
    .filter((v) => !codeSlugs.has(v.slug))
    .map((v) => ({ slug: v.slug, audience: v.audience ?? v.slug, source: 'custom' }))
  return [...code, ...custom]
}

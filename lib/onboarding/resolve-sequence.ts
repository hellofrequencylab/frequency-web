import { getSequence, listSequences, nicheFunnelDestination, DEFAULT_SEQUENCE, type BetaSequence } from './beta-sequences'
import {
  getSequenceOverride,
  listSequenceVersions,
  sequenceStatus,
  type SequenceOverride,
  type SequenceStatus,
} from './sequence-overrides'
import { getVeraConfig } from '@/lib/ai/vera/config'
import type { VeraCopy } from './beta-script'

// Resolve onboarding sequences from BOTH sources (ADR-162): the code base
// (beta-sequences.ts — now just the reserved `beta-default` VERA flow) and the DB
// layer (sequence_overrides — owner edits + versions built in the wizard).
// Server-only (reads the admin client). The induction page, the /pages/splash
// editor, and the builder all go through here so what they render is what's live.

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
    // Niche-funnel config: a non-empty override REPLACES the base (a niche funnel's 4 features / 3 core
    // features are a whole set, not a field merge). Absent / empty keeps the base (General funnel) behaviour.
    slide2Features: o.slide2Features?.length ? o.slide2Features : base.slide2Features,
    slide3Core: o.slide3Core?.length ? o.slide3Core : base.slide3Core,
    destination: o.destination ?? base.destination,
    // Funnel STYLE (ADR-617): the override picks the renderer. Absent keeps the base (onboarding).
    style: o.style ?? base.style,
    feature: o.feature ?? base.feature,
  }
}

/** The DEFAULT flow, fully merged, exactly as /onboarding/beta renders it with no
 *  ?seq: coded VERA copy → legacy /admin/vera induction tweaks (vera_config) → the
 *  `beta-default` override (the /pages/splash editor). The editor's saved copy wins;
 *  the vera_config layer stays underneath so older operator edits keep applying
 *  until the new editor writes over them. */
export async function resolveDefaultSequence(): Promise<BetaSequence> {
  const base = getSequence(DEFAULT_SEQUENCE)
  const ind = (await getVeraConfig()).induction
  const withConfig: BetaSequence = {
    ...base,
    vera: mergeVera(base.vera, {
      oath: { ...base.vera.oath, heading: ind.oathHeading, body: ind.oathBody },
      intro: { ...base.vera.intro, heading: ind.introHeading, body: ind.introBody },
    }),
    oaths: base.oaths.map((o, i) => ({ id: o.id, label: ind.oathLabels[i] || o.label })),
    heardAbout: ind.heardAbout.length ? ind.heardAbout : base.heardAbout,
  }
  const o = await getSequenceOverride(DEFAULT_SEQUENCE)
  return o ? apply(withConfig, o) : withConfig
}

/** A fully-merged sequence for a slug — the base VERA flow for null/blank/
 *  `beta-default`, a code sequence if one exists, or a blank clone for a DB-created
 *  version — with the slug's DB override applied on top.
 *
 *  PUBLISH GATE: a funnel saved as a draft is not served live. With `preview` off
 *  (the default — the public /onboarding/beta route), a draft slug falls back to the
 *  default flow so a paused funnel's link still lands somewhere sensible instead of
 *  showing unfinished copy. The editor + preview pass `preview: true` to always load
 *  the real draft content. */
export async function resolveSequence(
  slug: string | null | undefined,
  opts?: { preview?: boolean },
): Promise<BetaSequence> {
  const s = (slug ?? '').trim() || DEFAULT_SEQUENCE
  if (s === DEFAULT_SEQUENCE) return resolveDefaultSequence()
  const o = await getSequenceOverride(s)
  if (!opts?.preview && sequenceStatus(o) === 'draft') return resolveDefaultSequence()
  const codeExists = listSequences().some((x) => x.slug === s)
  const base = codeExists ? getSequence(s) : blankSequence(s)
  return withNicheDefaultDestination(o ? apply(base, o) : base)
}

/** A NICHE funnel (its slug is one of the operator niches) inherits its code-default Space-create
 *  destination when neither the base flow nor the DB override set an explicit `direct` target. This is
 *  what keeps ONLY the general beta splash on the waitlist/Beta-list landing: every niche funnel routes to
 *  its own section by default, while an explicit `direct` destination authored in the builder still wins.
 *  The general default flow never reaches here (resolveDefaultSequence returns first). PURE. */
function withNicheDefaultDestination(seq: BetaSequence): BetaSequence {
  if (seq.destination?.mode === 'direct') return seq
  const dest = nicheFunnelDestination(seq.slug)
  return dest ? { ...seq, destination: dest } : seq
}

export interface SequenceSummary {
  slug: string
  audience: string
  source: 'code' | 'custom'
  status: SequenceStatus
}

/** Every sequence to list in the builder: code sequences (none today) plus
 *  DB-created versions, each with its publish state. The reserved `beta-default` row
 *  is the default flow's override, not a version — it's managed at /pages/splash and
 *  excluded here. */
export async function listAllSequences(): Promise<SequenceSummary[]> {
  const code: SequenceSummary[] = listSequences().map((s) => ({
    slug: s.slug,
    audience: s.audience,
    source: 'code',
    status: 'published',
  }))
  const reserved = new Set([...code.map((c) => c.slug), DEFAULT_SEQUENCE])
  const versions = await listSequenceVersions()
  const custom: SequenceSummary[] = versions
    .filter((v) => !reserved.has(v.slug))
    .map((v) => ({ slug: v.slug, audience: v.audience ?? v.slug, source: 'custom', status: v.status }))
  return [...code, ...custom]
}

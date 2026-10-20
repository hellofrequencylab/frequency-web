// THE TIER MARK REGISTRY. One table that says, for every tier, rank or status mark a person or a Space can
// wear, what it is called, which spectrum colour it takes and whether it carries a glyph. Every surface that
// draws one of these (member cards, the profile header, Space cards and headers, the Menu and features index,
// the plan ladder) reads it through components/ui/tier-chip.tsx, so a mark cannot read differently on two
// pages. Colour VALUES live in app/globals.css (the rank spectrum); this file only picks the key.
//
// PURE and client-safe. Labels come from the naming canon (SPACE_PLAN_LABEL, ENTITLEMENT_LABEL) and are never
// typed here, so a rename moves every chip. The locked founder RATE is private and never appears in this
// file: a founder mark is a status, not a price.

import type { RankKey } from '@/lib/season-ranks'
import { SPACE_PLAN_LABEL, type SpacePlan } from '@/lib/pricing/plans'
import { ENTITLEMENT_LABEL } from '@/lib/core/entitlement'

type StatusMarkKey = 'founder' | 'founding_business' | 'boosted'
export type TierMarkKey = 'member' | 'crew' | SpacePlan | StatusMarkKey

interface TierMark {
  label: string
  rank: RankKey
  /** A status mark wears a glyph (it says something happened); a ladder rung wears the rank dot. */
  glyph: 'sparkle' | 'rocket' | null
  title?: string
}

export const TIER_MARKS: Record<TierMarkKey, TierMark> = {
  // The member ladder (two rungs, ADR-878). Crew takes the same clay as the Crew community role.
  member: { label: ENTITLEMENT_LABEL.free, rank: 'stone', glyph: null },
  crew: { label: ENTITLEMENT_LABEL.crew, rank: 'clay', glyph: null },
  // The Space ladder, climbing stone → teal → indigo → plum. Verified Non Profit and Independent sit beside
  // Business in capability, so they take a neighbouring hue, never a higher one.
  free: { label: SPACE_PLAN_LABEL.free, rank: 'stone', glyph: null },
  business: { label: SPACE_PLAN_LABEL.business, rank: 'teal', glyph: null },
  nonprofit: { label: SPACE_PLAN_LABEL.nonprofit, rank: 'jade', glyph: null },
  independent: { label: SPACE_PLAN_LABEL.independent, rank: 'slate', glyph: null },
  collective: { label: SPACE_PLAN_LABEL.collective, rank: 'indigo', glyph: null },
  nonprofit_collective: { label: SPACE_PLAN_LABEL.nonprofit_collective, rank: 'indigo', glyph: null },
  network: { label: SPACE_PLAN_LABEL.network, rank: 'plum', glyph: null },
  // Status marks. Gold is the founder family; rose is the Boost.
  founder: { label: 'Founder', rank: 'gold', glyph: 'sparkle', title: 'Founding Member' },
  founding_business: {
    label: 'Founding Business',
    rank: 'gold',
    glyph: 'sparkle',
    title: 'Founding Business. One of the first businesses to join Frequency.',
  },
  boosted: {
    label: 'Boosted',
    rank: 'rose',
    glyph: 'rocket',
    title: 'Boosted. A Crew member backed this Space this week.',
  },
}

/** What a Menu and features row says about the plan it needs. `access` is the catalog's own marking
 *  (lib/admin/modules/space-modules.ts): `included` is free for every Space, `freemium` is free with a cap a
 *  paid plan lifts, `premium` needs a paid plan. A premium row names its plan through `PREMIUM_MODULE_PLAN`. */
const PREMIUM_MODULE_PLAN: Record<string, SpacePlan> = {
  'space.automation': 'business',
  'space.program': 'business',
  'space.chapters': 'network',
}

export interface ModuleTierRead {
  mark: TierMarkKey
  /** True when the feature is free but a paid plan lifts a limit ("Free, more on Business"). */
  capped: boolean
}

/** The plan a catalog module belongs to, for the tier chip on its row. PURE. */
export function moduleTierRead(id: string, access: 'included' | 'freemium' | 'premium' | undefined): ModuleTierRead {
  if (access === 'premium') return { mark: PREMIUM_MODULE_PLAN[id] ?? 'business', capped: false }
  return { mark: 'free', capped: access === 'freemium' }
}

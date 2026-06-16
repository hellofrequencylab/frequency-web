// Per-Pillar Zap balance — the new economy rule made visible (owner-locked).
//
// A Journey ships weight-classed Practices across all four Pillars (Mind / Body /
// Spirit / Expression). Each Practice pays Zaps by its weight class on a daily log
// (lib/zaps.ts: Light 8 / Standard 12 / Heavy 15). The locked rule: a Journey's
// Practices must be BALANCED so every Pillar earns the same total daily Zaps. This
// module is the pure math behind that check — no DB, no React, client + server safe,
// so the same function backs the Season Composer indicator today and the Journey
// editor tomorrow. One source of truth for "are the four Pillar totals equal?".

import { practiceLogZaps } from '@/lib/zaps'
import { PILLAR_SLUGS, type PillarSlug } from '@/lib/pillars'

/** A practice as the balance math needs it: its Pillar and its weight class. Either
 *  may be missing on real data (an uncategorized practice, a null weight class), so
 *  both are optional — a practice with no Pillar is counted toward no total. */
export interface BalancePractice {
  /** The practice's Pillar slug (from its `domain_id` → `pillars.slug`). */
  pillar: PillarSlug | null | undefined
  /** The practice's weight class ('light' | 'standard' | 'heavy'); null = standard. */
  weightClass: string | null | undefined
}

/** The four per-Pillar daily Zap totals plus whether they are all equal. */
export interface PillarZapBalance {
  mind: number
  body: number
  spirit: number
  expression: number
  /** True when all four totals are equal (the locked rule is satisfied). An empty
   *  Journey is trivially balanced (all zero). */
  balanced: boolean
}

/**
 * Sum each Pillar's daily Zap total over a Journey's practices. A practice's Zaps come
 * from its weight class (Light 8 / Standard 12 / Heavy 15, via practiceLogZaps); a
 * practice with no Pillar contributes to no total. `balanced` is true iff all four
 * Pillar totals are equal — the owner-locked rule that every Pillar earns the same
 * daily Zaps. Pure: deterministic, no side effects.
 */
export function pillarZapBalance(practices: readonly BalancePractice[]): PillarZapBalance {
  const totals: Record<PillarSlug, number> = { mind: 0, body: 0, spirit: 0, expression: 0 }
  for (const p of practices) {
    if (!p.pillar) continue
    totals[p.pillar] += practiceLogZaps(p.weightClass)
  }
  const values = PILLAR_SLUGS.map((slug) => totals[slug])
  const balanced = values.every((v) => v === values[0])
  return { ...totals, balanced }
}

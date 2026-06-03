// Deterministic experiment assignment (ADR-069 Phase 5). A stable hash of
// `experiment:unit` maps each unit (usually a profile id) to a variant by weight —
// so assignment is reproducible with NO storage, and a member never flips variants.
// All pure; unit-tested. Pair with an `experiment.exposed` analytics event at the
// call site to measure lift.

import { getExperiment, type Variant } from './registry'

/** FNV-1a → a stable float in [0, 1). */
export function hashToUnit(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // >>> 0 makes it unsigned; divide by 2^32 for [0, 1).
  return (h >>> 0) / 0x100000000
}

/** Pick a variant by normalized weight from a stable seed. Pure + deterministic. */
export function assignVariant(variants: Variant[], seed: string): string {
  if (variants.length === 0) return 'control'
  const total = variants.reduce((acc, v) => acc + Math.max(0, v.weight), 0)
  if (total <= 0) return variants[0].key
  const x = hashToUnit(seed) * total
  let acc = 0
  for (const v of variants) {
    acc += Math.max(0, v.weight)
    if (x < acc) return v.key
  }
  return variants[variants.length - 1].key
}

/** The variant a unit is in for an experiment. Unknown/off experiments → 'control'
 *  (the holdout), so callers can always branch safely. */
export function getVariant(experimentKey: string, unitId: string): string {
  const exp = getExperiment(experimentKey)
  if (!exp || exp.status === 'off') return 'control'
  return assignVariant(exp.variants, `${experimentKey}:${unitId}`)
}

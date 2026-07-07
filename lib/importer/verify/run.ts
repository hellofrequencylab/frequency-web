// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the VERIFY ORCHESTRATOR (P1, docs/BUSINESS-IMPORTER.md §4).
// Ties the adversarial refuter (./refute.ts, opus) to the pure gate (./gate.ts): resolve
// each commercial claim from the draft, run the refuter per field, apply the verdicts to
// the ledger, then split the draft into the VERIFIED subset (safe for reframe + apply) vs
// the withheld / flagged fields.
//
// The refuter runs per COMMERCIAL field (address, phone, email, hours, rating, each offering
// price) — the fields §4.3 says may never auto-publish uncited. A per-import USD budget cap
// (§9e) stops the fan-out early; any field not reached stays UNVERIFIED (the safe default).
// FAIL-SAFE: a refuter that returns null (AI off / over budget / failed) leaves the field
// unverified, so verification failing closed can never publish an unchecked commercial fact.
// ─────────────────────────────────────────────────────────────────────────────

import type { BusinessProfile, ProvenanceLedger } from '../schema'
import type { HarvestedSource } from '../intake'
import { refuteField } from './refute'
import {
  applyVerdicts,
  commercialPathsInLedger,
  enumerateCommercialFieldPaths,
  splitVerified,
  type FieldVerdict,
  type VerificationSplit,
} from './gate'

/** The full result of the verify stage. */
export interface VerifyResult extends VerificationSplit {
  /** The ledger AFTER the refuter verdicts were applied (what gets persisted). */
  ledger: ProvenanceLedger
  /** USD spent on refuter calls this run (added to the intake's budget_spent). */
  costUsd: number
  /** How many commercial fields the refuter actually judged (vs skipped by the cap / AI off). */
  fieldsVerified: number
}

/** Injectable refuter so the orchestrator is testable without a network / model. */
export interface VerifyDeps {
  refuteField?: typeof refuteField
}

/** Resolve the human-readable claim string for a commercial field path from the draft. PURE. */
export function claimForPath(draft: BusinessProfile, path: string): string | null {
  switch (path) {
    case 'contact.address':
      return draft.contact?.address?.trim() || null
    case 'contact.phone':
      return draft.contact?.phone?.trim() || null
    case 'contact.email':
      return draft.contact?.email?.trim() || null
    case 'contact.hours':
      return draft.contact?.hours?.trim() || null
    case 'rating': {
      const r = draft.rating
      if (!r) return null
      const parts = [r.value?.trim(), r.count?.trim() && `(${r.count.trim()})`].filter(Boolean)
      return parts.length ? `Rating ${parts.join(' ')}` : null
    }
    default: {
      const m = path.match(/^offerings\[(\d+)\]\.price$/)
      if (m) {
        const o = draft.offerings?.[Number(m[1])]
        if (o && typeof o.price === 'number') {
          return `${o.title}: ${o.currency ?? '$'}${o.price}${o.priceModel ? ` (${o.priceModel})` : ''}`
        }
      }
      return null
    }
  }
}

/**
 * Verify a draft against its harvested sources. Runs the adversarial refuter over every commercial
 * field the draft populates, applies the verdicts to the ledger, and returns the verified split.
 * `maxSpendUsd` caps the refuter fan-out (docs §9e); once hit, remaining fields stay unverified.
 * Never throws.
 */
export async function verify(input: {
  draft: BusinessProfile
  ledger: ProvenanceLedger
  sources: HarvestedSource[]
  profileId?: string | null
  /** Per-import USD budget for the verify fan-out (defaults to a small cap). */
  maxSpendUsd?: number
  deps?: VerifyDeps
}): Promise<VerifyResult> {
  const refute = input.deps?.refuteField ?? refuteField
  const maxSpend = input.maxSpendUsd ?? 1.5

  // The commercial fields to judge: the union of what the draft populates AND what the extractor
  // already ledgered as commercial (so a ledgered price with a stripped value is still checked).
  const paths = Array.from(
    new Set([...enumerateCommercialFieldPaths(input.draft), ...commercialPathsInLedger(input.ledger)]),
  )

  const verdicts: FieldVerdict[] = []
  let costUsd = 0
  let fieldsVerified = 0

  for (const path of paths) {
    if (costUsd >= maxSpend) break // per-import budget cap: leave the rest unverified (safe default)
    const claim = claimForPath(input.draft, path)
    if (!claim) continue
    const priorEntry = input.ledger[path]?.[0]
    const result = await refute({
      path,
      claim,
      sources: input.sources,
      sourceUrl: priorEntry?.sourceUrl,
      profileId: input.profileId,
    })
    if (!result) continue // AI off / over budget / failed -> field stays unverified
    verdicts.push(result.verdict)
    costUsd += result.costUsd
    fieldsVerified += 1
  }

  const nextLedger = applyVerdicts(input.ledger, verdicts)
  const split = splitVerified(input.draft, nextLedger)

  return { ...split, ledger: nextLedger, costUsd, fieldsVerified }
}

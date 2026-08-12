// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the REVIEW MODEL (docs/BUSINESS-IMPORTER.md §4/§8).
//
// This module used to hold BOTH halves of the review board: the generic machinery (confidence
// signals, the withheld-fact gate, section grouping, the roll-up) AND the business-specific
// field walker. ADR-597 split them:
//
//   * the machinery  -> lib/studio/kernel/review-kernel.ts + kernel/ledger.ts  (every entity)
//   * the field list -> lib/studio/entities/business.ts                        (business only)
//
// What is left is the binding: the business manifest applied to a draft + ledger. The board's
// call signature is unchanged, so nothing downstream moved and the existing test suite runs
// against this file untouched, which is the proof the extraction was behaviour-neutral.
//
// The kernel keeps the guarantee this file was written for: it reads the SAME clearance rule
// the materializer's Gate B enforces (lib/importer/schema.ts isCommercialFieldCleared), so the
// board never promises a field will publish that Apply would withhold.
// ─────────────────────────────────────────────────────────────────────────────

import { BUSINESS_MANIFEST } from '@/lib/studio/entities/business'
import { buildFieldModel, type FieldModel, type FieldSection, type FieldState } from '@/lib/studio/kernel/review-kernel'
import type { BusinessProfile, ProvenanceLedger } from '@/lib/importer/schema'

export { SIGNAL_GLYPH } from '@/lib/studio/kernel/ledger'
export type { ReviewSignal } from '@/lib/studio/kernel/ledger'

/** One reviewable field on the board. The kernel's `FieldState`, under the board's own name. */
export type ReviewField = FieldState
/** A group of reviewable fields. */
export type ReviewSection = FieldSection
/** The whole review model for one intake. */
export type ReviewModel = FieldModel

/** The board sections a business declares (kept as a type for existing call sites). */
export type ReviewSectionKey = 'identity' | 'story' | 'contact' | 'offerings' | 'reputation' | 'other'

/**
 * Build the full review model for one intake from its draft + ledger. PURE.
 *
 * Empty commercial fields still surface (so the operator sees what is missing or withheld);
 * optional fields the draft never set are dropped by the manifest's `omitWhenEmpty`.
 */
export function buildReviewModel(draft: BusinessProfile, ledger: ProvenanceLedger): ReviewModel {
  return buildFieldModel(BUSINESS_MANIFEST, draft as unknown as Record<string, unknown>, ledger)
}

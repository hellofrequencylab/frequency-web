// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — REFRAME APPLY (P2, docs/BUSINESS-IMPORTER.md §5 stage 5). PURE
// (no AI / IO): fold the reframed copy back onto the verified draft and STAMP the ledger so
// every generated string is recorded as kind:'generated'. Exhaustively unit-testable.
//
// THE TRUST INVARIANT this file pins (docs §4.2 / §4.4):
//   • Every string reframe writes (tagline / about / story / an offering blurb) is recorded in the
//     ledger as kind:'generated' with NO sourceUrl and NO verifiedBy. So it stays subject to the
//     PROSE GATE (map.ts prosePublishes): a generated string that hides a commercial claim is
//     review-required and does NOT auto-publish as trusted. Reframe cannot launder a fact by
//     wording it into prose, because its output is tagged generated, not fact.
//   • Reframe only ever WRITES the four prose fields. It never touches contact / rating / price /
//     the commercial ledger entries, so it cannot promote a withheld commercial fact.
//   • EDIT-WINS (the P5 seam, docs §5): a `preserve` set names field paths an operator already
//     edited in review; those are skipped so a re-reframe never clobbers a human edit. P2 leaves
//     the persistence of that marker to P5, but the fold already honors it when passed.
//
// No em dashes in this file (CONTENT-VOICE §10). All copy is sanitized via voice-check.
// ─────────────────────────────────────────────────────────────────────────────

import type { BusinessProfile, LedgerEntry, ProvenanceLedger } from '../schema'
import { sanitizeGenerated } from './voice-check'

/** The prose reframe produces. Every field is optional; only what the model returned is folded. */
export interface ReframedCopy {
  tagline?: string
  about?: string
  story?: string
  /** One rewritten blurb per offering, keyed by the offering's 0-based index. */
  offeringBlurbs?: { index: number; blurb: string }[]
}

/** The ledger paths reframe generates. The prose gate (map.ts) keys off these exact paths, so a
 *  generated line at any of them is withheld unless verified/hand-supplied. Offering blurbs are
 *  keyed per index at `offerings[i].blurb`. */
export const REFRAME_PROSE_PATHS = ['tagline', 'about', 'story'] as const

/** A fresh generated-copy ledger entry: no source, no verification, low-ish confidence. This is the
 *  shape the prose gate treats as review-required (kind:'generated' && !verifiedBy). PURE. */
export function generatedEntry(): LedgerEntry {
  return { kind: 'generated', confidence: 0.5 }
}

/** The offering-blurb ledger path for an index (matches the prose gate's convention). PURE. */
export function offeringBlurbPath(index: number): string {
  return `offerings[${index}].blurb`
}

/**
 * Fold reframed copy onto a COPY of the verified draft and return the new draft + the ledger
 * updated so every field reframe wrote is tagged kind:'generated'. NEVER mutates the inputs.
 *
 * `preserve` (the edit-wins seam, docs §5): a set of field paths an operator already edited; a path
 * in the set is skipped so a re-reframe leaves the human edit in place. Empty by default.
 *
 * PURE + total. Empty / whitespace strings are ignored (reframe writing nothing leaves the field
 * as the verifier left it). Every stored string is run through sanitizeGenerated first (em dashes
 * out), so the "no em dashes" rule holds even on a model slip.
 */
export function applyReframe(
  verified: BusinessProfile,
  copy: ReframedCopy,
  ledger: ProvenanceLedger,
  preserve: ReadonlySet<string> = new Set(),
): { draft: BusinessProfile; ledger: ProvenanceLedger } {
  const draft: BusinessProfile = structuredClone(verified)
  const nextLedger: ProvenanceLedger = {}
  for (const [path, entries] of Object.entries(ledger)) nextLedger[path] = entries.map((e) => ({ ...e }))

  const setProse = (path: (typeof REFRAME_PROSE_PATHS)[number], value: string | undefined) => {
    if (preserve.has(path)) return
    const clean = sanitizeGenerated((value ?? '').trim())
    if (!clean) return
    ;(draft as unknown as Record<string, string>)[path] = clean
    // Tag as generated so the prose gate keeps it review-required (never auto-published as trusted).
    nextLedger[path] = [generatedEntry()]
  }

  setProse('tagline', copy.tagline)
  setProse('about', copy.about)
  setProse('story', copy.story)

  // Offering blurbs: fold each onto its offering by index, tag its ledger path generated. An index
  // out of range or an offering that was stripped by verify is skipped (never creates an offering).
  for (const b of copy.offeringBlurbs ?? []) {
    const i = b.index
    const offering = draft.offerings?.[i]
    if (!offering) continue
    const path = offeringBlurbPath(i)
    if (preserve.has(path)) continue
    const clean = sanitizeGenerated((b.blurb ?? '').trim())
    if (!clean) continue
    offering.blurb = clean
    nextLedger[path] = [generatedEntry()]
  }

  return { draft, ledger: nextLedger }
}

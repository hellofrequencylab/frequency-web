// ─────────────────────────────────────────────────────────────────────────────
// THE STUDIO KERNEL — provenance (docs/STUDIO.md, ADR-986).
//
// Where a drafted value CAME FROM, and whether that is good enough to publish. Generalized
// out of the Business Seeder (lib/importer/schema.ts), where it was born business-shaped, so
// every entity that drafts with AI can carry the same trust story: a fact needs a source or a
// human's confirm, generated prose is marked, a contradiction blocks the apply.
//
// PURE + total. The types are structurally identical to the importer's, so an intake ledger
// passes straight into the kernel with no adapter (see lib/importer/schema.ts, which keeps
// its own copy as the importer's public contract).
//
// THE ONE LAW: this module MIRRORS the gate; it never IS the gate. Whatever the review board
// paints here, the server re-checks independently before anything reaches a live surface. A
// UI bypass must never be able to leak an unverified price.
// ─────────────────────────────────────────────────────────────────────────────

/** How a value came to be. `fact` is sourced, `inferred` is reasoned, `generated` is written. */
export type LedgerKind = 'fact' | 'inferred' | 'generated'

/** One provenance entry for a draft field path. */
export interface LedgerEntry {
  /** Where the claim came from (absent for 'generated'). */
  sourceUrl?: string
  /** The exact harvested text that supports it. */
  snippet?: string
  /** 0..1. */
  confidence: number
  kind: LedgerKind
  /** Set once the adversarial verifier or an operator confirms it. */
  verifiedBy?: 'auto' | 'human'
}

/** Field path ('contact.phone', 'offerings[0].price') to its provenance entries. */
export type ProvenanceLedger = Record<string, LedgerEntry[]>

/** The three review signals. Rendered with the PRESENTATION.md legend glyphs. */
export type ReviewSignal = 'green' | 'amber' | 'red'

/** The status-legend glyph for a signal (docs/PRESENTATION.md). */
export const SIGNAL_GLYPH: Record<ReviewSignal, string> = {
  green: '✅',
  amber: '⚠️',
  red: '🔴',
}

/** Below this, even a verified fact only earns amber. */
export const LOW_CONFIDENCE = 0.5

/**
 * A field is CLEARED to publish when some entry is a `fact` that has been verified (by the
 * adversarial pass or by a human confirm). PURE + total: no entries === not cleared, so an
 * entity that keeps no ledger at all must opt out via the field's own gate, never by accident.
 */
export function isCleared(entries: LedgerEntry[] | undefined): boolean {
  if (!entries || entries.length === 0) return false
  return entries.some((e) => e.kind === 'fact' && !!e.verifiedBy)
}

/** The single strongest entry for a path: verified facts win, then highest confidence. PURE. */
export function strongestEntry(entries: LedgerEntry[] | undefined): LedgerEntry | undefined {
  if (!entries || entries.length === 0) return undefined
  return [...entries].sort((a, b) => {
    const av = a.kind === 'fact' && a.verifiedBy ? 1 : 0
    const bv = b.kind === 'fact' && b.verifiedBy ? 1 : 0
    if (av !== bv) return bv - av
    return (b.confidence ?? 0) - (a.confidence ?? 0)
  })[0]
}

/**
 * A CONTRADICTED entry: the verifier encodes a refuted claim as a non-fact at confidence 0.
 * Only meaningful for commercial facts, where it blocks the apply until a human resolves it.
 */
export function isContradicted(entry: LedgerEntry | undefined): boolean {
  if (!entry) return false
  const verifiedFact = entry.kind === 'fact' && !!entry.verifiedBy
  return !verifiedFact && (entry.confidence ?? 0) <= 0
}

/** Derive the confidence signal for a field from its strongest entry. PURE. */
export function deriveSignal(entry: LedgerEntry | undefined, commercial: boolean): ReviewSignal {
  if (commercial && isContradicted(entry)) return 'red'
  if (!entry) return 'amber' // no provenance -> not a verified fact -> amber (editable)
  const verifiedFact = entry.kind === 'fact' && !!entry.verifiedBy
  if (verifiedFact && (entry.confidence ?? 0) >= LOW_CONFIDENCE) return 'green'
  return 'amber'
}

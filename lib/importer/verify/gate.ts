// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the VERIFICATION GATE, pure core (P1,
// docs/BUSINESS-IMPORTER.md §4, THE emphasized subsystem).
//
// This is the trust spine of the whole product. It holds, with ZERO IO so it is
// exhaustively unit-testable:
//   • which field paths are COMMERCIAL FACTS that may never auto-publish without a
//     cited, verified ledger entry (§4.3);
//   • the REDUCER that applies an adversarial refuter verdict
//     (supported | unsupported | contradicted) to a field's ledger entry (§4.2);
//   • the final SPLIT of the draft into what is cleared to publish vs what is withheld
//     vs what is flagged red, so the reframe (P2) + apply (P0) only ever see verified
//     facts (§4.4).
//
// GUARANTEE (the invariant the tests pin): a commercial field can reach a live surface
// ONLY when its ledger entry is (kind:'fact' AND verifiedBy set). A field the refuter
// could not support stays unverified and is withheld; a contradicted field is flagged red
// and blocks apply for that field. Enforced HERE, not in the UI, so a UI bypass cannot
// leak an unverified price (§4.3, reuses the P0 gate helper isCommercialFieldCleared).
// ─────────────────────────────────────────────────────────────────────────────

import {
  COMMERCIAL_FACT_PATHS,
  isCommercialFieldCleared,
  type BusinessProfile,
  type LedgerEntry,
  type ProvenanceLedger,
} from '../schema'

// ── Refuter verdict (docs §4.2) ─────────────────────────────────────────────────────

/** The adversarial refuter's verdict on one field, given ONLY the harvested snippets:
 *  supported = the snippets back the claim; unsupported = the snippets neither back nor
 *  contradict it; contradicted = the snippets say something different. */
export type RefuterVerdict = 'supported' | 'unsupported' | 'contradicted'

/** One refuter result for a field path. */
export interface FieldVerdict {
  path: string
  verdict: RefuterVerdict
  /** The snippet the refuter relied on (for the review board's one-click source). */
  snippet?: string
  sourceUrl?: string
  /** The refuter's 0..1 confidence in its verdict. */
  confidence?: number
}

// ── Commercial-fact path matching (docs §4.3) ─────────────────────────────────────────

/**
 * Whether a concrete ledger field path is a COMMERCIAL FACT. The P0 canon
 * (COMMERCIAL_FACT_PATHS) lists 'offerings[].price' with a wildcard index; a real ledger
 * keys it per index ('offerings[0].price'). This matches either form. PURE.
 */
export function isCommercialPath(path: string): boolean {
  if (COMMERCIAL_FACT_PATHS.includes(path)) return true
  // Normalize a concrete offering price index to the canon wildcard.
  const normalized = path.replace(/offerings\[\d+\]\.price/, 'offerings[].price')
  return COMMERCIAL_FACT_PATHS.includes(normalized)
}

/** Every field path present in the ledger that is a commercial fact — the set the adversarial
 *  refuter MUST run over. PURE. */
export function commercialPathsInLedger(ledger: ProvenanceLedger): string[] {
  return Object.keys(ledger).filter(isCommercialPath)
}

// ── The verdict reducer (docs §4.2) ─────────────────────────────────────────────────

/**
 * Apply a refuter verdict to a field's existing ledger entry, returning the UPDATED entry.
 * PURE + total (the heart of §4.2):
 *   • supported   -> promote to a verified fact: kind='fact', verifiedBy='auto', confidence kept/raised.
 *   • unsupported -> stays inferred/generated, confidence CAPPED low, never verified.
 *   • contradicted-> flagged: confidence floored, verifiedBy cleared, kind left as-is (the split
 *                     marks it red and blocks apply).
 * When there is no prior entry (a field the extractor did not ledger) a fresh entry is derived
 * from the verdict so the reducer is total.
 */
export function applyVerdict(prior: LedgerEntry | undefined, v: FieldVerdict): LedgerEntry {
  const base: LedgerEntry = prior
    ? { ...prior }
    : { kind: 'inferred', confidence: 0.3 }
  // Carry the refuter's own snippet/source when the extractor had none (better provenance).
  if (!base.snippet && v.snippet) base.snippet = v.snippet
  if (!base.sourceUrl && v.sourceUrl) base.sourceUrl = v.sourceUrl

  switch (v.verdict) {
    case 'supported': {
      // Only a field that ALREADY carries a citation (snippet or sourceUrl) can become a verified
      // fact. "supported" without any citation cannot manufacture provenance out of nothing.
      const hasCitation = !!(base.snippet || base.sourceUrl)
      if (hasCitation) {
        base.kind = 'fact'
        base.verifiedBy = 'auto'
        base.confidence = Math.max(base.confidence, clamp(v.confidence ?? 0.8))
      } else {
        // Supported-but-uncited: treat as inferred at best, never a published fact.
        base.kind = base.kind === 'fact' ? 'inferred' : base.kind
        base.confidence = Math.min(base.confidence, 0.5)
        delete base.verifiedBy
      }
      return base
    }
    case 'unsupported': {
      // Never a fact; cap confidence; strip any prior auto-verification.
      if (base.kind === 'fact') base.kind = 'inferred'
      base.confidence = Math.min(base.confidence, 0.4)
      delete base.verifiedBy
      return base
    }
    case 'contradicted': {
      // The sources say otherwise. Floor confidence, clear verification. The split flags it red.
      base.confidence = Math.min(base.confidence, 0.1)
      delete base.verifiedBy
      return base
    }
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0.5
  return Math.min(1, Math.max(0, n))
}

// ── Applying a batch of verdicts to the whole ledger ──────────────────────────────────

/** Apply every refuter verdict to the ledger, returning a NEW ledger (never mutates the input).
 *  A verdict for an unknown path is inserted as a fresh entry (total). PURE. */
export function applyVerdicts(ledger: ProvenanceLedger, verdicts: FieldVerdict[]): ProvenanceLedger {
  const next: ProvenanceLedger = {}
  for (const [path, entries] of Object.entries(ledger)) {
    next[path] = entries.map((e) => ({ ...e }))
  }
  for (const v of verdicts) {
    const prior = next[v.path]?.[0]
    next[v.path] = [applyVerdict(prior, v)]
  }
  return next
}

// ── The final split (docs §4.3 / §4.4) ────────────────────────────────────────────────

/** The traffic-light status of one field for the review board (docs §4.5). */
export type FieldStatus = 'green' | 'amber' | 'red'

/** One flagged field the review board surfaces. */
export interface FieldFlag {
  path: string
  status: FieldStatus
  reason: string
  entry: LedgerEntry
}

/** The result of splitting a verified draft: what is cleared, what is withheld, what is flagged. */
export interface VerificationSplit {
  /** The draft with every UN-cleared commercial fact stripped, safe to hand to reframe + apply. */
  verifiedDraft: BusinessProfile
  /** The per-field flags for the review board. */
  flags: FieldFlag[]
  /** Commercial paths that are contradicted (red) — apply is blocked for these until a human resolves. */
  blocked: string[]
  /** The materializer's commercial policy: 'withhold' whenever any commercial fact is unverified. */
  commercialPolicy: 'allow' | 'withhold'
}

/**
 * The traffic-light status of a single field entry (docs §4.5):
 *   green = fact + verifiedBy, high confidence; amber = inferred/generated or low-confidence fact;
 *   red   = contradicted (confidence floored). Commercial fields that are not green are never
 *   auto-published. PURE.
 */
export function fieldStatus(path: string, entry: LedgerEntry): FieldStatus {
  if (entry.confidence <= 0.1 && entry.kind !== 'generated') return 'red'
  if (isCommercialPath(path)) {
    return isCommercialFieldCleared([entry]) && entry.confidence >= 0.6 ? 'green' : 'amber'
  }
  if (entry.kind === 'fact' && entry.verifiedBy && entry.confidence >= 0.6) return 'green'
  return 'amber'
}

/**
 * Split a draft + a post-verification ledger into the verified subset (safe for reframe/apply),
 * the review flags, and the blocked (contradicted) commercial paths. THE gate (docs §4.3/§4.4):
 * a commercial field whose ledger entry is not (kind:'fact' AND verifiedBy) is STRIPPED from the
 * verified draft, so it never reaches a live surface. PURE + total.
 */
export function splitVerified(draft: BusinessProfile, ledger: ProvenanceLedger): VerificationSplit {
  const verifiedDraft: BusinessProfile = structuredClone(draft)
  const flags: FieldFlag[] = []
  const blocked: string[] = []
  let anyCommercialWithheld = false

  // Walk EVERY commercial path that could exist on this draft, whether or not the ledger has it.
  for (const path of enumerateCommercialFieldPaths(draft)) {
    const entry = ledger[path]?.[0]
    const cleared = isCommercialFieldCleared(entry ? [entry] : undefined)
    const status = entry ? fieldStatus(path, entry) : 'amber'
    if (status === 'red') blocked.push(path)
    if (!cleared || status === 'red') {
      anyCommercialWithheld = true
      stripFieldPath(verifiedDraft, path)
      flags.push({
        path,
        status,
        reason:
          status === 'red'
            ? 'Contradicted by the sources. Held out of apply until a human resolves it.'
            : 'Commercial fact without a verified citation. Withheld from the live surface.',
        entry: entry ?? { kind: 'generated', confidence: 0 },
      })
    } else {
      flags.push({ path, status, reason: 'Verified against a cited source.', entry: entry! })
    }
  }

  // Non-commercial fields: flag amber/red for the board, but do NOT strip (they are editable copy,
  // not auto-published commercial claims). A contradicted non-commercial field is still surfaced.
  for (const [path, entries] of Object.entries(ledger)) {
    if (isCommercialPath(path)) continue
    const entry = entries[0]
    if (!entry) continue
    const status = fieldStatus(path, entry)
    if (status !== 'green') {
      flags.push({ path, status, reason: statusReason(status), entry })
      if (status === 'red') blocked.push(path)
    }
  }

  return {
    verifiedDraft,
    flags,
    blocked,
    commercialPolicy: anyCommercialWithheld ? 'withhold' : 'allow',
  }
}

function statusReason(status: FieldStatus): string {
  if (status === 'red') return 'Contradicted by the sources. Flagged for a human.'
  return 'Not verified against a source. Editable, not auto-published.'
}

/** Every concrete commercial field path that this draft actually populates (so the gate walks
 *  real fields, expanding offerings[] per index). PURE. */
export function enumerateCommercialFieldPaths(draft: BusinessProfile): string[] {
  const out: string[] = []
  if (draft.contact?.address?.trim()) out.push('contact.address')
  if (draft.contact?.phone?.trim()) out.push('contact.phone')
  if (draft.contact?.email?.trim()) out.push('contact.email')
  if (draft.contact?.hours?.trim()) out.push('contact.hours')
  if (draft.rating && (draft.rating.value?.trim() || draft.rating.count?.trim())) out.push('rating')
  ;(draft.offerings ?? []).forEach((o, i) => {
    if (typeof o.price === 'number') out.push(`offerings[${i}].price`)
  })
  return out
}

/** Strip the value at a commercial field path from a draft (leaves the surrounding object). The
 *  materializer ALSO gates, so this is belt-and-braces: the verified draft literally does not carry
 *  the un-cleared fact. PURE (mutates the passed clone). */
export function stripFieldPath(draft: BusinessProfile, path: string): void {
  switch (path) {
    case 'contact.address':
      if (draft.contact) delete draft.contact.address
      return
    case 'contact.phone':
      if (draft.contact) delete draft.contact.phone
      return
    case 'contact.email':
      if (draft.contact) delete draft.contact.email
      return
    case 'contact.hours':
      if (draft.contact) delete draft.contact.hours
      return
    case 'rating':
      delete draft.rating
      return
    default: {
      const m = path.match(/^offerings\[(\d+)\]\.price$/)
      if (m && draft.offerings) {
        const idx = Number(m[1])
        if (draft.offerings[idx]) delete draft.offerings[idx].price
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the REVIEW MODEL (P3, docs/BUSINESS-IMPORTER.md §4/§8).
//
// PURE + framework-independent (no React / Next / Supabase). Turns a persisted intake
// (draft BusinessProfile + ProvenanceLedger) into the flat, field-by-field list the
// review board renders: for each field, its value, its provenance (citation snippet +
// source url), a confidence SIGNAL (✅ green / ⚠️ amber / 🔴 red, docs §4.5), whether the
// copy is AI-GENERATED, and whether it is a WITHHELD commercial fact (an uncleared
// price/hours/address/phone that needs a source or the operator's confirm, docs §4.3).
//
// It reads the SAME gate the materializer enforces (lib/importer/map commercialFieldClears
// / prosePublishes + schema COMMERCIAL_FACT_PATHS / isCommercialFieldCleared), so the board
// never promises a field will publish that Gate B would withhold. The board is honest by
// construction: it derives its withheld/red flags from the exact ledger the Apply step reads.
//
// GENERIC over the draft: it walks the KNOWN BusinessProfile field paths (schema §3.4), so
// when P2's Reframe rewrites `story`/`about`/`tagline`/offering `blurb` and updates their
// ledger entries, those fields simply re-paint — no new wiring. Unknown/new scalar draft keys
// are surfaced under a generic "other" section rather than dropped.
// ─────────────────────────────────────────────────────────────────────────────

import {
  isCommercialFieldCleared,
  COMMERCIAL_FACT_PATHS,
  type BusinessProfile,
  type LedgerEntry,
  type ProvenanceLedger,
} from '@/lib/importer/schema'

/** The three review signals (docs §4.5). `green` = verified fact, confident. `amber` =
 *  inferred/generated or a low-confidence fact; editable, not auto-published for commercial
 *  facts. `red` = contradicted; blocks Apply for that field until a human resolves it. */
export type ReviewSignal = 'green' | 'amber' | 'red'

/** The status-legend glyph for a signal (docs/PRESENTATION.md legend). */
export const SIGNAL_GLYPH: Record<ReviewSignal, string> = {
  green: '✅',
  amber: '⚠️',
  red: '🔴',
}

/** One reviewable field, flattened for the board. */
export interface ReviewField {
  /** The ledger key / field path, e.g. 'contact.phone' or 'offerings[0].price'. */
  path: string
  /** A human label for the row, e.g. 'Phone'. */
  label: string
  /** The section this field groups under on the board. */
  section: ReviewSectionKey
  /** The current draft value, rendered as text (empty string when unset). */
  value: string
  /** The confidence signal painted on the row (docs §4.5). */
  signal: ReviewSignal
  /** The provenance for this field (the strongest supporting ledger entry), if any. */
  provenance?: { sourceUrl?: string; snippet?: string; confidence: number; kind: LedgerEntry['kind']; verifiedBy?: 'auto' | 'human' }
  /** True when this value was written by AI (kind 'generated'/'inferred') — marked on the board. */
  generated: boolean
  /** True when this is a commercial fact (price/hours/address/phone/rating). */
  commercial: boolean
  /** True when a commercial fact is NOT cleared to publish — withheld until a source or confirm. */
  withheld: boolean
  /** True when Apply is BLOCKED for this field (a contradicted commercial fact). */
  blocksApply: boolean
  /** Whether the value is editable inline (scalars are; nested lists edit through their own row). */
  editable: boolean
}

/** The board sections (order = render order). */
export type ReviewSectionKey =
  | 'identity'
  | 'story'
  | 'contact'
  | 'offerings'
  | 'reputation'
  | 'other'

export interface ReviewSection {
  key: ReviewSectionKey
  title: string
  /** One-line, plain description of what the section holds. */
  desc: string
  fields: ReviewField[]
}

/** The whole review model for one intake. */
export interface ReviewModel {
  sections: ReviewSection[]
  /** Roll-up counts for the board header (the ✅/⚠️/🔴 legend + withheld tally). */
  summary: {
    total: number
    green: number
    amber: number
    red: number
    withheld: number
    /** Any red field blocks the whole Apply until resolved (docs §4.3). */
    blocked: boolean
  }
}

// ── Which paths are commercial / prose (mirrors the materializer's two gates) ──────────

// Prose fields (about/story/tagline/offering blurb) can hide a commercial claim (docs §4.2), so
// they are "review-required": they publish only when the ledger entry is a verified fact OR there
// is no entry (hand-supplied). Marked via the RawField.prose flag in extractFields below.

/** A commercial fact path is either a fixed one (COMMERCIAL_FACT_PATHS) or a per-offering price. */
function isCommercialPath(path: string): boolean {
  if (COMMERCIAL_FACT_PATHS.includes(path)) return true
  return /^offerings\[\d+\]\.price$/.test(path)
}

// ── Signal derivation (docs §4.5) ─────────────────────────────────────────────────────

/** The single strongest ledger entry for a path (highest confidence, verified facts win). */
function strongestEntry(entries: LedgerEntry[] | undefined): LedgerEntry | undefined {
  if (!entries || entries.length === 0) return undefined
  return [...entries].sort((a, b) => {
    const av = a.kind === 'fact' && a.verifiedBy ? 1 : 0
    const bv = b.kind === 'fact' && b.verifiedBy ? 1 : 0
    if (av !== bv) return bv - av
    return (b.confidence ?? 0) - (a.confidence ?? 0)
  })[0]
}

/** Whether an entry is a 'contradicted' red flag. The verifier encodes a contradiction as a
 *  non-fact entry with confidence 0 (docs §4.2 — contradicted caps confidence low and blocks
 *  Apply). We treat a commercial fact whose strongest entry has confidence 0 and is not a
 *  verified fact as contradicted (red). */
function isContradicted(entry: LedgerEntry | undefined): boolean {
  if (!entry) return false
  const verifiedFact = entry.kind === 'fact' && !!entry.verifiedBy
  return !verifiedFact && (entry.confidence ?? 0) <= 0
}

const LOW_CONFIDENCE = 0.5

/** Derive the confidence signal for a field from its strongest ledger entry (docs §4.5). */
function deriveSignal(entry: LedgerEntry | undefined, commercial: boolean): ReviewSignal {
  if (commercial && isContradicted(entry)) return 'red'
  if (!entry) return 'amber' // no provenance -> not a verified fact -> amber (editable)
  const verifiedFact = entry.kind === 'fact' && !!entry.verifiedBy
  if (verifiedFact && (entry.confidence ?? 0) >= LOW_CONFIDENCE) return 'green'
  return 'amber'
}

// ── Field extraction from the draft (the generic walker) ──────────────────────────────

interface RawField {
  path: string
  label: string
  section: ReviewSectionKey
  value: string
  prose?: boolean
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** Flatten the known BusinessProfile scalar fields into RawField rows (schema §3.4). Lists
 *  (team/events/faq/reviews/media/socials) are not individually gated commercial facts, so
 *  they surface as summary rows; offerings expand because each carries a gated price. */
function extractFields(draft: BusinessProfile): RawField[] {
  const out: RawField[] = []
  const push = (f: RawField) => out.push(f)

  // Identity
  push({ path: 'name', label: 'Name', section: 'identity', value: str(draft.name) })
  if (draft.brandName) push({ path: 'brandName', label: 'Brand name', section: 'identity', value: str(draft.brandName) })
  push({ path: 'type', label: 'Type', section: 'identity', value: str(draft.type) || 'business' })
  if (draft.slug) push({ path: 'slug', label: 'Slug', section: 'identity', value: str(draft.slug) })
  if (draft.category) push({ path: 'category', label: 'Category', section: 'identity', value: str(draft.category) })
  if (draft.accent) push({ path: 'accent', label: 'Accent', section: 'identity', value: str(draft.accent) })

  // Story + about (prose)
  push({ path: 'tagline', label: 'Tagline', section: 'story', value: str(draft.tagline), prose: true })
  push({ path: 'about', label: 'About', section: 'story', value: str(draft.about), prose: true })
  push({ path: 'story', label: 'Story', section: 'story', value: str(draft.story), prose: true })

  // Contact + hours
  const c = draft.contact ?? {}
  push({ path: 'contact.address', label: 'Address', section: 'contact', value: str(c.address) })
  push({ path: 'contact.phone', label: 'Phone', section: 'contact', value: str(c.phone) })
  push({ path: 'contact.email', label: 'Email', section: 'contact', value: str(c.email) })
  push({ path: 'contact.website', label: 'Website', section: 'contact', value: str(c.website) })
  push({ path: 'contact.hours', label: 'Hours', section: 'contact', value: str(c.hours) })

  // Reputation
  if (draft.rating) {
    const v = [str(draft.rating.value), str(draft.rating.count) ? `(${str(draft.rating.count)})` : '']
      .filter(Boolean)
      .join(' ')
    push({ path: 'rating', label: 'Rating', section: 'reputation', value: v })
  }

  // Offerings — each expands so its gated price shows as its own row.
  ;(draft.offerings ?? []).forEach((o, i) => {
    const title = str(o.title) || `Offering ${i + 1}`
    push({ path: `offerings[${i}].title`, label: `${title} · title`, section: 'offerings', value: str(o.title) })
    if (o.blurb) push({ path: `offerings[${i}].blurb`, label: `${title} · blurb`, section: 'offerings', value: str(o.blurb), prose: true })
    const priceText = [
      o.priceModel ? String(o.priceModel) : '',
      typeof o.price === 'number' ? String(o.price) : '',
      o.currency ? String(o.currency) : '',
    ]
      .filter(Boolean)
      .join(' ')
    push({ path: `offerings[${i}].price`, label: `${title} · price`, section: 'offerings', value: priceText })
  })

  return out
}

// ── The model builder ─────────────────────────────────────────────────────────────────

const SECTION_META: Record<ReviewSectionKey, { title: string; desc: string }> = {
  identity: { title: 'Identity', desc: 'Name, type, and brand. The Space this becomes.' },
  story: { title: 'Story and about', desc: 'The reframed narrative. AI copy is marked and held until you confirm it.' },
  contact: { title: 'Contact and hours', desc: 'Commercial facts. Each needs a source or your confirm before it goes live.' },
  offerings: { title: 'Offerings', desc: 'What the business offers. Prices are held until a source clears them.' },
  reputation: { title: 'Reputation', desc: 'Ratings and reviews. Held until a source clears them.' },
  other: { title: 'Other', desc: 'Fields the research found that do not fit a standard section.' },
}

const SECTION_ORDER: ReviewSectionKey[] = ['identity', 'story', 'contact', 'offerings', 'reputation', 'other']

/**
 * Build the full review model for an intake from its draft + ledger. PURE. Empty commercial
 * fields still surface (so the operator sees what is missing / withheld); empty non-commercial
 * optional fields are dropped by extractFields already.
 */
export function buildReviewModel(draft: BusinessProfile, ledger: ProvenanceLedger): ReviewModel {
  const rows = extractFields(draft)
  const byKey = new Map<ReviewSectionKey, ReviewField[]>()

  let green = 0
  let amber = 0
  let red = 0
  let withheld = 0

  for (const raw of rows) {
    const entry = strongestEntry(ledger[raw.path])
    const commercial = isCommercialPath(raw.path)
    const generated = entry?.kind === 'generated' || entry?.kind === 'inferred'
    const signal = deriveSignal(entry, commercial)

    // Cleared-to-publish check mirrors the materializer's gate exactly.
    const cleared = commercial
      ? isCommercialFieldCleared(ledger[raw.path])
      : raw.prose
        ? // prose: publishes when a verified fact OR no ledger entry (hand-supplied)
          !ledger[raw.path]?.length || isCommercialFieldCleared(ledger[raw.path])
        : true
    const isWithheld = (commercial || !!raw.prose) && !cleared && !!raw.value
    const blocksApply = commercial && signal === 'red'

    if (signal === 'green') green++
    else if (signal === 'red') red++
    else amber++
    if (isWithheld) withheld++

    const field: ReviewField = {
      path: raw.path,
      label: raw.label,
      section: raw.section,
      value: raw.value,
      signal,
      generated,
      commercial,
      withheld: isWithheld,
      blocksApply,
      editable: true,
      ...(entry
        ? {
            provenance: {
              sourceUrl: entry.sourceUrl,
              snippet: entry.snippet,
              confidence: entry.confidence ?? 0,
              kind: entry.kind,
              verifiedBy: entry.verifiedBy,
            },
          }
        : {}),
    }
    const list = byKey.get(raw.section) ?? []
    list.push(field)
    byKey.set(raw.section, list)
  }

  const sections: ReviewSection[] = SECTION_ORDER.map((key) => ({
    key,
    title: SECTION_META[key].title,
    desc: SECTION_META[key].desc,
    fields: byKey.get(key) ?? [],
  })).filter((s) => s.fields.length > 0)

  return {
    sections,
    summary: {
      total: rows.length,
      green,
      amber,
      red,
      withheld,
      blocked: red > 0,
    },
  }
}

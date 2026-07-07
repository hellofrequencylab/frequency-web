// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the intake types + status machine (P1,
// docs/BUSINESS-IMPORTER.md §3). PURE + framework-independent (no React / Next /
// Supabase), so the harvest / extract / verify stages, the persistence layer, and the
// tests all import the SAME contract. The `business_intake` row (migration
// 20261022000000) carries these shapes as jsonb.
//
// P0 shipped BusinessProfile + ProvenanceLedger in ./schema. This file adds the OTHER
// halves of the staging record: the operator/owner INPUTS (§3.2), the raw HARVESTED
// SOURCES (§3.3), and the status machine (§3.5) the pipeline walks.
// ─────────────────────────────────────────────────────────────────────────────

// ── Intake inputs (docs §3.2) ─────────────────────────────────────────────────────

/** Social handles only — we NEVER store credentials (docs §7). A handle drives an
 *  oEmbed lookup + a web search; it is not a scrape key. */
export interface IntakeSocialHandles {
  instagram?: string
  facebook?: string
  linkedin?: string
  tiktok?: string
  youtube?: string
  x?: string
  other?: string[]
}

/** Optional operator nudges that seed the harvest queries and disambiguate the extract. */
export interface IntakeHints {
  name?: string
  category?: string
  city?: string
  type?: 'business' | 'nonprofit'
}

/** Consent (docs §7). `isDemo` decides the default publish posture (unlisted/draft demo vs
 *  an owner's real Space). `ownerConfirmed` is required before the Owner Wizard applies. */
export interface IntakeConsent {
  isDemo: boolean
  ownerConfirmed?: boolean
}

/** The captured inputs for one import (docs §3.2). Everything the front door collects. */
export interface IntakeInputs {
  websiteUrl?: string
  socialHandles?: IntakeSocialHandles
  pastedContent?: string
  hints?: IntakeHints
  consent?: IntakeConsent
}

// ── Harvested sources (docs §3.3) ─────────────────────────────────────────────────

/** The kind of a raw harvested source, one entry per fetch. */
export type HarvestedSourceKind =
  | 'page' //          a crawled website subpage (readable text)
  | 'search_result' // a web-search hit (title + snippet)
  | 'oembed' //        an oEmbed payload for a social handle / url
  | 'paste' //         the operator/owner pasted content block
  | 'og' //            open-graph / meta tags parsed from a page
  | 'image' //         an uploaded logo / hero / og image (site-media path)

/** One raw harvested source (docs §3.3). The `raw_sources[]` array is the harvest CACHE:
 *  Extract / Verify read only from here, so a re-run costs no new crawl. Every provenance
 *  citation the ledger records points back at one of these `url`s + `text` snippets. */
export interface HarvestedSource {
  id: string
  kind: HarvestedSourceKind
  /** The fetched url (absent for a paste). */
  url?: string
  fetchedAt: string
  title?: string
  /** Extracted readable text (a crawled subpage, a search snippet, the paste). */
  text?: string
  /** Trimmed html, kept ONLY for og/logo extraction (never fed to the model whole). */
  html?: string
  /** site-media path/url when kind==='image' (uploaded logo/hero/og). */
  mediaPath?: string
  /** og tags, oembed json, http status, content length, etc. */
  meta?: Record<string, unknown>
}

// ── Status machine (docs §3.5) ─────────────────────────────────────────────────────

/** The intake status machine: intake -> researching -> review -> applied, with `failed`
 *  as a recoverable side-state (docs §3.5). */
export type IntakeStatus = 'intake' | 'researching' | 'review' | 'applied' | 'failed'

export const INTAKE_STATUSES: readonly IntakeStatus[] = [
  'intake',
  'researching',
  'review',
  'applied',
  'failed',
]

/** Which front door produced the row. */
export type IntakeMode = 'operator' | 'owner'

/**
 * The legal forward transitions (docs §3.5). `failed` is reachable from any live stage and
 * is recoverable (re-run resumes from the last good status). PURE — used to guard writes so
 * a stale job can never march a row backward (e.g. a late harvest can't un-apply a Space).
 */
const ALLOWED_TRANSITIONS: Record<IntakeStatus, readonly IntakeStatus[]> = {
  intake: ['researching', 'failed'],
  researching: ['review', 'failed'],
  review: ['applied', 'researching', 'failed'], // review can re-run research (a forced refetch)
  applied: [], // terminal on the happy path; a re-apply stays 'applied'
  failed: ['researching', 'review'], // recoverable: resume research, or land partial results in review
}

/** Whether `next` is a legal transition from `current` (docs §3.5). A no-op (same status)
 *  is always allowed (idempotent writes). PURE. */
export function canTransition(current: IntakeStatus, next: IntakeStatus): boolean {
  if (current === next) return true
  return ALLOWED_TRANSITIONS[current]?.includes(next) ?? false
}

// ── The full staging row shape (jsonb columns typed) ───────────────────────────────

/** The typed view of a `business_intake` row (the table is not in database.types yet —
 *  ADR-246 — so the persistence layer reaches it with untyped casts and returns THIS shape). */
export interface BusinessIntakeRow {
  id: string
  createdBy: string
  mode: IntakeMode
  status: IntakeStatus
  inputs: IntakeInputs
  rawSources: HarvestedSource[]
  /** The extracted + reframed draft (a Partial BusinessProfile until Extract completes). */
  draft: Record<string, unknown>
  ledger: Record<string, unknown>
  budgetSpent: number
  targetSpaceId: string | null
  appliedAt: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV CONTACT IMPORT — the pipeline types + status machine (CRM Master Build Plan
// Phase 2). PURE + framework-independent (no React / Next / Supabase), so the parse
// / map / validate / preview / commit stages, the persistence layer, and the tests
// all import the SAME contract. The `contact_import` row (migration 20261159000000)
// carries these shapes as jsonb.
//
// Mirrors the business-importer intake contract (lib/importer/intake.ts): a staging
// record + a guarded status machine, so a stale job can never march a row backward.
// ─────────────────────────────────────────────────────────────────────────────

// ── Target canonical schema ─────────────────────────────────────────────────────

/** The canonical contact fields any CSV column can map onto. This is the CLOSED enum
 *  the auto-mapper and the AI assist are constrained to (the AI never invents a field);
 *  anything else becomes a custom field. Keys mirror the shared contact vocabulary
 *  (lib/connections/types.ts) so a mapped row projects straight onto createContact. */
export const TARGET_FIELDS = [
  'displayName',
  'email',
  'phone',
  'title',
  'company',
  'city',
  'website',
  'instagram',
  'linkedin',
  'x',
  'tags',
  'notes',
] as const

export type TargetField = (typeof TARGET_FIELDS)[number]

/** The two non-field mapping choices: send the column to a custom field, or drop it. */
export type MappingChoice = TargetField | 'custom' | 'ignore'

/** How a mapping was decided, weakest to strongest confidence signal. */
export type MappingReason = 'synonym' | 'fuzzy' | 'value' | 'ai' | 'manual' | 'none'

/** The inferred value type of a column, from a sample of its values. Drives type-aware
 *  formatting on the contact card (a date reads as a date, a phone dials, a url is a link)
 *  and light validation. `boolean` (yes/no) is auto-inferred; `select` (a fixed option set)
 *  is only ever chosen by hand, so it is never auto-inferred. */
export type ValueType = 'text' | 'number' | 'email' | 'phone' | 'url' | 'date' | 'boolean' | 'select'

// ── Column mapping ──────────────────────────────────────────────────────────────

/** One source column's decision: which target it maps to, how sure we are, and (when
 *  it becomes a custom field) the normalized key + inferred type it lands under. */
export interface ColumnMapping {
  /** The source CSV header, verbatim. */
  header: string
  /** The chosen target field, a custom field, or ignore. */
  target: MappingChoice
  /** 0..1 confidence in the AUTO choice (1 for a human/manual pick). */
  confidence: number
  /** Why this target was chosen (drives the "auto" vs "review" UI badge). */
  reason: MappingReason
  /** The inferred value type from the column's sample values. */
  valueType: ValueType
  /** When target='custom': the normalized custom-field key (e.g. 'lead_source'). This is the
   *  STABLE handle values are stored + segmented under; it never changes when the label is edited. */
  customKey?: string
  /** When target='custom': the human label the operator chose (e.g. 'Lead Source'). Defaults to
   *  the source header. Drives the registry label + the contact-detail display; the key is derived
   *  from it but pinned once chosen so a rename does not orphan stored values. */
  customLabel?: string
  /** When target='custom' and valueType='select': the fixed option set for the field. Optional;
   *  most custom fields are free text and carry none. */
  customOptions?: string[]
}

// ── Parsed source ───────────────────────────────────────────────────────────────

/** The parsed CSV staged on the row. Every value is a string (CSV has no types); the
 *  value-type inference + validation run over these. `rows` is capped on stage. */
export interface ParsedSource {
  headers: string[]
  rows: Record<string, string>[]
  rowCount: number
}

// ── Validation + dedupe (the dry-run preview) ────────────────────────────────────

/** One row-level problem. Never rejects the whole file: the row is flagged, the valid
 *  rows still import, and the summary counts the flags (row-level partial import). */
export interface RowError {
  /** 0-based index into the parsed rows. */
  rowIndex: number
  /** The field the problem is about ('email', 'displayName', ...) or 'row'. */
  field: string
  /** A short, plain, member-safe message ("That email address looks off."). */
  message: string
  /** How serious the problem is. 'error' (the default when omitted) means a field could not be
   *  used and was left blank; 'warning' means the row still imports as is, we just want a human to
   *  glance at it (a likely email typo, a same-name-and-phone near-duplicate). */
  severity?: 'error' | 'warning'
  /** For a warning with a fix in hand (an email typo): the value we would suggest. Never applied
   *  automatically; the operator keeps the original unless they act on it. */
  suggestion?: string
}

/** What committing WOULD do, per the current mapping + merge strategy. Shown in preview. */
export interface DiffCounts {
  /** New contacts that would be created. */
  created: number
  /** Existing contacts that would be merged into (by email/phone key). */
  merged: number
  /** Rows skipped (a within-file duplicate, an existing match under skip strategy, or
   *  a row with no usable identity). */
  skipped: number
  /** Rows with a validation problem (still counted toward created/merged when usable). */
  flagged: number
  /** Rows carrying a non-blocking warning but no hard error (a likely email typo, a same-name-and
   *  -phone near-duplicate). Import proceeds; the count just tells the operator how many to glance
   *  at. Optional so older staged validation results still type-check. */
  warned?: number
}

/** One line in the row-level preview table. Derived from the SAME planCommit output as
 *  `diff` (never a second pass), so the per-row list and the totals can never diverge.
 *  Member-safe: name/email only, never custom-field values. */
export interface PreviewRow {
  /** 0-based index into the parsed rows. */
  rowIndex: number
  /** What committing this row would do. */
  action: 'create' | 'merge' | 'skip'
  /** The row's projected display name (may be empty). */
  name: string
  /** The row's projected email (may be empty). */
  email: string
  /** For a merge or a duplicate skip: the existing email/phone key this row matched. */
  matchedKey: string | null
  /** The first validation problem on this row, if any (drives the "needs a look" flag). */
  error: string | null
  /** The severity of `error`: 'error' (a field was dropped) or 'warning' (imports as is, just
   *  glance at it). Null when the row is clean. Optional so older staged rows still type-check. */
  severity?: 'error' | 'warning' | null
}

/** The full dry-run result staged in `validation`. */
export interface ValidationResult {
  diff: DiffCounts
  errors: RowError[]
  /** The custom-field keys the current mapping would create/populate. */
  customKeys: string[]
  /** A capped per-row preview (create/merge/skip + match/error) for the review table. Optional so
   *  older staged rows still type-check; the UI shows a "+N more" line past the cap. */
  rows?: PreviewRow[]
  /** Total planned rows, so the UI can show how many are beyond the capped `rows`. */
  rowTotal?: number
}

// ── Merge strategy ───────────────────────────────────────────────────────────────

/** How an existing-contact match is resolved on commit. */
export type MergeStrategy = 'skip' | 'overwrite' | 'fill_empty'

export const MERGE_STRATEGIES: readonly MergeStrategy[] = ['skip', 'overwrite', 'fill_empty']

// ── Target ───────────────────────────────────────────────────────────────────────

/** Where the import lands (the membrane): a member's personal book, a Space's sealed
 *  list, or Frequency's OWN platform list (the ROOT-space contacts hub). Never more than
 *  one. Resolved + gated server-side before any write.
 *
 *  - `member`   -> the creator's personal `network_contacts` book.
 *  - `space`    -> one Space's sealed `contacts(space_id)`, gated to that Space's team.
 *  - `platform` -> Frequency's own list: `contacts` under the ROOT space, gated to staff.
 *    No Space picker (the fix for "the importer must not force a Space"). The membrane
 *    still holds: these are Frequency's unclaimed leads, not any tenant Space's list. */
export type ImportTarget =
  | { kind: 'member' }
  | { kind: 'space'; spaceId: string }
  | { kind: 'platform' }

export type ImportTargetKind = ImportTarget['kind']

// ── Commit outcome ───────────────────────────────────────────────────────────────

export interface CommitResult {
  created: number
  merged: number
  skipped: number
  failed: number
  total: number
}

// ── Status machine ───────────────────────────────────────────────────────────────

/** uploaded -> mapping -> preview -> committed, with `failed` a recoverable side-state. */
export type ImportStatus = 'uploaded' | 'mapping' | 'preview' | 'committed' | 'failed'

export const IMPORT_STATUSES: readonly ImportStatus[] = [
  'uploaded',
  'mapping',
  'preview',
  'committed',
  'failed',
]

const ALLOWED_TRANSITIONS: Record<ImportStatus, readonly ImportStatus[]> = {
  uploaded: ['mapping', 'failed'],
  mapping: ['preview', 'mapping', 'failed'],
  preview: ['committed', 'mapping', 'failed'], // preview can go back to remap
  committed: [], // terminal on the happy path; a re-commit stays 'committed'
  failed: ['mapping', 'preview'], // recoverable
}

/** Whether `next` is a legal transition from `current`. A no-op (same status) is always
 *  allowed (idempotent writes). PURE. */
export function canTransition(current: ImportStatus, next: ImportStatus): boolean {
  if (current === next) return true
  return ALLOWED_TRANSITIONS[current]?.includes(next) ?? false
}

// ── The full staging row shape (jsonb columns typed) ─────────────────────────────

/** The typed view of a `contact_import` row (not in database.types yet — ADR-246 — so
 *  the persistence layer reaches it with untyped casts and returns THIS shape). */
export interface ContactImportRow {
  id: string
  createdBy: string
  targetKind: ImportTargetKind
  targetSpaceId: string | null
  status: ImportStatus
  filename: string | null
  source: ParsedSource
  mapping: ColumnMapping[]
  validation: ValidationResult | Record<string, never>
  mergeStrategy: MergeStrategy
  result: CommitResult | Record<string, never>
  error: string | null
  committedAt: string | null
  createdAt: string
  updatedAt: string
  /** The ids of the contact rows this import CREATED (not merges), so a later "undo this import"
   *  deletes exactly those rows and nothing else. Empty until a commit runs. */
  createdIds: string[]
  /** When the import was rolled back (its created rows deleted), or null. */
  rolledBackAt: string | null
}

/** A known custom field in the registry (per owner/Space). */
export interface CustomFieldEntry {
  key: string
  label: string
  valueType: ValueType
  fingerprint: string | null
  /** For a 'select' field: the fixed option set. Empty for every other type. */
  options?: string[]
}

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

/** The inferred value type of a column, from a sample of its values. */
export type ValueType = 'text' | 'number' | 'email' | 'phone' | 'url' | 'date'

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
  /** When target='custom': the normalized custom-field key (e.g. 'lead_source'). */
  customKey?: string
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
}

/** The full dry-run result staged in `validation`. */
export interface ValidationResult {
  diff: DiffCounts
  errors: RowError[]
  /** The custom-field keys the current mapping would create/populate. */
  customKeys: string[]
}

// ── Merge strategy ───────────────────────────────────────────────────────────────

/** How an existing-contact match is resolved on commit. */
export type MergeStrategy = 'skip' | 'overwrite' | 'fill_empty'

export const MERGE_STRATEGIES: readonly MergeStrategy[] = ['skip', 'overwrite', 'fill_empty']

// ── Target ───────────────────────────────────────────────────────────────────────

/** Where the import lands (the membrane): a member's personal book, or a Space's sealed
 *  list. Never both. Resolved + gated server-side before any write. */
export type ImportTarget =
  | { kind: 'member' }
  | { kind: 'space'; spaceId: string }

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
}

/** A known custom field in the registry (per owner/Space). */
export interface CustomFieldEntry {
  key: string
  label: string
  valueType: ValueType
  fingerprint: string | null
}

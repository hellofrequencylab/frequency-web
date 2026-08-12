// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — the draft + ledger machinery (ADR-989).
//
// PURE + framework-independent (no React / Next / Supabase), so the stagers, the review
// action, the apply, and the tests all share it, and it is trivially unit-testable.
//
// Three jobs, and nothing else:
//   1. TURN A READ INTO A DRAFT  — an `ExtractedEvent` (the vision scan and the WhatsApp
//      classifier both yield one) becomes an `EventSeedDraft` keyed by the EVENT_MANIFEST
//      field paths. It is barely a translation, and that is the point: the manifest paths
//      were declared to BE the ExtractedEvent / EventDetails vocabulary.
//   2. SEED THE LEDGER           — record, per field, that a model read this value out of a
//      chat message and how sure it was. The event manifest declares verify:'none' and has
//      no commercial fields, so the ledger can never BLOCK an apply here. Its job is
//      honesty: mark what the AI wrote so an operator can confirm it on purpose.
//   3. READ / WRITE ONE PATH     — the review board edits a field by its ledger path, which
//      inside a repeat is indexed ('details.tickets[0].priceCents'). One generic walker
//      handles both shapes, so a new repeat in the manifest needs no code here.
// ─────────────────────────────────────────────────────────────────────────────

import type { LedgerEntry, ProvenanceLedger } from '@/lib/studio/kernel/ledger'
import type { FieldModel } from '@/lib/studio/kernel/review-kernel'
import { coerceEventExtraction } from '@/lib/events/normalize'
import type { EventDetails, EventLink, ExtractedEvent, FieldConfidence } from '@/lib/events/types'
import type { EventSeedDraft } from './intake'

// ── 1. A read becomes a draft ─────────────────────────────────────────────────────

/**
 * Coerce any extraction payload (the vision scan's, the chat classifier's, or one that came
 * back from a client and must be re-validated) into the staged draft.
 *
 * The scan-only fields are DROPPED on purpose: `cover` / `corners` / `quality` describe a
 * photograph of a poster, and a staged draft outlives whichever door it came through. The
 * poster image itself travels on the intake inputs, not in the draft.
 */
export function eventSeedDraftFromExtraction(raw: unknown): EventSeedDraft {
  const ex: ExtractedEvent = coerceEventExtraction(raw)
  return {
    title: ex.title,
    description: ex.description,
    startsAt: ex.startsAt,
    endsAt: ex.endsAt,
    location: ex.location,
    isFree: ex.isFree,
    priceCents: ex.priceCents,
    organizerName: ex.organizerName,
    organizerContact: ex.organizerContact,
    domain: ex.domain,
    tags: ex.tags,
    category: 'gathering',
    details: ex.details,
  }
}

/**
 * Fold extra links into a read's details, deduped on the URL, capped at the same 10 the
 * details coercer keeps. The links a poster prints and the links its QR codes encode are the
 * same field, and a booking link that arrives twice should not appear twice on the board.
 *
 * The scan door needs this because a QR pattern is the one thing the vision model cannot
 * read: only a browser can decode it, off the full-resolution photo, on the operator's own
 * device. Those URLs are therefore CLIENT-SUPPLIED, so the caller re-coerces them through
 * `coerceEventDetails` first and hands the cleaned rows here. PURE.
 */
export function mergePosterLinks(details: EventDetails, extra: readonly EventLink[]): EventDetails {
  if (extra.length === 0) return details
  const existing = details.links ?? []
  const seen = new Set(existing.map((l) => l.url))
  const added: EventLink[] = []
  for (const link of extra) {
    if (seen.has(link.url)) continue
    seen.add(link.url)
    added.push(link)
  }
  if (added.length === 0) return details
  return { ...details, links: [...existing, ...added].slice(0, 10) }
}

// ── 2. Seeding the ledger ─────────────────────────────────────────────────────────

/** A model that says it read a field clearly still only read it off a phone photo of a
 *  poster or out of a one-line chat message, so a 'high' never earns the full mark. */
const CONFIDENCE_VALUE: Record<FieldConfidence, number> = { high: 0.8, low: 0.35 }

/** The draft paths whose value the model WROTE rather than read (voice-canon prose). They
 *  are marked 'generated' so the board can flag them as AI copy. */
const GENERATED_PATHS = new Set(['description'])

/**
 * THE PATHS THIS DOOR CARRIES, in manifest order. ONE list, read by three things: the ledger
 * seeding below, the review board's field model, and the apply. That is deliberate.
 *
 * The event manifest declares the WHOLE entity, which is right: it also serves the Spark and
 * the edit rail, where a host sets the reach, the cadence, the venue address, and the cover.
 * A seeded event carries less. It goes through `createEventDraft`, which writes a draft with
 * a title, prose, times, a one-line place, a price, an organizer, a Domain, and the details
 * JSONB; everything else (where it lives, who can see it, the repeat cadence, the structured
 * address, the images) is settled later in the draft editor, at publish.
 *
 * So the board renders these rows and no others. Showing an operator a "Who can see it" row
 * whose edit the apply would silently drop is exactly the dishonesty the review board exists
 * to prevent. When the writer grows a field, add its path here and it appears on the board.
 */
export const SEEDED_FIELD_PATHS: readonly string[] = [
  'title',
  'description',
  'startsAt',
  'endsAt',
  'location',
  'isFree',
  'priceCents',
  'organizerName',
  'organizerContact',
  'domain',
  'details.features',
  'details.sponsors',
]

/** The repeat collections the manifest declares, and the leaf fields worth citing on each.
 *  Every one of them lives inside `details`, which the writer carries whole.
 *
 *  `rows` is how many rows that collection can ever hold: the SAME cap `coerceEventDetails`
 *  enforces, so the writable path list below is exactly as wide as a coerced draft and never
 *  wider. If a cap moves in lib/events/normalize.ts, move it here too. */
const SEEDED_REPEATS: { arrayPath: keyof EventDetails; fields: string[]; rows: number }[] = [
  { arrayPath: 'tickets', fields: ['label', 'priceCents', 'note'], rows: 8 },
  { arrayPath: 'lineup', fields: ['name', 'role', 'note'], rows: 24 },
  { arrayPath: 'schedule', fields: ['time', 'title', 'note'], rows: 24 },
  { arrayPath: 'links', fields: ['label', 'url'], rows: 10 },
  { arrayPath: 'other', fields: ['label', 'value'], rows: 16 },
]

/**
 * Build the provenance ledger for a freshly staged draft: one entry per populated field,
 * citing the source text it was read from.
 *
 * `kind` is 'inferred', not 'fact': a model reading a date out of a group chat is reasoning,
 * not citing, and saying so is the whole value of the ledger. Prose is 'generated'. Nothing
 * here is `verifiedBy` anything, so every field opens as "needs a look" (amber) until an
 * operator confirms it, which is the honest starting position for material lifted out of a
 * private chat. PURE.
 */
export function seedEventLedger(
  draft: EventSeedDraft,
  opts: { snippet?: string; confidence?: FieldConfidence } = {},
): ProvenanceLedger {
  const confidence = CONFIDENCE_VALUE[opts.confidence ?? 'high']
  const snippet = (opts.snippet ?? '').trim().slice(0, 400)
  const ledger: ProvenanceLedger = {}

  const record = (path: string) => {
    if (!readDraftValue(draft, path)) return
    const entry: LedgerEntry = {
      kind: GENERATED_PATHS.has(path) ? 'generated' : 'inferred',
      confidence,
      ...(snippet ? { snippet } : {}),
    }
    ledger[path] = [entry]
  }

  for (const path of SEEDED_FIELD_PATHS) record(path)

  for (const repeat of SEEDED_REPEATS) {
    const rows = draft.details?.[repeat.arrayPath]
    if (!Array.isArray(rows)) continue
    rows.forEach((_row, index) => {
      for (const leaf of repeat.fields) record(`details.${repeat.arrayPath}[${index}].${leaf}`)
    })
  }

  return ledger
}

/**
 * Promote one field's ledger entry to a verified HUMAN fact. An operator edit or confirm IS a
 * human confirmation, so the board's ✅ means a person vouched for it. Mirrors the Business
 * Seeder's confirmLedger. PURE (mutates the ledger it is handed).
 *
 * The path is resolved against the writable allowlist FIRST, and the resolved key is what indexes
 * the ledger. A path this board does not carry earns no entry: the ledger is a record of what the
 * apply will write, so a line for a field the apply drops would be a false receipt.
 */
export function confirmEventLedger(ledger: ProvenanceLedger, path: string, value: string): void {
  const key = canonicalSeededPath(path)
  if (key === null) return
  const prior = ledger[key]?.[0]
  ledger[key] = [
    {
      kind: 'fact',
      confidence: 1,
      verifiedBy: 'human',
      ...(prior?.sourceUrl ? { sourceUrl: prior.sourceUrl } : {}),
      ...(prior?.snippet ? { snippet: prior.snippet } : { snippet: value }),
    },
  ]
}

/** The repeat arrays the writer carries (inside `details`). A path under one of these is a
 *  seeded path whatever its index, so a new tier or act needs no new entry above. */
const SEEDED_REPEAT_PREFIXES = SEEDED_REPEATS.map((r) => `details.${String(r.arrayPath)}[`)

/** Whether one manifest field path is carried by this door. PURE + total. */
export function isSeededPath(path: string): boolean {
  if (SEEDED_FIELD_PATHS.includes(path)) return true
  return SEEDED_REPEAT_PREFIXES.some((prefix) => path.startsWith(prefix))
}

/**
 * THE PATHS THIS BOARD MAY WRITE, spelled out in full: every declared scalar path, plus every
 * (row, leaf) a repeat can hold up to the coercer's own cap. Finite and constant, built at load.
 *
 * This is the honest business rule before it is a security control. The apply carries exactly
 * these paths, so a write to any other path is a BUG: it would persist on the staged draft and
 * then be silently dropped at apply, which reads to an operator as "I edited that field and
 * lost it". Refusing is the truthful answer.
 *
 * It is also what makes the write PROVABLE. `canonicalSeededPath` hands back the allowlist's own
 * string, so the key that indexes the draft and the ledger is drawn from this list and never
 * from the request. CodeQL flagged both writes on this branch (remote property injection,
 * prototype-polluting assignment); a key that cannot carry request data closes them at the
 * source instead of hiding them.
 */
const SEEDED_WRITABLE_PATHS: readonly string[] = [
  ...SEEDED_FIELD_PATHS,
  ...SEEDED_REPEATS.flatMap((repeat) =>
    Array.from({ length: repeat.rows }).flatMap((_row, index) =>
      repeat.fields.map((leaf) => `details.${String(repeat.arrayPath)}[${index}].${leaf}`),
    ),
  ),
]

/** The same list as a Set, for the membership test. */
const SEEDED_WRITABLE_PATH_SET = new Set(SEEDED_WRITABLE_PATHS)

/**
 * Resolve a caller-supplied path to the IDENTICAL member of the writable allowlist, or null when
 * this board does not carry it (so `__proto__`, `constructor`, 'visibility', and a repeat row
 * past the cap all come back null).
 *
 * Two steps, on purpose. The Set is the membership test — the guard a reader (and a scanner) can
 * see. The `find` returns the allowlist's own string, so every caller writes with a key that came
 * from this module rather than from the operator's request. PURE + total.
 */
export function canonicalSeededPath(path: string): string | null {
  if (!SEEDED_WRITABLE_PATH_SET.has(path)) return null
  return SEEDED_WRITABLE_PATHS.find((allowed) => allowed === path) ?? null
}

/**
 * Narrow a manifest field model to the fields this door carries, re-deriving the roll-up so
 * the header counts what is actually on screen. Sections that empty out drop.
 *
 * This is a FILTER over the kernel's model, not a second field walker: every label, kind,
 * section, order, signal, and provenance line still comes from the manifest through
 * `buildFieldModel`. PURE.
 */
export function seededFieldsOnly(model: FieldModel): FieldModel {
  const sections = model.sections
    .map((s) => ({ ...s, fields: s.fields.filter((f) => isSeededPath(f.path)) }))
    .filter((s) => s.fields.length > 0)

  const all = sections.flatMap((s) => s.fields)
  return {
    sections,
    summary: {
      total: all.length,
      green: all.filter((f) => f.signal === 'green').length,
      amber: all.filter((f) => f.signal === 'amber').length,
      red: all.filter((f) => f.signal === 'red').length,
      withheld: all.filter((f) => f.withheld).length,
      blocked: all.some((f) => f.blocksApply),
    },
  }
}

// ── 3. Reading and writing one path ───────────────────────────────────────────────

/** Keys a path may never contain. `__proto__`, `constructor` and `prototype` all reach the object
 *  prototype, and the segment regex below happily matches them, so a path from a staged intake
 *  could otherwise walk there. Checked in `segments()` so EVERY reader and writer inherits it,
 *  `readDraftValue` and `at()` included, which the writable allowlist does not cover.
 *
 *  It is the SECOND line, not the only one: a write also has to survive `canonicalSeededPath`,
 *  which is the allowlist test standing immediately before the assignment. Both, on purpose.
 *  Consolidating this one upstream once removed the check at the write and the CodeQL alerts
 *  came straight back. */
const FORBIDDEN_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

/** Split a ledger path into its segments: 'details.tickets[0].label' -> ['details','tickets',0,'label'].
 *  PURE + total; an unparseable segment yields no segments, which every caller reads as a dead end. */
function segments(path: string): (string | number)[] {
  const out: (string | number)[] = []
  for (const part of path.split('.')) {
    const m = part.match(/^([A-Za-z_][\w]*)((?:\[\d+\])*)$/)
    if (!m) return []
    const key = m[1]
    if (FORBIDDEN_PATH_KEYS.has(key)) return []
    out.push(key)
    for (const idx of m[2].match(/\d+/g) ?? []) out.push(Number(idx))
  }
  return out
}

/** The paths whose value is a LIST rendered (and edited) as a comma-separated line. */
const LIST_PATHS = new Set(['tags', 'details.features', 'details.sponsors'])
/** The paths whose value is whole CENTS, edited as plain money ("25", "$12.50"). */
const MONEY_LEAF = /(^|\.)priceCents$/
/** The paths whose value is a plain integer. */
const INT_LEAF = /(^|\.)capacity$/
/** The paths whose value is a yes/no. */
const BOOL_PATHS = new Set(['isFree'])

/** Read one path off the draft as the text the review board edits. Arrays join, cents render
 *  as plain money, everything else is its scalar. PURE + total ('' at any dead end). */
export function readDraftValue(draft: Record<string, unknown> | EventSeedDraft, path: string): string {
  const value = at(draft as Record<string, unknown>, path)
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).join(', ')
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return MONEY_LEAF.test(path) ? centsToMoney(value) : String(value)
  if (typeof value === 'string') return value
  return ''
}

/** Walk a path off a record. PURE + total. */
function at(scope: Record<string, unknown>, path: string): unknown {
  const parts = segments(path)
  if (parts.length === 0) return undefined
  let cur: unknown = scope
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object') return undefined
    // String(part) indexes an object AND an array alike (arr['0'] is arr[0]).
    cur = (cur as Record<string, unknown>)[String(part)]
  }
  return cur
}

/** Whole cents as plain money ("$25", "$12.50"). Mirrors the manifest's own reader. PURE. */
function centsToMoney(cents: number): string {
  if (!Number.isFinite(cents)) return ''
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2)}`
}

/** Plain money to whole cents. "$12.50" -> 1250. null when it does not read as a number. PURE. */
function moneyToCents(raw: string): number | null {
  const n = Number(raw.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

/**
 * Write one path on the draft from the operator's typed text, coercing to the shape that path
 * holds (list, money, integer, yes/no, string). An EMPTY value clears the field: it is set to
 * '' for a string, null for a number, [] for a list, so the draft keeps its shape and the
 * board keeps showing the gap rather than the row vanishing.
 *
 * Returns false when the path does not resolve to an existing container (a stale board sending
 * a ticket tier that was already dropped), so the caller can report it instead of writing a
 * new nested object out of thin air. PURE (mutates the draft it is handed).
 *
 * It returns false FIRST for any path outside the writable allowlist, and then works only with
 * the allowlist's own string: `key` is resolved before the walk, so the container it reaches and
 * the leaf it assigns are both derived from this module's constants rather than from the
 * operator's request. That is the allowlist test at the write, and it is the business rule too
 * (see SEEDED_WRITABLE_PATHS): the apply carries these paths and no others.
 */
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isUnsafeObjectKey(key: string): boolean {
  return UNSAFE_OBJECT_KEYS.has(key)
}

export function setDraftValue(draft: Record<string, unknown>, path: string, raw: string): boolean {
  const key = canonicalSeededPath(path)
  if (key === null) return false

  const parts = segments(key)
  if (parts.length === 0) return false

  let cur: unknown = draft
  for (const part of parts.slice(0, -1)) {
    if (cur === null || typeof cur !== 'object') return false
    cur = (cur as Record<string, unknown>)[String(part)]
  }
  if (cur === null || typeof cur !== 'object') return false

  const container = cur as Record<string, unknown>
  const leaf = String(parts[parts.length - 1])
  if (isUnsafeObjectKey(leaf)) return false
  const value = raw.trim()

  if (LIST_PATHS.has(key)) {
    container[leaf] = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []
    return true
  }
  if (BOOL_PATHS.has(key)) {
    container[leaf] = /^(y|yes|true|free|1)$/i.test(value)
    return true
  }
  if (MONEY_LEAF.test(key)) {
    container[leaf] = value ? moneyToCents(value) : null
    return true
  }
  if (INT_LEAF.test(key)) {
    const n = Number(value)
    container[leaf] = value && Number.isFinite(n) && n > 0 ? Math.round(n) : null
    return true
  }
  container[leaf] = value
  return true
}

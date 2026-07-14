// ─────────────────────────────────────────────────────────────────────────────
// DEDUPE + PROJECTION + THE DRY-RUN DIFF (CRM Master Build Plan Phase 2) — PURE +
// unit-tested. Turns the parsed rows + the column mapping into:
//   • projectRow      — one CSV row -> a canonical contact shape + its custom fields.
//   • validateRow     — row-level, partial-import errors (never rejects the file).
//   • planCommit      — dedupe (email then last-10 phone) INTERNAL + cross-DB, choose
//                       create / merge / skip per the merge strategy, and produce the
//                       { created, merged, skipped, flagged } diff shown in the preview.
//
// The dedupe keys mirror lib/integrations/google/import.ts + existingContactKeys in the
// store so the CSV path and the Google path compare identically. No I/O, no framework.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ColumnMapping,
  TargetField,
  RowError,
  DiffCounts,
  ValidationResult,
  MergeStrategy,
} from './types'

// ── Keys (mirror existingContactKeys / phoneKey exactly) ─────────────────────────

/** Lowercased, trimmed email key, or null. */
export function emailKey(email: string | null | undefined): string | null {
  const s = (email ?? '').trim().toLowerCase()
  return s || null
}

/** Last-10-digits phone key, or null. Mirrors phoneKey in lib/integrations/google/import.ts. */
export function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D+/g, '')
  if (!digits) return null
  return digits.length > 10 ? digits.slice(-10) : digits
}

// ── Projection: a mapped row -> a canonical contact ──────────────────────────────

/** The canonical contact a row projects to. Named fields mirror the shared contact
 *  vocabulary; `custom` carries the passthrough columns (custom-field key -> value);
 *  `tags` are split from a tags column. */
export interface ProjectedContact {
  displayName: string
  email: string
  phone: string
  title: string
  company: string
  city: string
  website: string
  socials: { instagram?: string; linkedin?: string; x?: string }
  tags: string[]
  notes: string
  custom: Record<string, string>
}

const SOCIAL_FIELDS = new Set<TargetField>(['instagram', 'linkedin', 'x'])
const SCALAR_FIELDS = new Set<TargetField>([
  'displayName', 'email', 'phone', 'title', 'company', 'city', 'website',
])

function clean(v: string | undefined, max = 300): string {
  return (v ?? '').trim().slice(0, max)
}

/** Split a tags cell on the common CSV separators (comma / semicolon / pipe). */
export function splitTags(raw: string | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of (raw ?? '').split(/[,;|]/)) {
    const tag = t.trim().slice(0, 40)
    if (!tag) continue
    const k = tag.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(tag)
  }
  return out
}

/** Project ONE parsed row through the mapping into a canonical contact. A `tags`/`notes`
 *  column can appear more than once (concatenated). Custom columns land under their key. */
export function projectRow(row: Record<string, string>, mapping: ColumnMapping[]): ProjectedContact {
  const c: ProjectedContact = {
    displayName: '', email: '', phone: '', title: '', company: '', city: '', website: '',
    socials: {}, tags: [], notes: '', custom: {},
  }
  for (const m of mapping) {
    if (m.target === 'ignore') continue
    const value = clean(row?.[m.header])
    if (m.target === 'custom') {
      if (value && m.customKey) {
        // Concatenate if the same custom key appears twice.
        c.custom[m.customKey] = c.custom[m.customKey] ? `${c.custom[m.customKey]} ${value}` : value
      }
      continue
    }
    const field = m.target as TargetField
    if (field === 'tags') {
      for (const t of splitTags(value)) if (!c.tags.includes(t)) c.tags.push(t)
    } else if (field === 'notes') {
      c.notes = c.notes ? `${c.notes}\n${value}`.trim() : value
    } else if (SOCIAL_FIELDS.has(field)) {
      if (value) c.socials[field as 'instagram' | 'linkedin' | 'x'] = value
    } else if (SCALAR_FIELDS.has(field)) {
      // First non-empty wins for a scalar (e.g. two name columns concatenated below).
      if (field === 'displayName') {
        c.displayName = c.displayName ? `${c.displayName} ${value}`.trim() : value
      } else if (!c[field as 'email' | 'phone' | 'title' | 'company' | 'city' | 'website']) {
        c[field as 'email' | 'phone' | 'title' | 'company' | 'city' | 'website'] =
          field === 'email' ? value.toLowerCase() : value
      }
    }
  }
  c.email = c.email.toLowerCase()
  return c
}

// ── Validation (row-level, partial import) ───────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Validate a projected row. A row with NEITHER a name, email, nor phone has no identity
 *  and is unusable (skipped). A malformed email is flagged but the row still imports
 *  (the bad address is dropped, not the row). Returns [] for a clean row. */
export function validateRow(c: ProjectedContact, rowIndex: number): RowError[] {
  const errors: RowError[] = []
  const hasIdentity = !!(c.displayName || c.email || c.phone)
  if (!hasIdentity) {
    errors.push({ rowIndex, field: 'row', message: 'No name, email, or phone. Nothing to import from this row.' })
    return errors
  }
  if (c.email && !EMAIL_RE.test(c.email)) {
    errors.push({ rowIndex, field: 'email', message: 'That email address looks off. It will be left blank.' })
  }
  if (c.phone) {
    const digits = c.phone.replace(/\D+/g, '')
    if (digits.length < 7) {
      errors.push({ rowIndex, field: 'phone', message: 'That phone number looks too short. It will be left blank.' })
    }
  }
  return errors
}

/** Whether a row can be imported at all (has some identity). */
export function isImportable(c: ProjectedContact): boolean {
  return !!(c.displayName || c.email || c.phone)
}

// ── The dry-run plan (dedupe + create/merge/skip) ────────────────────────────────

export type RowAction = 'create' | 'merge' | 'skip'

export interface PlannedRow {
  rowIndex: number
  action: RowAction
  contact: ProjectedContact
  /** The existing key this row merged against (for the commit path), when action='merge'. */
  matchedKey: string | null
}

export interface CommitPlan {
  rows: PlannedRow[]
  diff: DiffCounts
  errors: RowError[]
  customKeys: string[]
}

/** The existing contact keys to dedupe against (from existingContactKeys or a Space read). */
export interface ExistingKeys {
  emails: Set<string>
  phones: Set<string>
}

/**
 * Plan a commit over every parsed row. Dedupe is TWO-LAYER:
 *   • cross-DB   — a row whose email or phone matches an EXISTING contact is a merge
 *                  (or a skip under the 'skip' strategy).
 *   • internal   — a row whose key was already SEEN earlier in this same file is a skip
 *                  (the first occurrence wins), so a re-import is idempotent.
 * Rows with no identity are skipped and flagged. PURE: the commit layer executes the plan.
 */
export function planCommit(
  rows: Record<string, string>[],
  mapping: ColumnMapping[],
  existing: ExistingKeys,
  strategy: MergeStrategy,
): CommitPlan {
  const planned: PlannedRow[] = []
  const errors: RowError[] = []
  const seenEmail = new Set<string>()
  const seenPhone = new Set<string>()
  const customKeys = new Set<string>()
  for (const m of mapping) if (m.target === 'custom' && m.customKey) customKeys.add(m.customKey)

  let created = 0
  let merged = 0
  let skipped = 0
  let flagged = 0

  rows.forEach((raw, rowIndex) => {
    const contact = projectRow(raw, mapping)
    const rowErrors = validateRow(contact, rowIndex)
    if (rowErrors.length) {
      errors.push(...rowErrors)
      flagged++
    }

    if (!isImportable(contact)) {
      planned.push({ rowIndex, action: 'skip', contact, matchedKey: null })
      skipped++
      return
    }

    // Drop a malformed email so it neither dedupes nor persists (the row still imports).
    const ek = EMAIL_RE.test(contact.email) ? emailKey(contact.email) : null
    if (!ek) contact.email = ''
    const pk = phoneKey(contact.phone)

    // INTERNAL dedupe: this key already appeared earlier in the file.
    if ((ek && seenEmail.has(ek)) || (pk && seenPhone.has(pk))) {
      planned.push({ rowIndex, action: 'skip', contact, matchedKey: ek ?? pk })
      skipped++
      return
    }

    // CROSS-DB dedupe: matches a contact already in the target list.
    const existingMatch = (ek && existing.emails.has(ek)) || (pk && existing.phones.has(pk))
    if (existingMatch) {
      if (strategy === 'skip') {
        planned.push({ rowIndex, action: 'skip', contact, matchedKey: ek ?? pk })
        skipped++
      } else {
        planned.push({ rowIndex, action: 'merge', contact, matchedKey: ek ?? pk })
        merged++
      }
    } else {
      planned.push({ rowIndex, action: 'create', contact, matchedKey: null })
      created++
    }

    if (ek) seenEmail.add(ek)
    if (pk) seenPhone.add(pk)
  })

  const diff: DiffCounts = { created, merged, skipped, flagged }
  return { rows: planned, diff, errors, customKeys: [...customKeys] }
}

/** The preview-facing slice of a plan (what gets staged in `validation`). */
export function toValidationResult(plan: CommitPlan): ValidationResult {
  return { diff: plan.diff, errors: plan.errors, customKeys: plan.customKeys }
}

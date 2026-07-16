// ─────────────────────────────────────────────────────────────────────────────
// SMART AUTO-MAP (CRM Master Build Plan Phase 2) — PURE + unit-tested. Given a CSV's
// headers and a sample of its rows, decide for each column which canonical target
// field it maps onto, with a per-column confidence score. Layered, weakest signal to
// strongest:
//   1. header normalize      — lowercase, strip punctuation, collapse.
//   2. synonym dictionary    — a curated alias table (email/phone/name/company/...).
//   3. fuzzy match           — Dice bigram similarity against each field's aliases.
//   4. value/type inference  — what do the column's VALUES look like (email/phone/url)?
//   5. confidence gate       — auto-apply >= AUTO, pre-fill >= PREFILL, else leave open.
//
// No I/O, no model call, no framework. The AI assist (lib/crm/import/ai.ts) is a
// SEPARATE, optional layer that only runs on the columns this leaves low-confidence.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TARGET_FIELDS,
  type TargetField,
  type MappingChoice,
  type ColumnMapping,
  type MappingReason,
  type ValueType,
} from './types'

// ── Confidence gates (the auto-apply thresholds) ────────────────────────────────

/** >= AUTO: apply the mapping automatically (a confident synonym / value hit). */
export const AUTO_THRESHOLD = 0.8
/** >= PREFILL: pre-select the guess but flag it for review. */
export const PREFILL_THRESHOLD = 0.5

// ── 1. Header normalize ─────────────────────────────────────────────────────────

/** Lowercase, strip everything but alphanumerics, collapse. 'E-Mail Address' -> 'emailaddress'. */
export function normalizeHeader(raw: string): string {
  return (raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** A stable, order-independent key for a custom field, from a header. 'Lead Source' ->
 *  'lead_source'. Snake-cased, punctuation collapsed, length-capped. */
export function customFieldKey(raw: string): string {
  const s = (raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
  return s || 'field'
}

// ── 2. Synonym dictionary ───────────────────────────────────────────────────────

/** Normalized aliases per target field. First-class synonyms score as a confident hit;
 *  they also seed the fuzzy matcher. Keep additions lowercase + already-normalized. */
const SYNONYMS: Record<TargetField, string[]> = {
  displayName: [
    'name', 'fullname', 'contactname', 'displayname', 'person', 'contact',
    'firstname', 'lastname', 'givenname', 'surname', 'firstlast',
    // Contacts-export dialects: Google (Given/Family Name), Outlook (First/Last Name),
    // Apple/iCloud vCard-CSV (Formatted Name). These are name PARTS that join (see below).
    'familyname', 'middlename', 'formattedname',
  ],
  email: [
    'email', 'emailaddress', 'mail', 'emailid', 'workemail', 'primaryemail', 'contactemail',
    // Google Contacts ("E-mail 1 - Value" / "E-mail 2 - Value"), Apple vCard-CSV home email.
    'email1value', 'email2value', 'homeemail',
  ],
  phone: [
    'phone', 'phonenumber', 'mobile', 'cell', 'cellphone', 'tel', 'telephone', 'mobilephone', 'contactnumber', 'number',
    // Google Contacts ("Phone 1 - Value"), Outlook ("Home Phone").
    'phone1value', 'homephone',
  ],
  title: ['title', 'jobtitle', 'role', 'position', 'jobrole', 'designation'],
  company: [
    'company', 'companyname', 'organization', 'organisation', 'org', 'business', 'employer', 'account',
    // Google Contacts ("Organization Name" / "Organization 1 - Name").
    'organizationname', 'organization1name',
  ],
  city: ['city', 'town', 'location', 'cityname', 'locality'],
  website: ['website', 'web', 'url', 'site', 'homepage', 'weburl', 'link'],
  instagram: ['instagram', 'ig', 'insta', 'instagramhandle'],
  linkedin: ['linkedin', 'linkedinurl', 'li', 'linkedinprofile'],
  x: ['x', 'twitter', 'twitterhandle', 'xhandle'],
  tags: ['tags', 'tag', 'labels', 'segments', 'lists', 'groups', 'interests'],
  notes: ['notes', 'note', 'comment', 'comments', 'description', 'remarks', 'about', 'bio'],
}

/** Normalized headers that are name PARTS (first/last/given/family/middle) rather than a single
 *  full-name column. When a file carries only these (no Name/Full Name column), they are ALL kept
 *  as displayName so projectRow composes the full name from them (the name-join). */
const NAME_PART_ALIASES = new Set<string>([
  'firstname', 'givenname', 'lastname', 'familyname', 'surname', 'middlename',
])

/** Exact normalized-synonym lookup: normalized header -> field. Built once. */
const SYNONYM_INDEX: Map<string, TargetField> = (() => {
  const m = new Map<string, TargetField>()
  for (const field of TARGET_FIELDS) {
    for (const alias of SYNONYMS[field]) {
      // First writer wins so the most canonical alias for a token is stable.
      if (!m.has(alias)) m.set(alias, field)
    }
  }
  return m
})()

// ── 3. Fuzzy match (Dice coefficient over character bigrams) ─────────────────────

function bigrams(s: string): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

/** Sorensen-Dice similarity of two normalized strings, 0..1. Cheap + dependency-free. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bg = bigrams(a)
  const counts = new Map<string, number>()
  for (const g of bg) counts.set(g, (counts.get(g) ?? 0) + 1)
  let overlap = 0
  const bbg = bigrams(b)
  for (const g of bbg) {
    const c = counts.get(g) ?? 0
    if (c > 0) {
      counts.set(g, c - 1)
      overlap++
    }
  }
  return (2 * overlap) / (bg.length + bbg.length)
}

/** Best fuzzy field for a normalized header: highest Dice similarity against any alias. */
function bestFuzzy(normHeader: string): { field: TargetField; score: number } | null {
  let best: { field: TargetField; score: number } | null = null
  for (const field of TARGET_FIELDS) {
    for (const alias of SYNONYMS[field]) {
      const score = diceSimilarity(normHeader, alias)
      if (!best || score > best.score) best = { field, score }
    }
  }
  return best
}

// ── 4. Value / type inference ────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}([t ]\d{2}:\d{2})?|^\d{1,2}\/\d{1,2}\/\d{2,4}$/i

/** Digits-only length in the phone range, tolerant of +, (), -, spaces. */
function looksLikePhone(v: string): boolean {
  const digits = v.replace(/[^\d]/g, '')
  return digits.length >= 7 && digits.length <= 15 && /^[+()\d\s.-]+$/.test(v)
}

/** Infer a column's value type from a sample of its non-empty values (majority vote). */
export function inferValueType(values: string[]): ValueType {
  const samples = values.map((v) => (v ?? '').trim()).filter(Boolean).slice(0, 20)
  if (!samples.length) return 'text'
  const tally: Record<ValueType, number> = { text: 0, number: 0, email: 0, phone: 0, url: 0, date: 0 }
  for (const v of samples) {
    if (EMAIL_RE.test(v)) tally.email++
    else if (looksLikePhone(v)) tally.phone++
    else if (URL_RE.test(v)) tally.url++
    else if (DATE_RE.test(v)) tally.date++
    else if (/^-?\d+(\.\d+)?$/.test(v)) tally.number++
    else tally.text++
  }
  // A typed column needs a clear majority; otherwise it is free text.
  let winner: ValueType = 'text'
  let max = 0
  for (const t of Object.keys(tally) as ValueType[]) {
    if (t === 'text') continue
    if (tally[t] > max) {
      max = tally[t]
      winner = t
    }
  }
  return max >= Math.ceil(samples.length * 0.6) ? winner : 'text'
}

/** The target a value type strongly implies (email column -> email field, etc.). */
const VALUE_TYPE_FIELD: Partial<Record<ValueType, TargetField>> = {
  email: 'email',
  phone: 'phone',
  url: 'website',
}

// ── 5. Per-column decision ───────────────────────────────────────────────────────

/** Collect a column's sample values across the sample rows. */
function columnValues(header: string, rows: Record<string, string>[]): string[] {
  return rows.map((r) => r?.[header] ?? '')
}

/**
 * Decide ONE column's mapping. Layered: an exact synonym is the strongest signal, then
 * value-type agreement boosts it; a fuzzy hit is mid-confidence; a value type alone can
 * still map email/phone/url even when the header is opaque. Everything else stays 'custom'
 * at low confidence (the user keeps it as a custom field or ignores it).
 */
export function mapColumn(header: string, rows: Record<string, string>[]): ColumnMapping {
  const norm = normalizeHeader(header)
  const valueType = inferValueType(columnValues(header, rows))
  const valueField = VALUE_TYPE_FIELD[valueType]

  let target: MappingChoice = 'custom'
  let confidence = 0
  let reason: MappingReason = 'none'

  const synonym = norm ? SYNONYM_INDEX.get(norm) : undefined
  if (synonym) {
    target = synonym
    reason = 'synonym'
    // A synonym is strong; agreement with the column's value type pins it near-certain.
    confidence = valueField && valueField === synonym ? 0.99 : 0.9
  } else {
    const fuzzy = norm ? bestFuzzy(norm) : null
    if (fuzzy && fuzzy.score >= 0.6) {
      target = fuzzy.field
      reason = 'fuzzy'
      confidence = 0.5 + (fuzzy.score - 0.6) * 1.0 // 0.6->0.5 .. 1.0->0.9
      // A fuzzy guess that agrees with the value type is more trustworthy.
      if (valueField && valueField === fuzzy.field) confidence = Math.max(confidence, 0.85)
    } else if (valueField) {
      // The header is opaque but the VALUES are unmistakably an email/phone/url.
      target = valueField
      reason = 'value'
      confidence = 0.8
    }
  }

  const mapping: ColumnMapping = { header, target, confidence: round(confidence), reason, valueType }
  if (target === 'custom') mapping.customKey = customFieldKey(header)
  return mapping
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

// ── The whole-file auto-map ──────────────────────────────────────────────────────

/**
 * Auto-map every column. Resolves COLLISIONS: if two columns both claim the same target,
 * the higher-confidence one keeps it and the loser falls back to a custom field (a CSV
 * can carry both "First Name" and "Last Name" — only one becomes displayName; the other
 * is kept as a custom field the user can re-point). Remembered mappings (by header
 * fingerprint) are applied by the caller BEFORE showing the UI; this is the cold path.
 */
export function autoMapColumns(headers: string[], sampleRows: Record<string, string>[]): ColumnMapping[] {
  const initial = headers.map((h) => mapColumn(h, sampleRows))

  // Keep only the strongest claim per named target field; demote the rest to custom.
  const bestByField = new Map<TargetField, number>() // field -> index of the winner
  initial.forEach((m, i) => {
    if (m.target === 'custom' || m.target === 'ignore') return
    const field = m.target as TargetField
    const prev = bestByField.get(field)
    if (prev === undefined || m.confidence > initial[prev].confidence) {
      bestByField.set(field, i)
    }
  })

  // Name-join: which displayName columns to keep. Separate first/last (or given/family) columns
  // are ALL kept so projectRow composes the full name; a single full-name column (Name, Full Name)
  // wins over the parts, so we never double-map when both are present.
  const displayNameKeepers = resolveDisplayNameKeepers(initial)

  const demote = (m: ColumnMapping): ColumnMapping => ({
    ...m,
    target: 'custom' as MappingChoice,
    reason: 'none' as MappingReason,
    confidence: 0,
    customKey: customFieldKey(m.header),
  })

  return initial.map((m, i) => {
    if (m.target === 'custom' || m.target === 'ignore') return m
    const field = m.target as TargetField
    // `tags`/`notes` may legitimately repeat (concatenated), so never demote those.
    if (field === 'tags' || field === 'notes') return m
    // displayName can repeat when the columns are name parts that join (given + family, etc.).
    if (field === 'displayName') return displayNameKeepers.has(i) ? m : demote(m)
    if (bestByField.get(field) === i) return m
    // A weaker duplicate claim -> keep the data as a custom field.
    return demote(m)
  })
}

/** Which displayName-claiming columns to keep. If any full-name column is present it alone wins
 *  (the name parts fall back to custom fields); otherwise every name-part column is kept so
 *  projectRow composes the full name from them (the name-join). */
function resolveDisplayNameKeepers(initial: ColumnMapping[]): Set<number> {
  const claims = initial.flatMap((m, i) => (m.target === 'displayName' ? [i] : []))
  if (claims.length <= 1) return new Set(claims)
  const fullNames = claims.filter((i) => !NAME_PART_ALIASES.has(normalizeHeader(initial[i].header)))
  if (fullNames.length) {
    // Keep the single most confident full-name column; the parts become custom fields.
    const winner = fullNames.reduce((a, b) => (initial[a].confidence >= initial[b].confidence ? a : b))
    return new Set([winner])
  }
  // Only name parts -> keep them all so they join into one displayName.
  return new Set(claims)
}

// ── Header fingerprint (remembered mappings) ─────────────────────────────────────

/** A stable, order-independent fingerprint of a header SET, so a later upload of the
 *  same shaped file can pre-fill the remembered mapping. Normalized + sorted + joined. */
export function headerFingerprint(headers: string[]): string {
  return headers
    .map(normalizeHeader)
    .filter(Boolean)
    .sort()
    .join('|')
}

/** True when a mapping is confident enough to auto-apply without review. */
export function isAutoApplied(m: ColumnMapping): boolean {
  return m.target !== 'custom' && m.target !== 'ignore' && m.confidence >= AUTO_THRESHOLD
}

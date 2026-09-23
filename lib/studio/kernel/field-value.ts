// ─────────────────────────────────────────────────────────────────────────────
// THE STUDIO KERNEL: one value against one declared field (docs/STUDIO.md, ADR-986).
//
// `validateManifest` says whether a DECLARATION is well formed. Nothing in the kernel said whether
// a VALUE fits a declaration: every surface that took a value from outside (a form, a model, a
// browser) re-derived "is this one of the select's options" and "is this a boolean" for itself, or
// did not check at all. This is that check, written once from the field's own `kind`, `options` and
// `required`, so a surface that hands in a manifest field never writes a per-field rule of its own.
//
// It is a SHAPE check, not the product's write validation. A `text` value that fits here can still
// be refused by the entity's own parser (a title too long, a time that is not HH:MM); the kernel
// knows kinds, not columns, and the parser stays the gate on the write. What this settles is the
// part that IS the manifest's to settle: the kind, the closed option set, and whether empty is
// allowed.
//
// PURE + entity-blind, like the rest of the kernel: no React, no Next, no Supabase, and never an
// import from lib/studio/entities. Total: it returns a problem sentence rather than throwing.
// ─────────────────────────────────────────────────────────────────────────────

import { REPEAT_ITEM_SELF, repeatLabel, type FieldDef, type FieldKind, type RepeatDef } from './manifest'

/** A value one scalar field can hold once checked. `null` is "cleared". */
export type ScalarFieldValue = string | number | boolean | null

/** One row of a repeat, keyed by the repeat's own field paths (or REPEAT_ITEM_SELF for a scalar). */
export type RepeatRowValue = Record<string, ScalarFieldValue>

/** What a caller needs to declare for the check: the field's identity and its constraints. */
export type CheckableField = Pick<FieldDef, 'label' | 'kind' | 'options' | 'optionsFrom' | 'required'>

/** Kinds whose value is a LIST, which is never one scalar. A caller that wants to set one hands in
 *  the whole collection through a repeat or a dedicated control, not through this check. */
const LIST_KINDS: readonly FieldKind[] = ['tags', 'multiselect', 'images']
const NUMBER_KINDS: readonly FieldKind[] = ['number', 'price', 'rating', 'duration']

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/\S+$/i

function isRealDay(value: string): boolean {
  const m = DAY_RE.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

function isEmpty(raw: unknown): boolean {
  return raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')
}

/**
 * Check one value against one declared field. PURE and total.
 *
 *  - empty (undefined, null, blank string) clears the field unless it is `required` or a `toggle`,
 *    which is on or off and never nothing;
 *  - a `select` with declared `options` takes exactly one of their values; one that loads its
 *    options (`optionsFrom`) takes any non-empty string, because the surface holds the rows;
 *  - a `toggle` takes a boolean, a number kind a finite number, a list kind nothing at all;
 *  - `url`, `email` and `date` are checked to their shape; every other kind takes trimmed text.
 *
 * The problem sentence names the field by its LABEL, never its path: it is read by a person.
 */
export function checkFieldValue(def: CheckableField, raw: unknown): { value: ScalarFieldValue } | { problem: string } {
  const label = def.label
  if (LIST_KINDS.includes(def.kind)) return { problem: `${label} holds a list, not one value.` }
  if (def.kind === 'toggle') {
    return typeof raw === 'boolean' ? { value: raw } : { problem: `${label} is on or off (true or false).` }
  }
  if (isEmpty(raw)) {
    return def.required ? { problem: `${label} cannot be empty.` } : { value: null }
  }
  if (NUMBER_KINDS.includes(def.kind)) {
    return typeof raw === 'number' && Number.isFinite(raw) ? { value: raw } : { problem: `${label} needs a number.` }
  }
  if (typeof raw !== 'string') return { problem: `${label} needs text.` }
  const text = raw.trim()
  switch (def.kind) {
    case 'select':
    case 'reference':
      if (def.options) {
        const hit = def.options.find((o) => o.value === text)
        if (!hit) return { problem: `${label} must be one of: ${def.options.map((o) => o.label).join(', ')}.` }
        return { value: hit.value }
      }
      return { value: text }
    case 'url':
      return URL_RE.test(text) ? { value: text } : { problem: `${label} needs a full web address starting with http.` }
    case 'email':
      return EMAIL_RE.test(text) ? { value: text } : { problem: `${label} needs an email address.` }
    case 'date':
      return isRealDay(text) ? { value: text } : { problem: `${label} needs a real day, written YYYY-MM-DD.` }
    case 'datetime':
      return Number.isFinite(Date.parse(text)) ? { value: text } : { problem: `${label} needs a date and time.` }
    default:
      return { value: text }
  }
}

/**
 * Check one row against a repeat's declared fields. PURE and total. The row must be a plain
 * object whose keys are all declared paths (a key the repeat never declared is refused rather
 * than dropped, so a typo cannot pass as an empty field), and at least one value must be set. A
 * repeat over bare scalars takes the scalar itself and keys it at REPEAT_ITEM_SELF. A keyed map
 * has no row to add, so it is refused; the caller edits the entry it means by its own key.
 */
export function checkRepeatRow(repeat: RepeatDef, raw: unknown): { row: RepeatRowValue } | { problem: string } {
  const label = repeatLabel(repeat)
  if (repeat.over === 'map') return { problem: `${label} is keyed by name, so a row cannot be added to it.` }
  const self = repeat.fields.find((f) => f.path === REPEAT_ITEM_SELF)
  if (self) {
    const one = checkFieldValue(self, raw)
    if ('problem' in one) return one
    if (one.value === null) return { problem: `${label} needs a value.` }
    return { row: { [REPEAT_ITEM_SELF]: one.value } }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { problem: `${label} takes a row with ${repeat.fields.map((f) => f.path).join(' and ')}.` }
  }
  const rec = raw as Record<string, unknown>
  const declared = new Set(repeat.fields.map((f) => f.path))
  for (const key of Object.keys(rec)) {
    if (!declared.has(key)) return { problem: `${label} rows do not have "${key}". A row has ${[...declared].join(' and ')}.` }
  }
  const row: RepeatRowValue = {}
  let filled = 0
  for (const f of repeat.fields) {
    const one = checkFieldValue(f, rec[f.path])
    if ('problem' in one) return one
    row[f.path] = one.value
    if (one.value !== null) filled += 1
  }
  if (filled === 0) return { problem: `${label} row is empty.` }
  return { row }
}

// PER-SEGMENT CUSTOM CONTACT FIELDS (LIVE-662). Owner ruling 2026-09-29 "Custom fields only": a Space
// segment carries a FIELD TEMPLATE (space_segments.field_keys, migration 20270346001900), a contact that
// matches the segment shows those fields on its detail card and can have them filled in there, and CSV
// import maps columns to the same keys (it already writes `contacts.meta.custom[key]`). Custom objects
// are ruled out and not built here.
//
// THE PIECES ALREADY EXISTED as data. custom_field_registry names and types a Space's keys
// (lib/crm/import/store.ts), and a contact's values live in contacts.meta.custom. This module adds the
// template on the segment, the per-contact read of which templates apply, and the one Space-scoped
// write of a contact's values. No 'use server' directive: the client-callable wrappers live in
// app/(main)/spaces/[slug]/crm/segment-field-actions.ts.
//
// GATING: every write re-checks the Space EDITOR (canEditProfile), binds the Space on every row it
// touches, and accepts only keys the contact's templates (or its existing values) name, normalized by
// the registry's value type. Reads fail safe to empty.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { resolveAudience } from '@/lib/spaces/audiences'
import { listSpaceCustomFields, rememberCustomFields } from '@/lib/crm/import/store'
import { customFieldKey } from '@/lib/crm/import/map'
import type { CustomFieldEntry, ValueType } from '@/lib/crm/import/types'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** The template cap. The column's check constraint holds the same number. */
export const MAX_TEMPLATE_FIELDS = 20
/** How many templated segments a contact card evaluates. Each one is an audience resolve. */
const MAX_TEMPLATED_SEGMENTS = 10
const MAX_VALUE_LEN = 500

const VALUE_TYPES: readonly ValueType[] = ['text', 'number', 'email', 'phone', 'url', 'date', 'boolean', 'select']

// ── PURE ─────────────────────────────────────────────────────────────────────────────────────────────

/** A template's keys: strings the Space's registry knows, de-duplicated, order kept, capped. PURE. */
export function normalizeFieldKeys(raw: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const k of raw) {
    if (typeof k !== 'string' || !known.has(k) || out.includes(k)) continue
    out.push(k)
    if (out.length >= MAX_TEMPLATE_FIELDS) break
  }
  return out
}

/**
 * One submitted value, normalized for its registry type. `null` means "clear this field". Returns
 * `{ error }` with a plain sentence when the value cannot be that type. PURE.
 */
export function normalizeCustomValue(
  raw: unknown,
  field: Pick<CustomFieldEntry, 'label' | 'valueType' | 'options'>,
): string | null | { error: string } {
  const v = typeof raw === 'string' ? raw.trim().slice(0, MAX_VALUE_LEN) : ''
  if (!v) return null
  switch (field.valueType) {
    case 'number': {
      const n = Number(v.replace(/,/g, ''))
      return Number.isFinite(n) ? String(n) : { error: `${field.label} needs a number.` }
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : { error: `${field.label} needs an email address.` }
    case 'phone':
      return /^[+()\d][\d\s().+-]{4,29}$/.test(v) ? v : { error: `${field.label} needs a phone number.` }
    case 'url': {
      try {
        const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : { error: `${field.label} needs a web address.` }
      } catch {
        return { error: `${field.label} needs a web address.` }
      }
    }
    case 'date': {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) return { error: `${field.label} needs a date.` }
      const d = new Date(`${v}T00:00:00Z`)
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : { error: `${field.label} needs a date.` }
    }
    case 'boolean': {
      const b = v.toLowerCase()
      if (['true', 'yes', 'y', '1'].includes(b)) return 'true'
      if (['false', 'no', 'n', '0'].includes(b)) return 'false'
      return { error: `${field.label} needs yes or no.` }
    }
    case 'select': {
      const opts = field.options ?? []
      if (!opts.length) return v
      const hit = opts.find((o) => o.toLowerCase() === v.toLowerCase())
      return hit ?? { error: `${field.label} needs one of: ${opts.join(', ')}.` }
    }
    default:
      return v
  }
}

/**
 * Fold submitted values into a contact's existing `meta.custom`, writing only `allowed` keys. A blank
 * value removes the key. Returns the next custom object, or the first error. PURE.
 */
export function mergeCustomValues(
  existing: Record<string, unknown>,
  submitted: Record<string, unknown>,
  allowed: ReadonlyMap<string, Pick<CustomFieldEntry, 'label' | 'valueType' | 'options'>>,
): { custom: Record<string, unknown> } | { error: string } {
  // A Map, not property writes on a plain object: a submitted key never names an object property
  // (no `__proto__` path), and only registry keys in `allowed` are ever written.
  const next = new Map<string, unknown>(Object.entries(existing))
  for (const [key, raw] of Object.entries(submitted)) {
    const field = allowed.get(key)
    if (!field) continue
    const v = normalizeCustomValue(raw, field)
    if (v && typeof v === 'object') return v
    if (v === null) next.delete(key)
    else next.set(key, v)
  }
  return { custom: Object.fromEntries(next) }
}

// ── IO ───────────────────────────────────────────────────────────────────────────────────────────────

type Query = {
  select: (c: string) => Query
  eq: (col: string, val: string) => Query
  neq: (col: string, val: string) => Query
  order: (col: string, opts: { ascending: boolean }) => Query
  limit: (n: number) => Query
  update: (patch: Record<string, unknown>) => Query
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
  then: (resolve: (r: { data: Record<string, unknown>[] | null; error: unknown }) => unknown) => Promise<unknown>
}

/** The untyped handle: contacts is not in the generated types (ADR-246). Scoped to this module. */
function table(name: 'space_segments' | 'contacts'): Query {
  return (createAdminClient() as unknown as { from: (t: string) => Query }).from(name)
}

async function editorFor(spaceId: string): Promise<string | null> {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const space = await getSpaceById(spaceId)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, profileId)
  return caps.canEditProfile ? profileId : null
}

export interface SegmentFieldTemplate {
  id: string
  name: string
  fieldKeys: string[]
}

/** Every segment of a Space with its field template (empty templates included). FAIL-SAFE to []. */
export async function listSegmentFieldTemplates(spaceId: string): Promise<SegmentFieldTemplate[]> {
  if (!spaceId) return []
  try {
    const { data } = await new Promise<{ data: Record<string, unknown>[] | null }>((resolve) => {
      table('space_segments')
        .select('id, name, field_keys')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: true })
        .then((r) => resolve(r))
    })
    return (data ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      fieldKeys: Array.isArray(r.field_keys) ? (r.field_keys as unknown[]).filter((k): k is string => typeof k === 'string') : [],
    }))
  } catch {
    return []
  }
}

export interface ContactTemplateField extends CustomFieldEntry {
  /** The segments whose template asks for this field, by name. */
  segments: string[]
}

/**
 * The templated fields that apply to one contact: the union of every templated segment the contact
 * matches, in template order, each resolved against the Space registry. A segment's membership comes
 * from the same resolver the send uses (resolveAudience), so the card and an email to that segment
 * can never disagree about who is in it. FAIL-SAFE to [].
 */
export async function templateFieldsForContact(spaceId: string, contactId: string): Promise<ContactTemplateField[]> {
  try {
    const [templates, registry] = await Promise.all([listSegmentFieldTemplates(spaceId), listSpaceCustomFields(spaceId)])
    const byKey = new Map(registry.map((f) => [f.key, f]))
    const templated = templates.filter((t) => t.fieldKeys.some((k) => byKey.has(k))).slice(0, MAX_TEMPLATED_SEGMENTS)
    if (!templated.length) return []
    const matches = await Promise.all(
      templated.map(async (t) => {
        const recipients = await resolveAudience(spaceId, { segmentId: t.id })
        return recipients.some((r) => r.contactId === contactId) ? t : null
      }),
    )
    const out = new Map<string, ContactTemplateField>()
    for (const t of matches) {
      if (!t) continue
      for (const key of t.fieldKeys) {
        const def = byKey.get(key)
        if (!def) continue
        const prev = out.get(key)
        if (prev) prev.segments.push(t.name)
        else out.set(key, { ...def, segments: [t.name] })
      }
    }
    return [...out.values()]
  } catch {
    return []
  }
}

/** Set a segment's template. Editor-gated; keys must be this Space's registry keys. */
export async function setSegmentFieldKeys(spaceId: string, segmentId: string, keys: unknown): Promise<ActionResult> {
  if (!(await editorFor(spaceId))) return fail('You do not have permission to change this space’s fields.')
  const known = new Set((await listSpaceCustomFields(spaceId)).map((f) => f.key))
  const fieldKeys = normalizeFieldKeys(keys, known)
  try {
    const { data, error } = await table('space_segments')
      .update({ field_keys: fieldKeys, updated_at: new Date().toISOString() })
      .eq('id', segmentId)
      .eq('space_id', spaceId)
      .select('id')
      .maybeSingle()
    if (error || !data) return fail('That segment could not be saved. Try again.')
    return ok()
  } catch {
    return fail('That segment could not be saved. Try again.')
  }
}

/** Add a custom field to the Space registry by hand (the import wizard adds them from a file). */
export async function addSpaceCustomField(
  spaceId: string,
  label: unknown,
  valueType: unknown,
  options?: unknown,
): Promise<ActionResult<{ key: string }>> {
  const profileId = await editorFor(spaceId)
  if (!profileId) return fail('You do not have permission to change this space’s fields.')
  const name = typeof label === 'string' ? label.trim().slice(0, 60) : ''
  if (!name) return fail('Give the field a name.')
  const type = VALUE_TYPES.includes(valueType as ValueType) ? (valueType as ValueType) : 'text'
  const opts =
    type === 'select' && Array.isArray(options)
      ? [...new Set(options.filter((o): o is string => typeof o === 'string').map((o) => o.trim()).filter(Boolean))].slice(0, 30)
      : []
  if (type === 'select' && !opts.length) return fail('A choice field needs at least one choice.')
  const key = customFieldKey(name)
  const existing = await listSpaceCustomFields(spaceId)
  if (existing.some((f) => f.key === key)) return fail('This space already has a field with that name.')
  await rememberCustomFields({
    ownerId: profileId,
    spaceId,
    fields: [{ key, label: name, valueType: type, options: opts }],
    fingerprint: 'manual',
  })
  const saved = (await listSpaceCustomFields(spaceId)).some((f) => f.key === key)
  return saved ? ok({ key }) : fail('That field could not be saved. Try again.')
}

/**
 * Save a contact's custom values from its detail card. Editor-gated and Space-bound. Only keys the
 * contact's templates name, or that it already carries, are written; every value is normalized by its
 * registry type, and the rest of `meta` is kept as it was.
 */
export async function saveContactCustomFields(
  spaceId: string,
  contactId: string,
  values: unknown,
): Promise<ActionResult> {
  if (!(await editorFor(spaceId))) return fail('You do not have permission to edit this contact.')
  if (!values || typeof values !== 'object' || Array.isArray(values)) return fail('Nothing to save.')
  try {
    const { data: row } = await table('contacts').select('id, meta').eq('id', contactId).eq('space_id', spaceId).maybeSingle()
    if (!row) return fail('That contact is not in this space.')
    const meta = row.meta && typeof row.meta === 'object' ? (row.meta as Record<string, unknown>) : {}
    const existing = meta.custom && typeof meta.custom === 'object' ? (meta.custom as Record<string, unknown>) : {}

    const [templated, registry] = await Promise.all([templateFieldsForContact(spaceId, contactId), listSpaceCustomFields(spaceId)])
    const byKey = new Map(registry.map((f) => [f.key, f]))
    const allowed = new Map<string, Pick<CustomFieldEntry, 'label' | 'valueType' | 'options'>>()
    for (const f of templated) allowed.set(f.key, f)
    for (const key of Object.keys(existing)) {
      if (!allowed.has(key)) allowed.set(key, byKey.get(key) ?? { label: key, valueType: 'text' })
    }

    const merged = mergeCustomValues(existing, values as Record<string, unknown>, allowed)
    if ('error' in merged) return fail(merged.error)
    const { error } = await table('contacts')
      .update({ meta: { ...meta, custom: merged.custom }, updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('space_id', spaceId)
      .select('id')
      .maybeSingle()
    if (error) return fail('Those fields could not be saved. Try again.')
    return ok()
  } catch (error) {
    console.error('[segment fields] contact save failed', { spaceId, contactId, error })
    return fail('Those fields could not be saved. Try again.')
  }
}

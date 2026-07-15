// ─────────────────────────────────────────────────────────────────────────────
// COMMIT (CRM Master Build Plan Phase 2) — execute a staged import into its SCOPED
// target, respecting the membrane (CRM-MASTER-BUILD-PLAN §1.3):
//   • member target -> the creator's personal `network_contacts` (via createContact
//     in lib/connections/store.ts; we import + call it, never edit it).
//   • space  target -> that Space's sealed `contacts(space_id)` as unknown/unsubscribed
//     leads (ADR-099), mirroring syncContactToSpaceCrm's insert shape.
//
// The plan (create / merge / skip) is computed by the PURE planCommit (dedupe.ts).
// This layer just executes it: idempotent upsert, merge per the chosen strategy
// (skip / overwrite / fill_empty), custom fields into the target's details/meta jsonb,
// row-level partial import (a single row's failure counts as failed, never aborts).
// Server-only. Gating: member = the creator; space = mirror graduation's CRM gate.
// ─────────────────────────────────────────────────────────────────────────────

import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { createContact, updateContact, existingContactKeys, listContacts } from '@/lib/connections/store'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isPlatformStaff } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { getImport, updateImport, rememberCustomFields, getRootSpaceId } from './store'
import { headerFingerprint } from './map'
import { planCommit, emailKey, phoneKey, type ProjectedContact, type ExistingKeys } from './dedupe'
import type { ContactImportRow, CommitResult, ValueType } from './types'
import type { NetworkContactListItem, ContactDetails, ContactOtherDetail } from '@/lib/connections/types'

const empty = (v: string | null | undefined) => !((v ?? '').trim())

/** The custom fields the mapping introduced, with their inferred value type. */
function customFieldDefs(row: ContactImportRow): { key: string; label: string; valueType: ValueType }[] {
  return row.mapping
    .filter((m) => m.target === 'custom' && m.customKey)
    .map((m) => ({ key: m.customKey as string, label: m.header, valueType: m.valueType }))
}

/** Fold a projected row's custom fields into a ContactDetails.other list (idempotent by
 *  label). Used for the member target where details is the flexible jsonb. */
function customToDetails(existing: ContactDetails, custom: Record<string, string>, defs: { key: string; label: string }[], strategy: string): ContactDetails {
  const labelByKey = new Map(defs.map((d) => [d.key, d.label]))
  const other: ContactOtherDetail[] = [...(existing.other ?? [])]
  const haveLabel = new Set(other.map((o) => o.label.toLowerCase()))
  for (const [key, value] of Object.entries(custom)) {
    if (!value) continue
    const label = labelByKey.get(key) ?? key
    const idx = other.findIndex((o) => o.label.toLowerCase() === label.toLowerCase())
    if (idx >= 0) {
      if (strategy === 'overwrite') other[idx] = { label, value }
      // fill_empty / skip: keep the existing value
    } else if (!haveLabel.has(label.toLowerCase())) {
      other.push({ label, value })
    }
  }
  return other.length ? { ...existing, other } : existing
}

// ── Member target ────────────────────────────────────────────────────────────────

async function commitToMember(ownerId: string, row: ContactImportRow): Promise<CommitResult> {
  const defs = customFieldDefs(row)
  const { emails, phones } = await existingContactKeys(ownerId)
  const existing: ExistingKeys = { emails, phones }

  // For merges we need the existing row id + its current values: build a key -> row map.
  let byKey = new Map<string, NetworkContactListItem>()
  try {
    const all = await listContacts(ownerId, 2000)
    for (const c of all) {
      const ek = emailKey(c.email)
      const pk = phoneKey(c.phone)
      if (ek && !byKey.has(ek)) byKey.set(ek, c)
      if (pk && !byKey.has(pk)) byKey.set(pk, c)
    }
  } catch {
    byKey = new Map()
  }

  const plan = planCommit(row.source.rows, row.mapping, existing, row.mergeStrategy)
  let created = 0
  let merged = 0
  let skipped = 0
  let failed = 0

  for (const p of plan.rows) {
    if (p.action === 'skip') {
      skipped++
      continue
    }
    const c = p.contact
    if (p.action === 'create') {
      const details = customToDetails({}, c.custom, defs, row.mergeStrategy)
      const id = await createContact(ownerId, {
        source: 'import',
        displayName: c.displayName || undefined,
        email: c.email || undefined,
        phone: c.phone || undefined,
        title: c.title || undefined,
        company: c.company || undefined,
        city: c.city || undefined,
        website: c.website || undefined,
        socials: c.socials,
        details,
      })
      if (id) {
        created++
        // Keep the in-run index fresh so a later row can't re-create this key.
        const ek = emailKey(c.email)
        const pk = phoneKey(c.phone)
        if (ek) existing.emails.add(ek)
        if (pk) existing.phones.add(pk)
      } else {
        failed++
      }
    } else if (p.action === 'merge') {
      // Resolve the existing row by email first, then phone (planCommit's matchedKey prefers the
      // email key even when the match was on phone, so a row that matches an existing contact by
      // phone under a NEW email would otherwise miss byKey and be miscounted as failed — while the
      // dry-run counted it merged, breaking preview/commit parity). Mirrors commitToSpace.
      const ek = emailKey(c.email)
      const pk = phoneKey(c.phone)
      const key = ek && byKey.has(ek) ? ek : pk && byKey.has(pk) ? pk : p.matchedKey
      const target = key ? byKey.get(key) : undefined
      if (!target) {
        failed++
        continue
      }
      const ok = await updateContact(ownerId, target.id, mergeMemberPatch(target, c, defs, row.mergeStrategy))
      if (ok) merged++
      else failed++
    }
  }

  return { created, merged, skipped, failed, total: row.source.rows.length }
}

/** Build the update patch for a member merge, honoring the strategy per scalar field. */
function mergeMemberPatch(
  existing: NetworkContactListItem,
  c: ProjectedContact,
  defs: { key: string; label: string }[],
  strategy: string,
) {
  const pick = (cur: string | null, incoming: string): string | undefined => {
    if (!incoming) return undefined
    if (strategy === 'overwrite') return incoming
    // fill_empty (default): only when the existing value is blank.
    return empty(cur) ? incoming : undefined
  }
  const details = customToDetails(existing.details ?? {}, c.custom, defs, strategy)
  return {
    displayName: pick(existing.displayName, c.displayName),
    email: pick(existing.email, c.email),
    phone: pick(existing.phone, c.phone),
    title: pick(existing.title, c.title),
    company: pick(existing.company, c.company),
    city: pick(existing.city, c.city),
    website: pick(existing.website, c.website),
    details,
  }
}

// ── Space target ───────────────────────────────────────────────────────────────

/** The extras that live in the Space contact's `meta` jsonb (contacts has no phone/city
 *  columns; only email/display_name/consent/source are real columns). */
function spaceMeta(c: ProjectedContact, defs: { key: string; label: string }[]): Record<string, unknown> {
  const custom: Record<string, string> = {}
  const labelByKey = new Map(defs.map((d) => [d.key, d.label]))
  for (const [k, v] of Object.entries(c.custom)) if (v) custom[labelByKey.get(k) ?? k] = v
  const meta: Record<string, unknown> = { imported: true }
  if (c.phone) meta.phone = c.phone
  if (c.title) meta.title = c.title
  if (c.company) meta.company = c.company
  if (c.city) meta.city = c.city
  if (c.website) meta.website = c.website
  if (c.tags.length) meta.tags = c.tags
  if (c.notes) meta.notes = c.notes
  if (Object.keys(custom).length) meta.custom = custom
  return meta
}

/**
 * Commit into a `contacts(space_id)` list. Serves BOTH scoped targets that live in the
 * shared `contacts` table:
 *   • `space`    — a tenant Space's sealed list (dedupe by email only; unchanged).
 *   • `platform` — Frequency's own ROOT-space hub (dedupe by email AND phone: the platform
 *     list mixes sources, so a phone match is a real duplicate worth catching).
 * A sealed `contacts` row requires an email (contacts.email is NOT NULL), so a phone-only
 * row is still skipped; phone dedupe only ever prevents a DIFFERENT-email duplicate of an
 * existing contact whose number we already hold in `meta.phone`.
 */
async function commitToSpace(
  row: ContactImportRow,
  spaceId: string,
  opts: { dedupePhone?: boolean } = {},
): Promise<CommitResult> {
  const db = createAdminClient()
  const defs = customFieldDefs(row)
  const dedupePhone = opts.dedupePhone ?? false

  // Existing keys WITHIN this contacts scope. We key by email and (for the platform hub)
  // by the last-10 phone stashed in meta.phone, so a merge can resolve on either.
  const emails = new Set<string>()
  const phones = new Set<string>()
  const idByKey = new Map<string, string>()
  const metaByKey = new Map<string, Record<string, unknown>>()
  try {
    const { data } = await db.from('contacts').select('id, email, meta').eq('space_id', spaceId)
    for (const r of (data ?? []) as { id: string; email: string | null; meta: Record<string, unknown> | null }[]) {
      const meta = r.meta ?? {}
      const ek = emailKey(r.email)
      if (ek) {
        emails.add(ek)
        idByKey.set(ek, r.id)
        metaByKey.set(ek, meta)
      }
      if (dedupePhone) {
        const pk = phoneKey(typeof meta.phone === 'string' ? meta.phone : null)
        if (pk) {
          phones.add(pk)
          if (!idByKey.has(pk)) idByKey.set(pk, r.id)
          if (!metaByKey.has(pk)) metaByKey.set(pk, meta)
        }
      }
    }
  } catch {
    /* read failure -> empty index (import proceeds; dedupe degrades, never loses data) */
  }

  const existing: ExistingKeys = { emails, phones: dedupePhone ? phones : new Set() }
  const plan = planCommit(row.source.rows, row.mapping, existing, row.mergeStrategy)
  const now = new Date().toISOString()
  let created = 0
  let merged = 0
  let skipped = 0
  let failed = 0

  for (const p of plan.rows) {
    if (p.action === 'skip') {
      skipped++
      continue
    }
    const c = p.contact
    const ek = emailKey(c.email)
    // A sealed contacts row must have an email to key on; skip rows without one.
    if (!ek) {
      skipped++
      continue
    }

    if (p.action === 'create') {
      try {
        const { error } = await db.from('contacts').insert({
          space_id: spaceId,
          email: ek,
          display_name: c.displayName || null,
          consent_state: 'unknown', // a lead, never auto-subscribed (ADR-099)
          source: 'import',
          meta: spaceMeta(c, defs),
        } as unknown as Database['public']['Tables']['contacts']['Insert'])
        if (error) failed++
        else {
          created++
          emails.add(ek)
        }
      } catch {
        failed++
      }
    } else if (p.action === 'merge') {
      try {
        // Resolve the existing row by email first, then phone (planCommit's matchedKey prefers
        // the email key even when the match was on phone, so we cannot trust it alone here).
        const pk = phoneKey(c.phone)
        const key =
          ek && idByKey.has(ek) ? ek : pk && idByKey.has(pk) ? pk : (p.matchedKey ?? ek)
        const id = idByKey.get(key)
        if (!id) {
          failed++
          continue
        }
        const nextMeta = mergeMeta(metaByKey.get(key) ?? {}, spaceMeta(c, defs), row.mergeStrategy)
        const patch: Record<string, unknown> = { last_seen_at: now, updated_at: now, meta: nextMeta }
        // Only fill the display name when overwriting, or when it is currently blank.
        if (c.displayName && row.mergeStrategy === 'overwrite') patch.display_name = c.displayName
        const { error } = await db
          .from('contacts')
          .update(patch as unknown as Database['public']['Tables']['contacts']['Update'])
          .eq('id', id)
          .eq('space_id', spaceId)
        if (error) failed++
        else merged++
      } catch {
        failed++
      }
    }
  }

  return { created, merged, skipped, failed, total: row.source.rows.length }
}

/** Merge two meta objects per strategy: overwrite = incoming wins; fill_empty = only add
 *  keys the existing meta lacks. Custom sub-object merged the same way. */
function mergeMeta(existing: Record<string, unknown>, incoming: Record<string, unknown>, strategy: string): Record<string, unknown> {
  if (strategy === 'overwrite') {
    const custom = { ...(existing.custom as Record<string, unknown> ?? {}), ...(incoming.custom as Record<string, unknown> ?? {}) }
    return { ...existing, ...incoming, custom }
  }
  // fill_empty (default): keep every existing value, add only missing keys.
  const out: Record<string, unknown> = { ...existing }
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'custom') continue
    if (out[k] === undefined || out[k] === null || out[k] === '') out[k] = v
  }
  const exCustom = (existing.custom as Record<string, unknown>) ?? {}
  const inCustom = (incoming.custom as Record<string, unknown>) ?? {}
  const custom: Record<string, unknown> = { ...exCustom }
  for (const [k, v] of Object.entries(inCustom)) if (custom[k] === undefined) custom[k] = v
  if (Object.keys(custom).length) out.custom = custom
  return out
}

// ── Entry point ──────────────────────────────────────────────────────────────────

/**
 * Commit a staged import. Idempotent: a row already 'committed' returns its stored
 * result without re-writing. Resolves + gates the target, executes the plan, remembers
 * the custom fields, and stamps the result on the row. FAIL-SAFE per row.
 */
export async function commitImport(id: string, createdBy: string): Promise<ActionResult<CommitResult>> {
  const row = await getImport(id, createdBy)
  if (!row) return fail('We could not find that import.')
  if (row.status === 'committed' && 'total' in row.result) {
    return ok(row.result as CommitResult)
  }
  if (!row.source.rows.length) return fail('That file has no rows to import.')

  let result: CommitResult
  if (row.targetKind === 'platform') {
    // Frequency's OWN list (the ROOT-space contacts hub). No Space, no picker. Staff only:
    // this is the platform contact hub (crm.root.allContacts), never a tenant list.
    if (!(await isPlatformStaff())) {
      return fail('Only Frequency staff can bring contacts into the platform list.')
    }
    const rootId = await getRootSpaceId()
    if (!rootId) return fail('We could not reach the platform contact list right now.')
    result = await commitToSpace(row, rootId, { dedupePhone: true })
  } else if (row.targetKind === 'space') {
    const spaceId = row.targetSpaceId
    if (!spaceId) return fail('That import has no Space selected.')
    // Gate: mirror graduation. Only a Space team member with CRM access may import into it.
    const space = await getSpaceById(spaceId)
    if (!space) return fail('We could not find that Space.')
    const caps = await getSpaceCapabilities(space, createdBy)
    if (!spaceFunctionAccess(space, 'crm', caps.role)) {
      return fail('Only this Space’s team can bring contacts in.')
    }
    result = await commitToSpace(row, spaceId)
  } else {
    result = await commitToMember(createdBy, row)
  }

  // Remember the custom fields for next time (best-effort), then stamp the outcome.
  const defs = customFieldDefs(row)
  if (defs.length) {
    await rememberCustomFields({
      ownerId: createdBy,
      spaceId: row.targetKind === 'space' ? row.targetSpaceId : null,
      fields: defs,
      fingerprint: headerFingerprint(row.source.headers),
    })
  }
  await updateImport(id, createdBy, {
    status: 'committed',
    result,
    committedAt: new Date().toISOString(),
    error: null,
  })

  return ok(result)
}

// Server-only data access for Network Profiles (the Profile Creator). Every read
// and write is OWNER-SCOPED — the caller passes their profile id and we filter on
// `owner_id` on every query, with RLS as the backstop (see the migration). This is
// the gate that keeps personal captures from bleeding into anyone else's view.
//
// `network_contacts` (+ notes/tags) aren't in database.types yet, so we talk to
// them through the untyped admin handle (repo convention, cf. lib/studio/contacts.ts).
// The private `network-contacts` bucket is read via short-lived signed URLs.

import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordContactInteraction, type InteractionChannel, type InteractionDirection } from '@/lib/crm/interactions'
import type {
  NetworkContact,
  NetworkContactListItem,
  ContactNote,
  ContactReminder,
  ReminderWithContact,
  ContactTag,
  ContactSocials,
  ContactDetails,
  ContactSource,
  ContactStatus,
  Visibility,
  NoteKind,
  TagSource,
} from './types'

const BUCKET = 'network-contacts'
const COLS =
  'id, owner_id, visibility, source, status, display_name, email, phone, title, company, city, website, socials, avatar_path, details, card_front_path, card_back_path, logo_path, linked_profile_id, linked_contact_id, last_contacted_at, created_at, updated_at'

const db = () => createAdminClient()
const emptyToNull = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim()
  return s.length ? s : null
}

function mapContact(r: Record<string, unknown>): NetworkContact {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    visibility: (r.visibility as Visibility) ?? 'private',
    source: (r.source as ContactSource) ?? 'manual',
    status: (r.status as ContactStatus) ?? 'new',
    displayName: (r.display_name as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    title: (r.title as string) ?? null,
    company: (r.company as string) ?? null,
    city: (r.city as string) ?? null,
    website: (r.website as string) ?? null,
    socials: (r.socials as ContactSocials) ?? {},
    avatarPath: (r.avatar_path as string) ?? null,
    details: (r.details as ContactDetails) ?? {},
    cardFrontPath: (r.card_front_path as string) ?? null,
    cardBackPath: (r.card_back_path as string) ?? null,
    logoPath: (r.logo_path as string) ?? null,
    linkedProfileId: (r.linked_profile_id as string) ?? null,
    linkedContactId: (r.linked_contact_id as string) ?? null,
    lastContactedAt: (r.last_contacted_at as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
    updatedAt: (r.updated_at as string) ?? null,
  }
}

// ── Storage (private bucket) ─────────────────────────────────────────────────

/** Mint a short-lived signed URL for a private avatar/scan, or null. */
export async function signedUrl(path: string | null, expiresIn = 3600): Promise<string | null> {
  if (!path) return null
  const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}

async function signedUrlMap(paths: string[], expiresIn = 3600): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!paths.length) return map
  const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrls(paths, expiresIn)
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map.set(row.path, row.signedUrl)
  }
  return map
}

/** Download a stored image as base64 for the vision model (admin-side). */
export async function downloadImageBase64(
  path: string,
): Promise<{ base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' } | null> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(path)
  if (error || !data) return null
  const buf = Buffer.from(await data.arrayBuffer())
  const mediaType =
    data.type === 'image/png' ? 'image/png' : data.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  return { base64: buf.toString('base64'), mediaType }
}

/** Best-effort delete of an object (e.g. discarding a temporary scan). */
export async function removeObject(path: string): Promise<void> {
  try {
    await createAdminClient().storage.from(BUCKET).remove([path])
  } catch {
    /* cleanup is best-effort */
  }
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export interface CreateContactInput {
  source: ContactSource
  visibility?: Visibility
  displayName?: string
  email?: string
  phone?: string
  title?: string
  company?: string
  city?: string
  website?: string
  socials?: ContactSocials
  avatarPath?: string | null
  details?: ContactDetails
  cardFrontPath?: string | null
  cardBackPath?: string | null
  logoPath?: string | null
  extraction?: unknown
}

export async function createContact(ownerId: string, input: CreateContactInput): Promise<string | null> {
  const { data, error } = await db()
    .from('network_contacts')
    .insert({
      owner_id: ownerId,
      source: input.source,
      visibility: input.visibility ?? 'private',
      display_name: emptyToNull(input.displayName),
      email: emptyToNull(input.email?.toLowerCase()),
      phone: emptyToNull(input.phone),
      title: emptyToNull(input.title),
      company: emptyToNull(input.company),
      city: emptyToNull(input.city),
      website: emptyToNull(input.website),
      socials: input.socials ?? {},
      avatar_path: input.avatarPath ?? null,
      details: input.details ?? {},
      card_front_path: input.cardFrontPath ?? null,
      card_back_path: input.cardBackPath ?? null,
      logo_path: input.logoPath ?? null,
      extraction: input.extraction ?? {},
    } as Database['public']['Tables']['network_contacts']['Insert'])
    .select('id')
    .maybeSingle()
  if (error || !data) return null
  const id = String((data as { id: string }).id)
  // Stamp the capture origin onto the unified CRM timeline (ADR-372). Fail-safe:
  // recordContactInteraction never throws, so it can never break a capture.
  const touch = captureTouch(input.source)
  await recordContactInteraction({
    ownerProfileId: ownerId,
    subjectKind: 'network_contact',
    subjectId: id,
    channel: touch.channel,
    direction: touch.direction,
    summary: touch.summary,
    source: 'system',
  })
  return id
}

/** The timeline origin entry for a capture, by how it was added. Pure display mapping. */
function captureTouch(src: ContactSource): {
  channel: InteractionChannel
  direction: InteractionDirection
  summary: string
} {
  switch (src) {
    case 'card_scan':
      return { channel: 'in_person', direction: 'inbound', summary: 'Met, scanned their card' }
    case 'qr_scan':
      return { channel: 'in_person', direction: 'inbound', summary: 'Met via QR' }
    case 'poster':
      return { channel: 'in_person', direction: 'inbound', summary: 'Added from a poster' }
    case 'import':
      return { channel: 'system', direction: 'internal', summary: 'Imported' }
    case 'manual':
    default:
      return { channel: 'system', direction: 'internal', summary: 'Added manually' }
  }
}

export interface UpdateContactPatch {
  displayName?: string | null
  email?: string | null
  phone?: string | null
  title?: string | null
  company?: string | null
  city?: string | null
  website?: string | null
  socials?: ContactSocials
  visibility?: Visibility
  status?: ContactStatus
  avatarPath?: string | null
  details?: ContactDetails
  cardFrontPath?: string | null
  cardBackPath?: string | null
  logoPath?: string | null
}

export async function updateContact(
  ownerId: string,
  id: string,
  patch: UpdateContactPatch,
): Promise<boolean> {
  const u: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.displayName !== undefined) u.display_name = emptyToNull(patch.displayName)
  if (patch.email !== undefined) u.email = emptyToNull(patch.email?.toLowerCase())
  if (patch.phone !== undefined) u.phone = emptyToNull(patch.phone)
  if (patch.title !== undefined) u.title = emptyToNull(patch.title)
  if (patch.company !== undefined) u.company = emptyToNull(patch.company)
  if (patch.city !== undefined) u.city = emptyToNull(patch.city)
  if (patch.website !== undefined) u.website = emptyToNull(patch.website)
  if (patch.socials !== undefined) u.socials = patch.socials
  if (patch.visibility !== undefined) u.visibility = patch.visibility
  if (patch.status !== undefined) u.status = patch.status
  if (patch.avatarPath !== undefined) u.avatar_path = patch.avatarPath
  if (patch.details !== undefined) u.details = patch.details
  if (patch.cardFrontPath !== undefined) u.card_front_path = patch.cardFrontPath
  if (patch.cardBackPath !== undefined) u.card_back_path = patch.cardBackPath
  if (patch.logoPath !== undefined) u.logo_path = patch.logoPath
  const { error } = await db().from('network_contacts').update(u as Database['public']['Tables']['network_contacts']['Update']).eq('id', id).eq('owner_id', ownerId)
  return !error
}

export async function deleteContact(ownerId: string, id: string): Promise<boolean> {
  const { error } = await db().from('network_contacts').delete().eq('id', id).eq('owner_id', ownerId)
  return !error
}

async function ownsContact(ownerId: string, contactId: string): Promise<boolean> {
  const { data } = await db()
    .from('network_contacts')
    .select('id')
    .eq('id', contactId)
    .eq('owner_id', ownerId)
    .maybeSingle()
  return !!data
}

export type ContactSort = 'recent' | 'name' | 'last_contacted' | 'follow_up'

export async function listContacts(
  ownerId: string,
  limit = 300,
  sort: ContactSort = 'recent',
): Promise<NetworkContactListItem[]> {
  // The DB-backed orders. `follow_up` is resolved in JS (below) by joining the
  // next open reminder; until then it falls back to last-contacted-then-recent.
  // FAIL-SAFE: a missing last_contacted_at column makes the ordered select error,
  // so we retry without the new column's ordering before degrading to empty.
  async function read(order: { col: string; ascending: boolean; nullsFirst?: boolean }) {
    const { data } = await db()
      .from('network_contacts')
      .select(`${COLS}, network_contact_tags(tag)`)
      .eq('owner_id', ownerId)
      .order(order.col, { ascending: order.ascending, nullsFirst: order.nullsFirst })
      .limit(limit)
    return data as unknown as Record<string, unknown>[] | null
  }

  const order =
    sort === 'name'
      ? { col: 'display_name', ascending: true, nullsFirst: false }
      : sort === 'last_contacted'
        ? { col: 'last_contacted_at', ascending: false, nullsFirst: false }
        : { col: 'created_at', ascending: false }

  // Try the requested order; if it fails (e.g. the column isn't there yet), fall
  // back to created_at so the list always renders.
  let rows = await read(order)
  if (rows === null && order.col !== 'created_at') {
    rows = await read({ col: 'created_at', ascending: false })
  }
  const safeRows = rows ?? []

  const paths = safeRows.map((r) => r.avatar_path).filter((p): p is string => typeof p === 'string')
  const urls = await signedUrlMap(paths)
  let items = safeRows.map((r) => {
    const base = mapContact(r)
    const tagRows = (r.network_contact_tags as { tag: string }[] | null) ?? []
    return {
      ...base,
      tags: tagRows.map((t) => t.tag),
      avatarUrl: base.avatarPath ? urls.get(base.avatarPath) ?? null : null,
    }
  })

  if (sort === 'follow_up') {
    // Order by the soonest open reminder's due date (overdue first), then the
    // rest by last-contacted. FAIL-SAFE: a missing table yields an empty map.
    const dueByContact = await nextDueByContact(ownerId)
    items = items.slice().sort((a, b) => {
      const da = dueByContact.get(a.id)
      const dbb = dueByContact.get(b.id)
      if (da && dbb) return da - dbb
      if (da) return -1
      if (dbb) return 1
      const la = a.lastContactedAt ? new Date(a.lastContactedAt).getTime() : 0
      const lb = b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : 0
      return lb - la
    })
  }

  return items
}

/** Map of contactId → soonest open reminder due time (ms). Fail-safe: {} on error. */
async function nextDueByContact(ownerId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  try {
    const { data } = await remindersTable()
      .select('contact_id, due_at')
      .eq('owner_id', ownerId)
      .is('done_at', null)
      .order('due_at', { ascending: true })
    for (const row of (data ?? []) as unknown as { contact_id: string; due_at: string }[]) {
      const t = new Date(row.due_at).getTime()
      const prev = map.get(row.contact_id)
      if (prev === undefined || t < prev) map.set(row.contact_id, t)
    }
  } catch {
    /* missing table → no follow-up ordering */
  }
  return map
}

export interface ContactDetail {
  contact: NetworkContact
  notes: ContactNote[]
  tags: ContactTag[]
  avatarUrl: string | null
  /** Signed URLs for the kept card images and logo (null when not on file). */
  cardFrontUrl: string | null
  cardBackUrl: string | null
  logoUrl: string | null
}

export async function getContact(ownerId: string, id: string): Promise<ContactDetail | null> {
  const { data } = await db()
    .from('network_contacts')
    .select(COLS)
    .eq('id', id)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (!data) return null
  const contact = mapContact(data as unknown as Record<string, unknown>)

  const [notesRes, tagsRes, avatarUrl, cardFrontUrl, cardBackUrl, logoUrl] = await Promise.all([
    db()
      .from('network_contact_notes')
      .select('id, body, kind, author_id, created_at')
      .eq('contact_id', id)
      .order('created_at', { ascending: false }),
    db()
      .from('network_contact_tags')
      .select('id, tag, source, created_at')
      .eq('contact_id', id)
      .order('created_at', { ascending: true }),
    signedUrl(contact.avatarPath),
    signedUrl(contact.cardFrontPath),
    signedUrl(contact.cardBackPath),
    signedUrl(contact.logoPath),
  ])

  const notes: ContactNote[] = ((notesRes.data ?? []) as Record<string, unknown>[]).map((n) => ({
    id: String(n.id),
    body: String(n.body),
    kind: (n.kind as NoteKind) ?? 'note',
    authorId: (n.author_id as string) ?? null,
    createdAt: (n.created_at as string) ?? null,
  }))
  const tags: ContactTag[] = ((tagsRes.data ?? []) as Record<string, unknown>[]).map((t) => ({
    id: String(t.id),
    tag: String(t.tag),
    source: (t.source as TagSource) ?? 'manual',
    createdAt: (t.created_at as string) ?? null,
  }))
  return { contact, notes, tags, avatarUrl, cardFrontUrl, cardBackUrl, logoUrl }
}

// ── Network-shared discovery (non-owner read) ────────────────────────────────

export interface SharedContactView {
  id: string
  ownerId: string
  ownerName: string | null
  ownerHandle: string | null
  visibility: Visibility
  city: string | null
  linkedProfileId: string | null
  displayName: string | null
  title: string | null
  company: string | null
  website: string | null
  socials: ContactSocials
}

/** Read a capture the owner promoted to `visibility='network'`, for a NON-owner
 *  steward's read-only discovery view. Returns only network-visible rows (so a
 *  private capture can never leak here) and only the business-card fields — email,
 *  phone, notes and tags stay owner-private. The caller still re-checks locality
 *  via canViewLead. Service-role; no owner filter by design. */
export async function getSharedContact(id: string): Promise<SharedContactView | null> {
  const { data } = await db()
    .from('network_contacts')
    .select(
      'id, owner_id, visibility, city, linked_profile_id, display_name, title, company, website, socials, owner:profiles!owner_id ( display_name, handle )',
    )
    .eq('id', id)
    .eq('visibility', 'network')
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  const owner = (r.owner as { display_name?: string; handle?: string } | null) ?? null
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    ownerName: owner?.display_name ?? null,
    ownerHandle: owner?.handle ?? null,
    visibility: (r.visibility as Visibility) ?? 'network',
    city: (r.city as string) ?? null,
    linkedProfileId: (r.linked_profile_id as string) ?? null,
    displayName: (r.display_name as string) ?? null,
    title: (r.title as string) ?? null,
    company: (r.company as string) ?? null,
    website: (r.website as string) ?? null,
    socials: (r.socials as ContactSocials) ?? {},
  }
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function addNote(
  ownerId: string,
  contactId: string,
  body: string,
  kind: NoteKind,
  authorId: string | null,
): Promise<boolean> {
  const text = body.trim().slice(0, 4000)
  if (!text) return false
  if (!(await ownsContact(ownerId, contactId))) return false
  const { error } = await db()
    .from('network_contact_notes')
    .insert({ contact_id: contactId, author_id: authorId, body: text, kind })
  return !error
}

export async function deleteNote(ownerId: string, noteId: string): Promise<boolean> {
  const { data } = await db()
    .from('network_contact_notes')
    .select('contact_id')
    .eq('id', noteId)
    .maybeSingle()
  const contactId = (data as { contact_id?: string } | null)?.contact_id
  if (!contactId || !(await ownsContact(ownerId, contactId))) return false
  const { error } = await db().from('network_contact_notes').delete().eq('id', noteId)
  return !error
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export async function addTags(
  ownerId: string,
  contactId: string,
  tags: string[],
  source: TagSource,
): Promise<boolean> {
  if (!tags.length) return true
  if (!(await ownsContact(ownerId, contactId))) return false
  const rows = tags.map((tag) => ({ contact_id: contactId, tag, source }))
  const { error } = await db()
    .from('network_contact_tags')
    .upsert(rows, { onConflict: 'contact_id,tag', ignoreDuplicates: true })
  return !error
}

export async function deleteTag(ownerId: string, tagId: string): Promise<boolean> {
  const { data } = await db()
    .from('network_contact_tags')
    .select('contact_id')
    .eq('id', tagId)
    .maybeSingle()
  const contactId = (data as { contact_id?: string } | null)?.contact_id
  if (!contactId || !(await ownsContact(ownerId, contactId))) return false
  const { error } = await db().from('network_contact_tags').delete().eq('id', tagId)
  return !error
}

// ── Reminders (the free keep-in-touch layer) ──────────────────────────────────
// Every read/write is owner-scoped AND fail-safe: a missing network_contact_reminders
// table (code merged before the migration is applied) must never throw — list reads
// return [] and writes return false, so My Contacts keeps rendering.
//
// network_contact_reminders is not in the generated DB types yet (regenerate after
// the migration applies), so we talk to it through an untyped admin handle — the
// same seam lib/crm/client-notes.ts uses for client_notes.

type AnyResult = Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
type AnyFilter = {
  eq: (col: string, val: string) => AnyFilter
  is: (col: string, val: null) => AnyFilter
  lte: (col: string, val: string) => AnyFilter
  order: (col: string, opts: { ascending: boolean }) => AnyFilter
} & AnyResult
type RemindersTable = {
  select: (cols: string) => AnyFilter
  insert: (row: Record<string, unknown>) => AnyResult
  update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => { eq: (col: string, val: string) => AnyResult } }
  delete: () => { eq: (col: string, val: string) => { eq: (col: string, val: string) => AnyResult } }
}

/** The network_contact_reminders table via an untyped admin handle. */
function remindersTable(): RemindersTable {
  return (createAdminClient() as unknown as { from: (t: string) => RemindersTable }).from(
    'network_contact_reminders',
  )
}

function mapReminder(r: Record<string, unknown>): ContactReminder {
  return {
    id: String(r.id),
    contactId: String(r.contact_id),
    dueAt: String(r.due_at),
    note: (r.note as string) ?? null,
    doneAt: (r.done_at as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
  }
}

export async function addReminder(
  ownerId: string,
  contactId: string,
  dueAt: string,
  note?: string | null,
): Promise<boolean> {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return false
  if (!(await ownsContact(ownerId, contactId))) return false
  try {
    const { error } = await remindersTable().insert({
      owner_id: ownerId,
      contact_id: contactId,
      due_at: due.toISOString(),
      note: emptyToNull(note ?? null),
    })
    return !error
  } catch {
    return false
  }
}

export async function completeReminder(ownerId: string, id: string): Promise<boolean> {
  try {
    const { error } = await remindersTable()
      .update({ done_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', ownerId)
    return !error
  } catch {
    return false
  }
}

export async function deleteReminder(ownerId: string, id: string): Promise<boolean> {
  try {
    const { error } = await remindersTable().delete().eq('id', id).eq('owner_id', ownerId)
    return !error
  } catch {
    return false
  }
}

/** Open reminders for one contact, oldest-due first. Fail-safe: [] on error. */
export async function listRemindersForContact(
  ownerId: string,
  contactId: string,
): Promise<ContactReminder[]> {
  try {
    const { data } = await remindersTable()
      .select('id, contact_id, due_at, note, done_at, created_at')
      .eq('owner_id', ownerId)
      .eq('contact_id', contactId)
      .is('done_at', null)
      .order('due_at', { ascending: true })
    return ((data ?? []) as Record<string, unknown>[]).map(mapReminder)
  } catch {
    return []
  }
}

/** The "reach out" list: open reminders due within `withinDays` (overdue included),
 *  each joined to its contact's name + signed avatar URL, soonest-due first.
 *  Fail-safe: [] on any error (missing table merges cleanly). */
export async function listDueReminders(
  ownerId: string,
  withinDays = 7,
): Promise<ReminderWithContact[]> {
  try {
    const cutoff = new Date(Date.now() + withinDays * 86_400_000).toISOString()
    const { data } = await remindersTable()
      .select(
        'id, contact_id, due_at, note, done_at, created_at, network_contacts!inner ( display_name, avatar_path )',
      )
      .eq('owner_id', ownerId)
      .is('done_at', null)
      .lte('due_at', cutoff)
      .order('due_at', { ascending: true })
    const rows = (data ?? []) as Record<string, unknown>[]
    const paths = rows
      .map((r) => (r.network_contacts as { avatar_path?: string } | null)?.avatar_path)
      .filter((p): p is string => typeof p === 'string')
    const urls = await signedUrlMap(paths)
    return rows.map((r) => {
      const contact = (r.network_contacts as { display_name?: string; avatar_path?: string } | null) ?? null
      const avatarPath = contact?.avatar_path ?? null
      return {
        ...mapReminder(r),
        contactName: contact?.display_name ?? null,
        contactAvatarUrl: avatarPath ? urls.get(avatarPath) ?? null : null,
      }
    })
  } catch {
    return []
  }
}

/** Stamp last_contacted_at = now() on a contact the owner just reached out to.
 *  Fail-safe: a missing column never throws (the update simply no-ops). */
export async function touchLastContacted(ownerId: string, contactId: string): Promise<void> {
  try {
    // last_contacted_at isn't in the generated types yet — write it through an
    // untyped update payload (the column is added by 20260723000000…crm_p1).
    await db()
      .from('network_contacts')
      .update({ last_contacted_at: new Date().toISOString() } as unknown as Database['public']['Tables']['network_contacts']['Update'])
      .eq('id', contactId)
      .eq('owner_id', ownerId)
  } catch {
    /* missing column → no-op */
  }
}

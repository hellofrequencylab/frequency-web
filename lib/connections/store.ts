// Server-only data access for Network Profiles (the Profile Creator). Every read
// and write is OWNER-SCOPED — the caller passes their profile id and we filter on
// `owner_id` on every query, with RLS as the backstop (see the migration). This is
// the gate that keeps personal captures from bleeding into anyone else's view.
//
// `network_contacts` (+ notes/tags) aren't in database.types yet, so we talk to
// them through the untyped admin handle (repo convention, cf. lib/studio/contacts.ts).
// The private `network-contacts` bucket is read via short-lived signed URLs.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  NetworkContact,
  NetworkContactListItem,
  ContactNote,
  ContactTag,
  ContactSocials,
  ContactSource,
  ContactStatus,
  Visibility,
  NoteKind,
  TagSource,
} from './types'

const BUCKET = 'network-contacts'
const COLS =
  'id, owner_id, visibility, source, status, display_name, email, phone, title, company, city, website, socials, avatar_path, created_at, updated_at'

const db = () => createAdminClient() as unknown as SupabaseClient
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
      extraction: input.extraction ?? {},
    })
    .select('id')
    .maybeSingle()
  if (error || !data) return null
  return String((data as { id: string }).id)
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
  const { error } = await db().from('network_contacts').update(u).eq('id', id).eq('owner_id', ownerId)
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

export async function listContacts(ownerId: string, limit = 300): Promise<NetworkContactListItem[]> {
  const { data } = await db()
    .from('network_contacts')
    .select(`${COLS}, network_contact_tags(tag)`)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = (data ?? []) as Record<string, unknown>[]
  const paths = rows.map((r) => r.avatar_path).filter((p): p is string => typeof p === 'string')
  const urls = await signedUrlMap(paths)
  return rows.map((r) => {
    const base = mapContact(r)
    const tagRows = (r.network_contact_tags as { tag: string }[] | null) ?? []
    return {
      ...base,
      tags: tagRows.map((t) => t.tag),
      avatarUrl: base.avatarPath ? urls.get(base.avatarPath) ?? null : null,
    }
  })
}

export interface ContactDetail {
  contact: NetworkContact
  notes: ContactNote[]
  tags: ContactTag[]
  avatarUrl: string | null
}

export async function getContact(ownerId: string, id: string): Promise<ContactDetail | null> {
  const { data } = await db()
    .from('network_contacts')
    .select(COLS)
    .eq('id', id)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (!data) return null
  const contact = mapContact(data as Record<string, unknown>)

  const [notesRes, tagsRes, avatarUrl] = await Promise.all([
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
  return { contact, notes, tags, avatarUrl }
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

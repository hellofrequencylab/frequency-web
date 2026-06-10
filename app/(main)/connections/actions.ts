'use server'

import { revalidatePath } from 'next/cache'
import { getCachedUser } from '@/lib/auth'
import { contactsOwnerId } from '@/lib/connections/access'
import { aiAvailable, featureOverBudget } from '@/lib/ai/usage'
import { scanCardImage, assistFromText } from '@/lib/ai/connections-ai'
import { dedupeTags, normalizeTag } from '@/lib/connections/normalize'
import * as store from '@/lib/connections/store'
import { mergeContactProfile, dismissContactMatch, unmergeContact } from '@/lib/connections/matching'
import { syncScanToCrm } from '@/lib/connections/crm-sync'
import { maybeSendScanIntro } from '@/lib/connections/invite'
import type {
  ExtractedContact,
  ContactSocials,
  ContactSource,
  ContactStatus,
  Visibility,
} from '@/lib/connections/types'

type Reason = 'unauthorized' | 'ai_unavailable' | 'no_read' | 'no_result'
type ExtractResult = { ok: true; extraction: ExtractedContact } | { ok: false; reason: Reason }

async function requireOwner(): Promise<string> {
  const ownerId = await contactsOwnerId()
  if (!ownerId) throw new Error('Unauthorized')
  return ownerId
}

/** Reject any storage path that isn't inside the caller's own folder. */
async function assertOwnPath(path: string): Promise<string> {
  const user = await getCachedUser()
  if (!user) throw new Error('Unauthorized')
  if (path.split('/')[0] !== user.id) throw new Error('Bad path')
  return path
}

// ── AI harvest ───────────────────────────────────────────────────────────────

/** Scan one or more images of the same contact (e.g. front + back of a card, plus
 *  other photos) that the client already uploaded to the private bucket. The temp
 *  scans are deleted after extraction (we keep only the cropped avatar). */
export async function scanCard(paths: string[]): Promise<ExtractResult> {
  const ownerId = await requireOwner()
  const clean = (paths ?? []).slice(0, 6)
  for (const p of clean) await assertOwnPath(p)
  if (!clean.length) return { ok: false, reason: 'no_read' }

  const cleanup = () => { for (const p of clean) void store.removeObject(p) }

  if (!(await aiAvailable()) || (await featureOverBudget('connection-scan'))) {
    cleanup()
    return { ok: false, reason: 'ai_unavailable' }
  }

  // Download in order so the model's photo.imageIndex matches the client's list.
  const images: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }[] = []
  for (const p of clean) {
    const img = await store.downloadImageBase64(p)
    if (img) images.push(img)
  }
  if (!images.length) { cleanup(); return { ok: false, reason: 'no_read' } }

  const extraction = await scanCardImage({ images, profileId: ownerId })
  cleanup() // best-effort delete of the temp scans

  if (!extraction) return { ok: false, reason: 'no_result' }
  return { ok: true, extraction }
}

/** Vera assist: tidy free text into a structured profile (no image). */
export async function veraAssist(text: string): Promise<ExtractResult> {
  const ownerId = await requireOwner()
  if (!(await aiAvailable()) || (await featureOverBudget('connection-assist'))) {
    return { ok: false, reason: 'ai_unavailable' }
  }
  const extraction = await assistFromText({ text, profileId: ownerId })
  if (!extraction) return { ok: false, reason: 'no_result' }
  return { ok: true, extraction }
}

// ── Create / update / delete ─────────────────────────────────────────────────

export interface CreateProfileInput {
  source: ContactSource
  displayName?: string
  email?: string
  phone?: string
  title?: string
  company?: string
  city?: string
  website?: string
  socials?: ContactSocials
  tags?: string[]
  connectionNote?: string
  avatarPath?: string | null
  visibility?: Visibility
  extraction?: unknown
  /** Send the one-time intro/invite email to this contact (if they have an email). */
  sendInvite?: boolean
}

export async function createProfile(input: CreateProfileInput): Promise<{ id: string } | { error: string }> {
  const ownerId = await requireOwner()
  if (input.avatarPath) await assertOwnPath(input.avatarPath)

  const id = await store.createContact(ownerId, {
    source: input.source,
    visibility: input.visibility ?? 'private',
    displayName: input.displayName,
    email: input.email,
    phone: input.phone,
    title: input.title,
    company: input.company,
    city: input.city,
    website: input.website,
    socials: input.socials,
    avatarPath: input.avatarPath ?? null,
    extraction: input.extraction,
  })
  if (!id) return { error: 'Could not save the profile.' }

  const tags = dedupeTags(input.tags)
  if (tags.length) await store.addTags(ownerId, id, tags, 'manual')

  const note = (input.connectionNote ?? '').trim()
  if (note) await store.addNote(ownerId, id, note, 'connection', ownerId)

  // Bridge into the shared CRM as an unknown/unsubscribed lead, then (optionally)
  // send the single intro/invite email. Both no-op without an email address.
  const email = (input.email ?? '').trim()
  if (email) {
    const contactId = await syncScanToCrm({ ownerId, networkContactId: id, email, displayName: input.displayName })
    if (input.sendInvite) {
      await maybeSendScanIntro({ ownerId, networkContactId: id, email, recipientName: input.displayName, contactId })
    }
  }

  revalidatePath('/connections')
  return { id }
}

/** Manually (re)trigger the one-time intro for a saved contact — from the detail
 *  page. Syncs to the shared CRM first, then sends if all gates pass. */
export async function inviteContact(id: string): Promise<{ sent: boolean; reason?: string }> {
  const ownerId = await requireOwner()
  const detail = await store.getContact(ownerId, id)
  const email = detail?.contact.email?.trim()
  if (!detail || !email) return { sent: false, reason: 'no_email' }
  const contactId = await syncScanToCrm({ ownerId, networkContactId: id, email, displayName: detail.contact.displayName })
  const res = await maybeSendScanIntro({ ownerId, networkContactId: id, email, recipientName: detail.contact.displayName, contactId })
  revalidatePath(`/connections/${id}`)
  return res.sent ? { sent: true } : { sent: false, reason: res.reason }
}

export interface UpdateProfileInput {
  displayName?: string
  email?: string
  phone?: string
  title?: string
  company?: string
  city?: string
  website?: string
  socials?: ContactSocials
}

export async function updateProfile(id: string, patch: UpdateProfileInput): Promise<void> {
  const ownerId = await requireOwner()
  await store.updateContact(ownerId, id, patch)
  revalidatePath('/connections')
  revalidatePath(`/connections/${id}`)
}

export async function deleteProfile(id: string): Promise<void> {
  const ownerId = await requireOwner()
  await store.deleteContact(ownerId, id)
  revalidatePath('/connections')
}

export async function setStatus(id: string, status: ContactStatus): Promise<void> {
  const ownerId = await requireOwner()
  await store.updateContact(ownerId, id, { status })
  revalidatePath('/connections')
  revalidatePath(`/connections/${id}`)
}

export async function setVisibility(id: string, visibility: Visibility): Promise<void> {
  const ownerId = await requireOwner()
  await store.updateContact(ownerId, id, { visibility })
  revalidatePath(`/connections/${id}`)
}

export async function setAvatar(id: string, path: string): Promise<void> {
  const ownerId = await requireOwner()
  await assertOwnPath(path)
  await store.updateContact(ownerId, id, { avatarPath: path })
  revalidatePath('/connections')
  revalidatePath(`/connections/${id}`)
}

// ── Notes & tags ─────────────────────────────────────────────────────────────

export async function addNote(contactId: string, body: string): Promise<void> {
  const ownerId = await requireOwner()
  await store.addNote(ownerId, contactId, body, 'note', ownerId)
  revalidatePath(`/connections/${contactId}`)
}

export async function deleteNote(contactId: string, noteId: string): Promise<void> {
  const ownerId = await requireOwner()
  await store.deleteNote(ownerId, noteId)
  revalidatePath(`/connections/${contactId}`)
}

export async function addTag(contactId: string, tag: string): Promise<void> {
  const ownerId = await requireOwner()
  const clean = normalizeTag(tag)
  if (clean) await store.addTags(ownerId, contactId, [clean], 'manual')
  revalidatePath(`/connections/${contactId}`)
}

export async function removeTag(contactId: string, tagId: string): Promise<void> {
  const ownerId = await requireOwner()
  await store.deleteTag(ownerId, tagId)
  revalidatePath(`/connections/${contactId}`)
}

// ── Contact ↔ Community merge ─────────────────────────────────────────────────

/** Merge a contact with the member profile it matches (links them; keeps your
 *  original logged fields + notes). Owner-scoped. */
export async function mergeWithMember(contactId: string, profileId: string): Promise<boolean> {
  const ownerId = await requireOwner()
  const ok = await mergeContactProfile(ownerId, contactId, profileId)
  revalidatePath('/network/contacts')
  revalidatePath(`/connections/${contactId}`)
  return ok
}

/** Dismiss the "this contact is a member" suggestion so it stops surfacing. */
export async function dismissMatch(contactId: string): Promise<void> {
  const ownerId = await requireOwner()
  await dismissContactMatch(ownerId, contactId)
  revalidatePath('/network/contacts')
}

/** Undo a merge — unlink the contact from the member profile. */
export async function unmergeFromMember(contactId: string): Promise<void> {
  const ownerId = await requireOwner()
  await unmergeContact(ownerId, contactId)
  revalidatePath('/network/contacts')
  revalidatePath(`/connections/${contactId}`)
}

/** Search members to link a contact to — the MANUAL path for when the auto
 *  detector can't fire (card email and signup email differ, no phone on the
 *  profile). Owner-gated; returns only public identity fields of active, real
 *  members. */
export async function searchMembersToLink(
  q: string,
): Promise<{ id: string; displayName: string | null; handle: string | null; avatarUrl: string | null }[]> {
  const ownerId = await requireOwner()
  const term = q.trim().replace(/[%,()]/g, '')
  if (term.length < 2) return []
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .eq('is_active', true)
    .eq('is_demo', false)
    .neq('id', ownerId)
    .or(`display_name.ilike.%${term}%,handle.ilike.%${term}%`)
    .limit(8)
  return ((data ?? []) as { id: string; display_name: string | null; handle: string | null; avatar_url: string | null }[]).map(
    (p) => ({ id: p.id, displayName: p.display_name, handle: p.handle, avatarUrl: p.avatar_url }),
  )
}

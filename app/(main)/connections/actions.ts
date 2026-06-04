'use server'

import { revalidatePath } from 'next/cache'
import { getCachedUser } from '@/lib/auth'
import { connectionsOwnerId } from '@/lib/connections/access'
import { aiAvailable, featureOverBudget } from '@/lib/ai/usage'
import { scanCardImage, assistFromText } from '@/lib/ai/connections-ai'
import { dedupeTags, normalizeTag } from '@/lib/connections/normalize'
import * as store from '@/lib/connections/store'
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
  const ownerId = await connectionsOwnerId()
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

/** Scan a card/poster the client already uploaded to the private bucket. The temp
 *  scan is deleted after extraction (we keep only the cropped avatar). */
export async function scanCard(path: string): Promise<ExtractResult> {
  const ownerId = await requireOwner()
  await assertOwnPath(path)

  if (!(await aiAvailable()) || (await featureOverBudget('connection-scan'))) {
    void store.removeObject(path)
    return { ok: false, reason: 'ai_unavailable' }
  }

  const img = await store.downloadImageBase64(path)
  if (!img) return { ok: false, reason: 'no_read' }

  const extraction = await scanCardImage({
    imageBase64: img.base64,
    mediaType: img.mediaType,
    profileId: ownerId,
  })
  void store.removeObject(path) // best-effort cleanup of the temp scan

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

  revalidatePath('/connections')
  return { id }
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

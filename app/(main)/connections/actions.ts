'use server'

import { revalidatePath } from 'next/cache'
import { getCachedUser } from '@/lib/auth'
import { contactsOwnerId } from '@/lib/connections/access'
import { aiAvailable, featureOverBudget } from '@/lib/ai/usage'
import { scanCardImage, assistFromText } from '@/lib/ai/connections-ai'
import { dedupeTags, normalizeTag, coerceContactDetails } from '@/lib/connections/normalize'
import * as store from '@/lib/connections/store'
import { mergeContactProfile, dismissContactMatch, unmergeContact } from '@/lib/connections/matching'
import { syncScanToCrm } from '@/lib/connections/crm-sync'
import { maybeSendScanIntro } from '@/lib/connections/invite'
import { recordContactInteraction, listContactInteractions } from '@/lib/crm/interactions'
import { buildTimeline } from '@/lib/crm/timeline'
import { buildBriefContext, generateContactBrief } from '@/lib/crm/brief'
import type {
  ExtractedContact,
  ContactSocials,
  ContactDetails,
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

/** Scan one or more images of the same contact (front, optional back, plus other
 *  photos) that the client already uploaded to the private bucket. Only the TEMP
 *  scan uploads passed in here are cleaned up after extraction; the client keeps
 *  the card on file by uploading the deskewed front/back to stable kept paths
 *  ({userId}/{uuid}-front.jpg / -back.jpg) and passing them to createProfile.
 *  `hasBack` tells the model image 2 is the back of the same card. */
export async function scanCard(paths: string[], opts?: { hasBack?: boolean }): Promise<ExtractResult> {
  const ownerId = await requireOwner()
  const clean = (paths ?? []).slice(0, 6)
  for (const p of clean) await assertOwnPath(p)
  if (!clean.length) return { ok: false, reason: 'no_read' }

  const cleanup = () => { for (const p of clean) void store.removeObject(p) }

  if (!(await aiAvailable()) || (await featureOverBudget('connection-scan'))) {
    cleanup()
    return { ok: false, reason: 'ai_unavailable' }
  }

  // Download in order so the model's imageIndex/corners line up with the
  // client's list (front, back, extras).
  const images: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }[] = []
  for (const p of clean) {
    const img = await store.downloadImageBase64(p)
    if (img) images.push(img)
  }
  if (!images.length) { cleanup(); return { ok: false, reason: 'no_read' } }

  const extraction = await scanCardImage({ images, hasBack: opts?.hasBack === true, profileId: ownerId })
  cleanup() // best-effort delete of the temp OCR scans only (keepers are uploaded separately)

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
  /** The flexible details rows from the form (re-validated server-side). */
  details?: ContactDetails
  /** Kept card images + logo, already uploaded by the client to its own folder. */
  cardFrontPath?: string | null
  cardBackPath?: string | null
  logoPath?: string | null
  visibility?: Visibility
  extraction?: unknown
  /** Send the one-time intro/invite email to this contact (if they have an email). */
  sendInvite?: boolean
}

export async function createProfile(input: CreateProfileInput): Promise<{ id: string } | { error: string }> {
  const ownerId = await requireOwner()
  if (input.avatarPath) await assertOwnPath(input.avatarPath)
  if (input.cardFrontPath) await assertOwnPath(input.cardFrontPath)
  if (input.cardBackPath) await assertOwnPath(input.cardBackPath)
  if (input.logoPath) await assertOwnPath(input.logoPath)

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
    details: coerceContactDetails(input.details),
    cardFrontPath: input.cardFrontPath ?? null,
    cardBackPath: input.cardBackPath ?? null,
    logoPath: input.logoPath ?? null,
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

export interface UpdateProfileInput {
  displayName?: string
  email?: string
  phone?: string
  title?: string
  company?: string
  city?: string
  website?: string
  socials?: ContactSocials
  /** The flexible details rows from the edit form (re-validated server-side). */
  details?: ContactDetails
}

export async function updateProfile(id: string, patch: UpdateProfileInput): Promise<void> {
  const ownerId = await requireOwner()
  await store.updateContact(ownerId, id, {
    ...patch,
    ...(patch.details !== undefined ? { details: coerceContactDetails(patch.details) } : {}),
  })
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
  // Offer only private ↔ network to members (ADR-154 §2); 'shared' is a separate
  // deferred tier, so never accept it here even if a caller forges the value.
  const next: Visibility = visibility === 'network' ? 'network' : 'private'
  await store.updateContact(ownerId, id, { visibility: next })
  revalidatePath('/network/contacts')
  revalidatePath(`/connections/${id}`)
}

// ── Promote to the marketing contacts DB (consent-gated, ADR-742) ─────────────

/** `promoted` — a fresh lead row was created/linked this call; `already` — it was
 *  already in the contacts DB (idempotent, no dup). Both carry the contacts.id. */
export type PromoteResult =
  | { ok: true; state: 'promoted' | 'already'; contactId: string }
  | { ok: false; reason: string }

/** Promote a personal capture into the SHARED marketing `contacts` DB as an
 *  unconfirmed lead (ADR-099/154). DELIBERATE + consent-gated: only the owner (member
 *  tier) may call it, the marketing row is created at consent_state='unknown' (added,
 *  never mailable until they confirm), and it links the personal row via
 *  linked_contact_id. Idempotent (an already-linked capture returns 'already', never a
 *  dup) and fail-safe (any error returns a calm reason, promotes nothing).
 *
 *  PRIVACY INVARIANT: we pass ONLY the email + display name to the bridge. Personal
 *  notes and tags are NEVER copied into the marketing layer. syncScanToCrm also never
 *  downgrades an existing lead/member's source or consent. */
export async function promoteToContacts(contactId: string): Promise<PromoteResult> {
  const ownerId = await requireOwner()

  // Re-read the row from a trusted, owner-scoped source (never trust client-supplied
  // fields) — this is also the ownership check: a capture the caller doesn't own reads null.
  const detail = await store.getContact(ownerId, contactId)
  if (!detail) return { ok: false, reason: 'That contact is not in your list.' }
  const { contact } = detail

  // Idempotent: already bridged → report the linked state, create nothing.
  if (contact.linkedContactId) return { ok: true, state: 'already', contactId: contact.linkedContactId }

  const email = (contact.email ?? '').trim()
  if (!email) return { ok: false, reason: 'Add an email first. Frequency contacts are matched by email address.' }

  try {
    const cid = await syncScanToCrm({
      ownerId,
      networkContactId: contactId,
      email,
      displayName: contact.displayName,
      // NOTE: no notes, no tags — the marketing layer never receives your private annotations.
    })
    if (!cid) return { ok: false, reason: 'Could not add them right now. Try again in a moment.' }
    revalidatePath('/network/contacts')
    revalidatePath(`/connections/${contactId}`)
    return { ok: true, state: 'promoted', contactId: cid }
  } catch {
    // Fail-safe: never surface a raw error to the member, and promote nothing on a throw.
    return { ok: false, reason: 'Could not add them right now. Try again in a moment.' }
  }
}

// ── Notes & tags ─────────────────────────────────────────────────────────────

export async function addNote(contactId: string, body: string): Promise<void> {
  const ownerId = await requireOwner()
  const ok = await store.addNote(ownerId, contactId, body, 'note', ownerId)
  // A note is a touch — stamp last-contacted so the reach-out list stays honest.
  if (ok) await store.touchLastContacted(ownerId, contactId)
  revalidatePath('/network/contacts')
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

// ── Pre-interaction brief (Vera, metered) ─────────────────────────────────────

export type BriefResult = { ok: true; brief: string } | { ok: false; reason: string }

/** Write a short prep brief for a contact before reaching out (ADR-372 Phase 4). Owner-gated,
 *  metered through the ai_usage ledger, and fail-soft: when Vera is off or over budget it returns a
 *  calm reason rather than an error, and it NEVER sends anything (ADR-028). */
export async function briefContact(contactId: string): Promise<BriefResult> {
  const ownerId = await requireOwner()
  if (!(await aiAvailable()) || (await featureOverBudget('crm-brief'))) {
    return { ok: false, reason: 'Vera is resting right now. Try again in a bit.' }
  }
  const [detail, interactions, reminders] = await Promise.all([
    store.getContact(ownerId, contactId),
    listContactInteractions({ ownerProfileId: ownerId, subjectKind: 'network_contact', subjectId: contactId }),
    store.listRemindersForContact(ownerId, contactId),
  ])
  if (!detail) return { ok: false, reason: 'That contact is not in your list.' }

  const context = buildBriefContext({
    name: detail.contact.displayName ?? 'this contact',
    title: detail.contact.title,
    company: detail.contact.company,
    city: detail.contact.city,
    tags: detail.tags.map((t) => t.tag),
    notes: detail.notes.map((n) => ({ body: n.body, createdAt: n.createdAt })),
    timeline: buildTimeline({ interactions }),
    openReminders: reminders.map((r) => ({ dueAt: r.dueAt, note: r.note })),
    lastContactedAt: detail.contact.lastContactedAt,
  })

  const brief = await generateContactBrief({ context, profileId: ownerId })
  if (!brief) return { ok: false, reason: 'Could not write a brief just now. Try again.' }
  return { ok: true, brief }
}

// ── Follow-up reminders (the free keep-in-touch layer) ────────────────────────

export async function addReminder(
  contactId: string,
  dueAt: string,
  note?: string,
): Promise<boolean> {
  const ownerId = await requireOwner()
  const ok = await store.addReminder(ownerId, contactId, dueAt, note ?? null)
  revalidatePath('/network/contacts')
  revalidatePath(`/connections/${contactId}`)
  return ok
}

export async function completeReminder(reminderId: string, contactId?: string): Promise<boolean> {
  const ownerId = await requireOwner()
  const ok = await store.completeReminder(ownerId, reminderId)
  // Completing a follow-up is a touch.
  if (ok && contactId) {
    await store.touchLastContacted(ownerId, contactId)
    // Mirror it onto the unified CRM timeline (ADR-372). Fail-safe: recordContactInteraction
    // never throws, so a timeline write can never break completing a reminder.
    await recordContactInteraction({
      ownerProfileId: ownerId,
      subjectKind: 'network_contact',
      subjectId: contactId,
      channel: 'system',
      direction: 'outbound',
      summary: 'Followed up',
      source: 'system',
    })
  }
  revalidatePath('/network/contacts')
  if (contactId) revalidatePath(`/connections/${contactId}`)
  return ok
}

export async function deleteReminder(reminderId: string, contactId?: string): Promise<boolean> {
  const ownerId = await requireOwner()
  const ok = await store.deleteReminder(ownerId, reminderId)
  revalidatePath('/network/contacts')
  if (contactId) revalidatePath(`/connections/${contactId}`)
  return ok
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
  const term = q.trim()
  if (term.length < 2) return []
  // SEC-10: search each column with a parameterized `.ilike()` and merge,
  // instead of interpolating user input into a `.or()` filter string (which
  // PostgREST parses for its own operators/delimiters). `.ilike()` takes the
  // pattern as a bound value, so only the wildcard needs escaping.
  const pattern = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const admin = (await import('@/lib/supabase/admin')).createAdminClient()
  const base = () =>
    admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .eq('is_active', true)
      .eq('is_demo', false)
      .neq('id', ownerId)
      .limit(8)
  const [byName, byHandle] = await Promise.all([
    base().ilike('display_name', pattern),
    base().ilike('handle', pattern),
  ])
  type Row = { id: string; display_name: string | null; handle: string | null; avatar_url: string | null }
  const merged = new Map<string, Row>()
  for (const p of [...((byName.data ?? []) as Row[]), ...((byHandle.data ?? []) as Row[])]) {
    if (!merged.has(p.id)) merged.set(p.id, p)
  }
  return [...merged.values()].slice(0, 8).map(
    (p) => ({ id: p.id, displayName: p.display_name, handle: p.handle, avatarUrl: p.avatar_url }),
  )
}

'use server'

// Server actions for the Poster Events capture UI (the client islands in
// app/(main)/events/scan + /events/drafts call these). Mirrors the card-scan
// actions (app/(main)/connections/actions.ts): the client uploads downscaled
// images to the PRIVATE network-contacts bucket under its own auth-user folder,
// the server gates AI on availability + budget, runs ONE vision call, and every
// write is owner-scoped. The engine (lib/events/event-drafts.ts) owns the rows.

import { revalidatePath } from 'next/cache'
import { getCachedUser, getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiAvailable, featureOverBudget } from '@/lib/ai/usage'
import { scanEventPoster } from '@/lib/ai/events-ai'
import { downloadImageBase64, removeObject } from '@/lib/connections/store'
import { coerceEventDetails, coerceDomain, coerceIsoDate, clampImageBox } from '@/lib/events/normalize'
import {
  coerceDetailsMedia,
  detailsMediaPaths,
  isOwnedStoragePath,
  type EventDetailsWithMedia,
} from '@/lib/events/details-media'
import {
  createEventDraft,
  getMyDraft,
  updateEventDraft,
  publishEventDraft,
  type DraftOwnership,
} from '@/lib/events/event-drafts'
import type { ExtractedEvent } from '@/lib/events/types'

type ScanReason = 'unauthorized' | 'ai_unavailable' | 'no_read' | 'no_result'
export type ScanPosterResult =
  | { ok: true; extraction: ExtractedEvent; posterPath: string }
  | { ok: false; reason: ScanReason }

/** The signed-in caller, with both ids the flow needs: the profile id (event
 *  rows) and the auth-user id (storage folder ownership). */
async function requireCaller(): Promise<{ profileId: string; userId: string }> {
  const [profileId, user] = await Promise.all([getMyProfileId(), getCachedUser()])
  if (!profileId || !user) throw new Error('Unauthorized')
  return { profileId, userId: user.id }
}

/**
 * Scan one or more photos of the SAME poster that the client already uploaded
 * (downscaled on-device) to the private bucket. ONE vision call; the first
 * image is KEPT as the event's poster_path, the extra shots are deleted after
 * extraction.
 */
export async function scanPoster(paths: string[], text?: string): Promise<ScanPosterResult> {
  const { profileId, userId } = await requireCaller()
  const clean = (paths ?? []).slice(0, 6)
  if (!clean.length) return { ok: false, reason: 'no_read' }
  for (const p of clean) {
    if (!isOwnedStoragePath(p, userId)) throw new Error('Bad path')
  }

  // The first shot stays as the poster image; the rest are temp scans.
  const [posterPath, ...extras] = clean
  const cleanupExtras = () => { for (const p of extras) void removeObject(p) }
  const cleanupAll = () => { void removeObject(posterPath); cleanupExtras() }

  if (!(await aiAvailable()) || (await featureOverBudget('event-poster-scan'))) {
    cleanupAll()
    return { ok: false, reason: 'ai_unavailable' }
  }

  // Download in order so the model's cover.imageIndex matches the client list.
  const images: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }[] = []
  for (const p of clean) {
    const img = await downloadImageBase64(p)
    if (img) images.push(img)
  }
  if (!images.length) {
    cleanupAll()
    return { ok: false, reason: 'no_read' }
  }

  const extraction = await scanEventPoster({ images, text, profileId })
  cleanupExtras() // best-effort; the poster image itself is kept

  if (!extraction) {
    void removeObject(posterPath)
    return { ok: false, reason: 'no_result' }
  }
  return { ok: true, extraction, posterPath }
}

/** Discard a kept poster image after a retake (best-effort cleanup). */
export async function discardScan(path: string): Promise<void> {
  const { userId } = await requireCaller()
  if (isOwnedStoragePath(path, userId)) await removeObject(path)
}

// ── Draft input sanitation ────────────────────────────────────────────────────

export interface DraftFormInput {
  title?: string
  description?: string
  /** ISO 8601 (the client converts its datetime-local values), or null. */
  startsAt?: string | null
  endsAt?: string | null
  location?: string
  isFree?: boolean
  priceCents?: number | null
  organizerName?: string
  organizerContact?: string
  /** Pillar slug (mind/body/spirit/expression) or null. */
  domain?: string | null
  posterPath?: string | null
  /** EventDetailsWithMedia from the client — fully re-validated here. */
  details?: unknown
}

/**
 * Untrusted client details → the persisted shape: the engine's coercer cleans
 * the rows, then the parallel `media` crop-path object is re-derived with the
 * SAME keep-rules the coercer applies (lineup rows need a name, gallery regions
 * need a usable box) so its row-index keys line up with the cleaned arrays.
 */
function sanitizeDetails(raw: unknown, ownerId: string): EventDetailsWithMedia {
  const base: EventDetailsWithMedia = coerceEventDetails(raw)
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>

  const media = coerceDetailsMedia(r.media, ownerId)
  if (!media) return base

  // Re-key lineup/gallery against the rows the coercer KEPT (same predicates +
  // caps as coerceEventDetails: lineup keeps rows with a non-empty name, capped
  // at 24; imageRegions keeps rows with a usable box, capped at 12).
  const rekey = (
    rows: unknown,
    keep: (row: Record<string, unknown>) => boolean,
    cap: number,
    map: Record<string, string> | undefined,
  ): Record<string, string> | undefined => {
    if (!map || !Array.isArray(rows)) return undefined
    const out: Record<string, string> = {}
    let kept = 0
    for (let i = 0; i < rows.length && kept < cap; i++) {
      const row = rows[i]
      if (!row || typeof row !== 'object' || !keep(row as Record<string, unknown>)) continue
      const path = map[String(i)]
      if (path) out[String(kept)] = path
      kept += 1
    }
    return Object.keys(out).length ? out : undefined
  }

  const cleanMedia = {
    ...(media.coverPath ? { coverPath: media.coverPath } : {}),
    ...(() => {
      const lineup = rekey(
        r.lineup,
        (row) => typeof row.name === 'string' && row.name.trim().length > 0,
        24,
        media.lineup,
      )
      return lineup ? { lineup } : {}
    })(),
    ...(() => {
      const gallery = rekey(r.imageRegions, (row) => clampImageBox(row.box) !== null, 12, media.gallery)
      return gallery ? { gallery } : {}
    })(),
  }

  return Object.keys(cleanMedia).length ? { ...base, media: cleanMedia } : base
}

function cleanIso(raw: string | null | undefined): string | null {
  return coerceIsoDate(raw ?? '') || null
}

function cleanPrice(input: DraftFormInput): number | null {
  if (input.isFree) return 0
  const n = typeof input.priceCents === 'number' ? input.priceCents : NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

// ── Draft lifecycle ───────────────────────────────────────────────────────────

/** Create a draft from the capture flow (the editor opens it next). */
export async function saveDraft(input: DraftFormInput): Promise<{ id: string } | { error: string }> {
  const { profileId, userId } = await requireCaller()
  const posterPath =
    input.posterPath && isOwnedStoragePath(input.posterPath, userId) ? input.posterPath : null

  const created = await createEventDraft(profileId, {
    title: input.title,
    description: input.description,
    startsAt: cleanIso(input.startsAt),
    endsAt: cleanIso(input.endsAt),
    location: input.location,
    priceCents: cleanPrice(input),
    organizerName: input.organizerName,
    organizerContact: input.organizerContact,
    domain: coerceDomain(input.domain),
    posterPath,
    details: sanitizeDetails(input.details, userId),
  })
  if (!created) return { error: 'Could not save the draft. Try again.' }

  revalidatePath('/events/drafts')
  return { id: created.id }
}

/** Patch a draft the caller owns (the editor's Save). */
export async function updateDraft(
  id: string,
  patch: DraftFormInput,
): Promise<{ ok: true } | { error: string }> {
  const { profileId, userId } = await requireCaller()

  const ok = await updateEventDraft(profileId, id, {
    title: patch.title ?? '',
    description: patch.description ?? null,
    startsAt: cleanIso(patch.startsAt),
    endsAt: cleanIso(patch.endsAt),
    location: patch.location ?? null,
    priceCents: cleanPrice(patch),
    organizerName: patch.organizerName ?? null,
    organizerContact: patch.organizerContact ?? null,
    domain: coerceDomain(patch.domain),
    details: sanitizeDetails(patch.details, userId),
  })
  if (!ok) return { error: 'Could not save. The draft may already be published.' }

  revalidatePath('/events/drafts')
  revalidatePath(`/events/drafts/${id}`)
  return { ok: true }
}

export type PublishDraftResult =
  | { ok: true; slug: string; claimToken?: string }
  | { ok: false; error: string }

/** Publish a draft: 'mine' makes the caller the host; 'posted' publishes on the
 *  organizer's behalf and mints the one-time claim token. */
export async function publishDraft(id: string, ownership: DraftOwnership): Promise<PublishDraftResult> {
  const { profileId } = await requireCaller()
  const kind: DraftOwnership = ownership === 'mine' ? 'mine' : 'posted'

  const res = await publishEventDraft(profileId, id, kind)
  if (!res) return { ok: false, error: 'Could not publish. The draft may already be live.' }

  revalidatePath('/events')
  revalidatePath('/events/drafts')
  revalidatePath(`/events/drafts/${id}`)
  if (res.slug) revalidatePath(`/events/${res.slug}`)
  return { ok: true, slug: res.slug, ...(res.claimToken ? { claimToken: res.claimToken } : {}) }
}

/** Delete one of the caller's UNPUBLISHED drafts, plus its stored images
 *  (poster + crops, best-effort). Published events are never deleted here. */
export async function deleteDraft(id: string): Promise<{ ok: true } | { error: string }> {
  const { profileId } = await requireCaller()

  const draft = await getMyDraft(profileId, id)
  if (!draft) return { error: 'Draft not found.' }
  if (draft.status !== 'draft') return { error: 'Published events cannot be deleted here.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('events')
    .delete()
    .eq('id', id)
    .eq('posted_by_profile_id', profileId)
    .eq('status', 'draft')
  if (error) return { error: 'Could not delete the draft.' }

  // Best-effort storage cleanup: the kept poster image + every crop.
  if (draft.posterPath) void removeObject(draft.posterPath)
  for (const p of detailsMediaPaths(draft.details as EventDetailsWithMedia)) void removeObject(p)

  revalidatePath('/events/drafts')
  return { ok: true }
}

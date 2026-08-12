'use server'

// Server actions for the Poster Events capture UI (the client islands in
// app/(main)/events/scan, the per-event editor at /events/drafts/<id>, and the
// captured-event rows on /drafts call these). Mirrors the card-scan
// actions (app/(main)/connections/actions.ts): the client uploads downscaled
// images to the PRIVATE network-contacts bucket under its own auth-user folder,
// the server gates AI on availability + budget, runs ONE vision call, and every
// write is owner-scoped. The engine (lib/events/event-drafts.ts) owns the rows.
//
// TWO DOORS OUT OF ONE READ (ADR-997). `scanPoster` hands the read back to the member's
// browser, which cuts the crops and saves a draft. `scanPosterForReview` is the operator's
// batch door: it stages the read on `event_intake` for the Event Seeder instead, so a walk
// round town with fifty posters becomes one review board rather than fifty drafts. Both go
// through the same private vision pass (`readPoster`), so the gate, the budget check, the
// path-ownership check and the cleanup rule exist once.

import { revalidatePath } from 'next/cache'
import { getCachedUser, getMyProfileId } from '@/lib/auth'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiAvailable, featureOverBudget } from '@/lib/ai/usage'
import { scanEventPoster } from '@/lib/ai/events-ai'
import { downloadImageBase64, removeObject } from '@/lib/connections/store'
import { mergePosterLinks } from '@/lib/events/seed/draft'
import { stageScannedEvent } from '@/lib/events/seed/from-scan'
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
 * THE ONE VISION PASS, shared by both doors below.
 *
 * Reads photos of the SAME poster that the client already uploaded (downscaled on-device) to
 * the private bucket. ONE vision call; the first image is KEPT as the event's poster_path, the
 * extra shots are deleted after extraction. Every path is ownership-checked against the
 * caller's own auth-user folder before anything is downloaded.
 *
 * Both the member's draft flow and the operator's staging flow go through here, so there is
 * one gate, one budget check, one cleanup rule, and one place a change to any of them lands.
 */
async function readPoster(
  paths: string[],
  who: { profileId: string; userId: string },
  text?: string,
): Promise<ScanPosterResult> {
  const clean = (paths ?? []).slice(0, 6)
  if (!clean.length) return { ok: false, reason: 'no_read' }
  for (const p of clean) {
    if (!isOwnedStoragePath(p, who.userId)) throw new Error('Bad path')
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

  const extraction = await scanEventPoster({ images, text, profileId: who.profileId })
  cleanupExtras() // best-effort; the poster image itself is kept

  if (!extraction) {
    void removeObject(posterPath)
    return { ok: false, reason: 'no_result' }
  }
  return { ok: true, extraction, posterPath }
}

/** Scan a poster for the MEMBER flow: the read comes back to the browser, which cuts the
 *  crops and calls saveDraft. Unchanged behaviour, now over the shared pass above. */
export async function scanPoster(paths: string[], text?: string): Promise<ScanPosterResult> {
  return readPoster(paths, await requireCaller(), text)
}

// ── The operator's batch door: scan straight onto the review board (ADR-997) ───

export type StagePosterResult =
  | { ok: true; intakeId: string; title: string }
  | { ok: false; reason: ScanReason | 'too_thin' | 'not_staged' }

/**
 * Read a poster and STAGE it on `event_intake` for the Event Seeder, in one request.
 *
 * This is the flyer half of ADR-989's seeding, and it is the counterpart of the chat
 * importer's `stageEventsForReview`. An operator working a batch of posters photographs one,
 * sends it, and moves on: the review happens later, in one place, field by field against the
 * poster. It writes to the service-role-only staging table and nowhere else. The event itself
 * is written later still, by the Seeder's own apply, as an unlisted draft.
 *
 * TRUST. The extraction NEVER round-trips through the browser here: the vision pass runs in
 * this request and the result goes straight to the stager, which re-coerces it anyway. The
 * client supplies exactly two things, and both are re-validated server-side: the storage
 * paths (checked against the caller's own folder, as always) and the QR URLs its own device
 * decoded, which are re-coerced through the details coercer before they are merged. No ledger
 * snippet comes from the client, because a flyer read cites no text at all: the receipt on the
 * board is the poster photo.
 *
 * GATE. The console's own rung (`admin` + `community:write`), re-checked here rather than
 * inherited from whether the button rendered.
 */
export async function scanPosterForReview(paths: string[], qrLinks?: unknown): Promise<StagePosterResult> {
  const { profileId } = await requireAdmin('admin', { staff: 'community', staffLevel: 'write' })
  const user = await getCachedUser()
  if (!profileId || !user) return { ok: false, reason: 'unauthorized' }

  const read = await readPoster(paths, { profileId, userId: user.id })
  if (!read.ok) return read

  // The QR codes the operator's device decoded off the full-resolution shots. A QR pattern is
  // the one thing the vision model cannot read, and on a poster it is usually the booking
  // link. Client-supplied, so it goes through the SAME coercer the details column uses (safe
  // http/https only, labelled, capped) before it is folded into the read.
  const extraLinks = coerceEventDetails({ links: qrLinks }).links ?? []
  const extraction = { ...read.extraction, details: mergePosterLinks(read.extraction.details, extraLinks) }

  const intakeId = await stageScannedEvent({
    operatorId: profileId,
    extraction,
    posterPath: read.posterPath,
  })
  if (!intakeId) {
    // Nothing was staged, so the kept poster has nothing to belong to. Clean it up rather
    // than leaving an orphan object in the bucket.
    void removeObject(read.posterPath)
    return { ok: false, reason: extraction.title.trim() ? 'not_staged' : 'too_thin' }
  }

  revalidatePath('/admin/event-seeder')
  return { ok: true, intakeId, title: extraction.title.trim() || 'Untitled event' }
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
  /** The Space this draft belongs to (the space Calendar console wizard path). Re-validated
   *  server-side: kept only when the caller helps run the space (editor+). */
  spaceId?: string | null
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

  // AUTHZ: a client-sent space id counts only when the caller actually helps run that space
  // (editor+ — the same authority as createEvent's 'space' scope). Anything else drops to a
  // personal draft rather than letting a POST attribute an event to someone else's space.
  let spaceId: string | null = null
  if (input.spaceId) {
    const { listSpaceEventCreatorIds } = await import('@/lib/events/placement')
    const creators = await listSpaceEventCreatorIds(input.spaceId)
    if (creators.includes(profileId)) spaceId = input.spaceId
  }

  const created = await createEventDraft(profileId, {
    spaceId,
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

  revalidatePath('/drafts')
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

  revalidatePath('/drafts')
  revalidatePath(`/events/drafts/${id}`)
  return { ok: true }
}

export type PublishDraftResult =
  | { ok: true; slug: string; claimToken?: string; claimSentTo?: string }
  | { ok: false; error: string }

/** Publish a draft: 'mine' makes the caller the host; 'posted' publishes on the
 *  organizer's behalf and mints the one-time claim token. Guards the start date so a
 *  scanned event with a missing or past date can't silently vanish from the library
 *  (it would never pass the `starts_at >= now` listing filter). */
export async function publishDraft(id: string, ownership: DraftOwnership): Promise<PublishDraftResult> {
  const { profileId } = await requireCaller()
  const kind: DraftOwnership = ownership === 'mine' ? 'mine' : 'posted'

  // Date gate: publishable ⟺ listable. The events Catalog only shows `starts_at >= now`,
  // so block a missing/past start with a clear reason rather than publishing into the void.
  const draft = await getMyDraft(profileId, id)
  if (!draft) return { ok: false, error: 'Draft not found.' }
  const startMs = draft.startsAt ? new Date(draft.startsAt).getTime() : NaN
  if (!Number.isFinite(startMs)) {
    return { ok: false, error: 'Add a start date before publishing, so people can find this event.' }
  }
  if (startMs < Date.now()) {
    return { ok: false, error: 'That start date is in the past. Set a future date before publishing (the scan may have misread the year).' }
  }

  const res = await publishEventDraft(profileId, id, kind)
  if (!res) return { ok: false, error: 'Could not publish. The draft may already be live.' }

  revalidatePath('/events')
  revalidatePath('/drafts')
  revalidatePath(`/events/drafts/${id}`)
  if (res.slug) revalidatePath(`/events/${res.slug}`)
  return {
    ok: true,
    slug: res.slug,
    ...(res.claimToken ? { claimToken: res.claimToken } : {}),
    ...(res.claimSentTo ? { claimSentTo: res.claimSentTo } : {}),
  }
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

  revalidatePath('/drafts')
  return { ok: true }
}

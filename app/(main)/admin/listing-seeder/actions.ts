'use server'

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the operator console ACTIONS (Wave 1). An operator
// pastes copied listing copy + photos; these actions capture the intake, run the
// one-shot AI extract + PURE coerce, stage the reviewable draft, take the operator's
// per-field edits, hold the photo uploads, and hand a reviewed intake to Wave 2's
// publish. Simpler than the business seeder: no URL crawl, no research queue — the
// paste IS the source, extracted in a single shot.
//
// AUTHZ: every action gates on requireStaffCap('structure', 'write') — seeding a
// listing WRITES public content, the same authority the business seeder carries
// (pnpm check:authz recognizes the guard). The listing_intake table is service-role
// only (RLS enabled, no policies), so the ONLY access path is the admin client here;
// every read/write binds to the intake id, and the list read binds to the operator
// (created_by). FAIL-SAFE: a degraded / erroring intake returns a clear result, never
// throws to the page.
//
// The listing_intake jsonb columns (inputs / draft / ledger) are typed Json in
// database.types, so this module reaches the row through a narrow untyped cast and
// returns the typed shapes from lib/listing-seeder/types, exactly like lib/importer/store.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache'
import { requireStaffCap } from '@/lib/staff'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LedgerEntry, ProvenanceLedger } from '@/lib/importer/schema'
import { extractListing } from '@/lib/listing-seeder/extract'
import { coerceListingExtraction } from '@/lib/listing-seeder/coerce'
import { publishListingIntake } from '@/lib/listing-seeder/publish'
import { findSimilarSeededListings, type SimilarSeededListing } from '@/lib/listing-seeder/dedupe'
import type {
  ClassifiedsExtraction,
  HousingExtraction,
  ListingDraft,
  ListingIntake,
  ListingIntakeInputs,
  ListingIntakeStatus,
  ListingHints,
  ListingSeedKind,
} from '@/lib/listing-seeder/types'
import { LISTING_SEED_KINDS } from '@/lib/listing-seeder/types'
import { buildListingReviewModel, listingDraftTitle, type ListingReviewModel } from './review-model'

const TABLE = 'listing_intake'
const BASE = '/admin/listing-seeder'

// ── The untyped admin handle (table jsonb columns are typed Json) ──────────────────

/** The untyped admin handle for listing_intake, mirroring lib/importer/store.ts. */
function intakeTable() {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> }
      }
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
      delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
          order: (c: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
          }
        }
      }
    }
  }
  return db.from(TABLE)
}

/** Map a raw DB row to the typed ListingIntake. Defensive: jsonb columns default to their
 *  empty shape so a partial row never crashes a consumer. */
function mapRow(raw: Record<string, unknown>): ListingIntake {
  return {
    id: raw.id as string,
    kind: (raw.kind as ListingSeedKind) ?? 'classifieds',
    inputs: (raw.inputs as ListingIntakeInputs) ?? { pastedText: '' },
    draft: (raw.draft as ListingDraft | Record<string, unknown>) ?? {},
    ledger: (raw.ledger as ProvenanceLedger) ?? {},
    status: (raw.status as ListingIntakeStatus) ?? 'intake',
    appliedListingId: (raw.applied_listing_id as string | null) ?? null,
    createdBy: (raw.created_by as string) ?? '',
    error: (raw.error as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  }
}

/** Read one intake row by id. Fail-safe null. Bound to the intake id. */
async function getRow(intakeId: string): Promise<ListingIntake | null> {
  try {
    const { data, error } = await intakeTable()
      .select('id, kind, inputs, draft, ledger, status, applied_listing_id, created_by, error, created_at, updated_at')
      .eq('id', intakeId)
      .maybeSingle()
    if (error || !data) return null
    return mapRow(data)
  } catch {
    return null
  }
}

// ── Start (capture + extract + coerce, one shot) ──────────────────────────────────

export interface StartListingIntakeInput {
  kind: ListingSeedKind
  pastedText: string
  hints?: ListingHints
  /** Public `library-media` URLs already staged (first-is-primary). Usually empty at start;
   *  the review board stages photos onto the intake after it exists. */
  images?: string[]
}

export type StartListingIntakeResult = { ok: true; intakeId: string } | { ok: false; error: string }

/** An empty extraction of a kind, for the AI-off / failed path (the operator fills the draft in). */
function emptyExtraction(kind: ListingSeedKind): ClassifiedsExtraction | HousingExtraction {
  return kind === 'classifieds' ? { kind: 'classifieds' } : { kind: 'housing' }
}

/** Clean the operator hints down to the non-empty ones. PURE. */
function cleanHints(hints?: ListingHints): ListingHints | undefined {
  if (!hints) return undefined
  const out: ListingHints = {}
  if (hints.city?.trim()) out.city = hints.city.trim()
  if (hints.neighborhood?.trim()) out.neighborhood = hints.neighborhood.trim()
  if (hints.category?.trim()) out.category = hints.category.trim()
  return Object.keys(out).length ? out : undefined
}

/**
 * Start a listing seed: create the intake row (status 'intake'), run the AI extract + the PURE
 * coerce in one shot, stage the coerced draft + first-pass ledger, and move the row to 'review'.
 * Returns the intake id so the console routes into the review board. AI off / over budget degrades
 * to an empty draft the operator fills by hand (never a crash). Bound to the operator (created_by).
 */
export async function startListingIntake(input: StartListingIntakeInput): Promise<StartListingIntakeResult> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  if (!operatorId) return { ok: false, error: 'No operator profile.' }

  const kind = LISTING_SEED_KINDS.includes(input.kind) ? input.kind : 'classifieds'
  const pastedText = (input.pastedText ?? '').trim()
  if (!pastedText) return { ok: false, error: 'Paste the listing copy to seed from.' }

  const hints = cleanHints(input.hints)
  const images = Array.isArray(input.images) ? input.images.filter((u): u is string => typeof u === 'string' && u.length > 0) : []
  const inputs: ListingIntakeInputs = { pastedText, ...(images.length ? { images } : {}), ...(hints ? { hints } : {}) }

  // Create the row (status 'intake').
  let intakeId: string
  try {
    const { data, error } = await intakeTable()
      .insert({ kind, status: 'intake', inputs, created_by: operatorId })
      .select('id')
      .maybeSingle()
    if (error || !data?.id) return { ok: false, error: 'Could not create the intake record.' }
    intakeId = data.id as string
  } catch {
    return { ok: false, error: 'Could not create the intake record.' }
  }

  // Extract (fail-safe null) then PURE coerce. AI off -> empty draft the operator completes.
  const raw = await extractListing({ kind, pastedText, hints, profileId: operatorId })
  const { draft, ledger } = coerceListingExtraction(raw ?? emptyExtraction(kind), kind, pastedText)

  try {
    const { error } = await intakeTable()
      .update({ draft, ledger, status: 'review', updated_at: new Date().toISOString() })
      .eq('id', intakeId)
    if (error) {
      await intakeTable().update({ status: 'failed', error: 'The draft could not be staged.' }).eq('id', intakeId)
      return { ok: false, error: 'The draft could not be staged. Try again.' }
    }
  } catch {
    return { ok: false, error: 'The draft could not be staged. Try again.' }
  }

  revalidatePath(BASE)
  return { ok: true, intakeId }
}

// ── Console list read ──────────────────────────────────────────────────────────────

export interface ListingIntakeListItem {
  id: string
  kind: ListingSeedKind
  status: ListingIntakeStatus
  title: string
  createdAt: string
  updatedAt: string
  error: string | null
}

/** The operator's intakes, most-recent first, for the console landing view. Fail-safe []. Bound to
 *  the operator (created_by), so an operator sees only their own seeds. */
export async function listListingIntakes(): Promise<ListingIntakeListItem[]> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  if (!operatorId) return []
  try {
    const { data, error } = await intakeTable()
      .select('id, kind, status, draft, created_at, updated_at, error')
      .eq('created_by', operatorId)
      .order('updated_at', { ascending: false })
      .limit(100)
    if (error || !data) return []
    return data.map((raw) => ({
      id: raw.id as string,
      kind: (raw.kind as ListingSeedKind) ?? 'classifieds',
      status: (raw.status as ListingIntakeStatus) ?? 'intake',
      title: listingDraftTitle(raw.draft as Parameters<typeof listingDraftTitle>[0]),
      createdAt: raw.created_at as string,
      updatedAt: raw.updated_at as string,
      error: (raw.error as string | null) ?? null,
    }))
  } catch {
    return []
  }
}

// ── Review board read ───────────────────────────────────────────────────────────────

export interface ListingIntakeReview {
  id: string
  kind: ListingSeedKind
  status: ListingIntakeStatus
  title: string
  error: string | null
  model: ListingReviewModel
  images: string[]
  appliedListingId: string | null
}

/** Whether a draft is a fully-coerced ListingDraft (has a `kind` discriminant). */
function isListingDraft(draft: unknown): draft is ListingDraft {
  if (!draft || typeof draft !== 'object') return false
  const kind = (draft as { kind?: unknown }).kind
  return kind === 'classifieds' || kind === 'housing'
}

/** Load the review model for one intake. Fail-safe null (the page shows a clear state). */
export async function getListingIntakeReview(intakeId: string): Promise<ListingIntakeReview | null> {
  await requireStaffCap('structure', 'write')
  const row = await getRow(intakeId)
  if (!row) return null
  const draft: ListingDraft = isListingDraft(row.draft)
    ? row.draft
    : ({ kind: row.kind, title: '', description: null, images: [] } as unknown as ListingDraft)
  const images = Array.isArray(row.inputs.images) ? row.inputs.images.filter((u): u is string => typeof u === 'string') : []
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: listingDraftTitle(draft as Parameters<typeof listingDraftTitle>[0]),
    error: row.error,
    model: buildListingReviewModel(draft, row.ledger),
    images,
    appliedListingId: row.appliedListingId,
  }
}

// ── Soft dedupe (a warning, never a block) ─────────────────────────────────────────────

/**
 * Check whether a SIMILAR seeded listing already exists (same kind, same city, fuzzy-similar title)
 * BEFORE the operator publishes. Staff-gated, bound to the intake id; delegates to the pure/query
 * helper in lib/listing-seeder/dedupe. Fail-safe to [] — this is advisory only and must never block a
 * publish. Excludes the intake's own already-published listing so a re-visited applied seed never
 * flags itself.
 */
export async function checkListingDuplicatesAction(intakeId: string): Promise<SimilarSeededListing[]> {
  await requireStaffCap('structure', 'write')
  const row = await getRow(intakeId)
  if (!row || !isListingDraft(row.draft)) return []
  const title = (row.draft.title ?? '').trim()
  if (!title) return []
  const hits = await findSimilarSeededListings({ kind: row.kind, title, city: row.draft.city ?? null })
  return row.appliedListingId ? hits.filter((h) => h.id !== row.appliedListingId) : hits
}

// ── Per-field edit ───────────────────────────────────────────────────────────────────

/** A shallow patch of draft field values the operator edited. Values are already typed by the
 *  board (string for text/select, number|null for number, boolean|null for bool, string[] for
 *  amenities). Only KNOWN per-kind keys are applied; the rest are ignored. */
export type ListingDraftPatch = Record<string, string | number | boolean | string[] | null>

export type UpdateListingDraftResult = { ok: true; model: ListingReviewModel } | { ok: false; error: string }

const CLASSIFIEDS_KEYS = new Set([
  'title', 'description', 'listingKind', 'category', 'priceNote', 'neighborhood', 'city', 'contact',
])
const HOUSING_KEYS = new Set([
  'title', 'description', 'propertyType', 'amenities', 'rentDollars', 'depositDollars', 'bedrooms',
  'bathrooms', 'sqft', 'availableFrom', 'furnished', 'petsOk', 'utilitiesIncluded', 'smokingOk',
  'cannabisOk', 'neighborhood', 'city', 'contact',
])

/** Where a field's provenance lives in the ledger (deposit is coerced under 'deposit'). */
function ledgerKeyFor(path: string): string {
  return path === 'depositDollars' ? 'deposit' : path
}

/**
 * Merge the operator's edits into the draft, refresh the ledger for each edited scalar (an operator
 * edit is a human-verified fact, so its provenance badge reads "from the paste / confirmed"), and
 * persist. Only KNOWN keys for the draft's kind are applied. Only editable while 'review' or 'applied'.
 * Bound to the intake id. Returns the fresh review model. Fail-safe with a plain reason.
 */
export async function updateListingDraft(intakeId: string, patch: ListingDraftPatch): Promise<UpdateListingDraftResult> {
  await requireStaffCap('structure', 'write')
  const row = await getRow(intakeId)
  if (!row) return { ok: false, error: 'Seed not found.' }
  if (row.status !== 'review' && row.status !== 'applied') {
    return { ok: false, error: `This seed is '${row.status}', not open for edits.` }
  }
  if (!isListingDraft(row.draft)) return { ok: false, error: 'This seed has no draft to edit yet.' }

  const allowed = row.kind === 'classifieds' ? CLASSIFIEDS_KEYS : HOUSING_KEYS
  const draft = structuredClone(row.draft) as unknown as Record<string, unknown>
  const ledger: ProvenanceLedger = structuredClone(row.ledger ?? {})

  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue
    draft[key] = value

    // Refresh provenance for scalar edits (arrays keep their per-index grounding). An operator edit
    // is a human-verified fact; clearing a field drops its entry.
    if (key === 'amenities' || key === 'images') continue
    const lk = ledgerKeyFor(key)
    const text = value === null || value === undefined ? '' : String(value)
    if (text.trim().length === 0) {
      delete ledger[lk]
    } else {
      const entry: LedgerEntry = { kind: 'fact', confidence: 1, verifiedBy: 'human', snippet: text }
      ledger[lk] = [entry]
    }
  }
  // Preserve the discriminant no matter what.
  draft.kind = row.kind

  try {
    const { error } = await intakeTable()
      .update({ draft, ledger, updated_at: new Date().toISOString() })
      .eq('id', intakeId)
    if (error) return { ok: false, error: 'Could not save the change. Try again.' }
  } catch {
    return { ok: false, error: 'Could not save the change. Try again.' }
  }

  revalidatePath(`${BASE}/${intakeId}`)
  return { ok: true, model: buildListingReviewModel(draft as unknown as ListingDraft, ledger) }
}

// ── Delete ────────────────────────────────────────────────────────────────────────────

export type DeleteListingIntakeResult = { ok: true } | { ok: false; error: string }

/** Delete one intake (and best-effort its staged photos). Bound to the intake id. */
export async function deleteListingIntake(intakeId: string): Promise<DeleteListingIntakeResult> {
  await requireStaffCap('structure', 'write')
  const row = await getRow(intakeId)
  if (!row) return { ok: false, error: 'Seed not found.' }

  // Best-effort remove the staged photos under the intake prefix.
  const images = Array.isArray(row.inputs.images) ? row.inputs.images.filter((u): u is string => typeof u === 'string') : []
  await removeStoredImages(intakeId, images)

  try {
    const { error } = await intakeTable().delete().eq('id', intakeId)
    if (error) return { ok: false, error: 'Could not delete the seed. Try again.' }
  } catch {
    return { ok: false, error: 'Could not delete the seed. Try again.' }
  }
  revalidatePath(BASE)
  return { ok: true }
}

// ── Photo staging (mirrors the business seeder's SeederImages upload) ───────────────────

const IMAGE_BUCKET = 'library-media'
const IMAGE_MAX_BYTES = 20 * 1024 * 1024 // 20 MB, the Loom uploader ceiling
const IMAGE_MAX = 12

export type ListingImagesResult = { ok: true; images: string[] } | { ok: false; error: string }

/** Persist the intake's image list onto inputs.images (first-is-primary). Bound to the intake id. */
async function setImages(intakeId: string, inputs: ListingIntakeInputs, images: string[]): Promise<boolean> {
  try {
    const { error } = await intakeTable()
      .update({ inputs: { ...inputs, images }, updated_at: new Date().toISOString() })
      .eq('id', intakeId)
    return !error
  } catch {
    return false
  }
}

/** Best-effort delete stored objects that live under this intake's prefix. */
async function removeStoredImages(intakeId: string, urls: string[]): Promise<void> {
  const marker = `/${IMAGE_BUCKET}/`
  const paths: string[] = []
  for (const url of urls) {
    const at = url.indexOf(marker)
    if (at < 0) continue
    const path = url.slice(at + marker.length)
    if (path.startsWith(`listing-intake/${intakeId}/`)) paths.push(path)
  }
  if (paths.length === 0) return
  try {
    await createAdminClient().storage.from(IMAGE_BUCKET).remove(paths)
  } catch {
    /* best-effort */
  }
}

/**
 * Upload one or more photos and STAGE them on the intake (inputs.images, first-is-primary). Staff-gated
 * + bound to the intake id. Files land in `library-media` under a `listing-intake/<id>/` prefix; on
 * publish (Wave 2) they merge onto the listing. Fail-safe: partial batches still stage their successes.
 */
export async function uploadListingImages(intakeId: string, formData: FormData): Promise<ListingImagesResult> {
  await requireStaffCap('structure', 'write')
  const row = await getRow(intakeId)
  if (!row) return { ok: false, error: 'Seed not found.' }

  const current = Array.isArray(row.inputs.images) ? row.inputs.images.filter((u): u is string => typeof u === 'string') : []
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { ok: false, error: 'No photos chosen.' }

  const room = IMAGE_MAX - current.length
  if (room <= 0) return { ok: false, error: `You can stage up to ${IMAGE_MAX} photos.` }

  const admin = createAdminClient()
  const added: string[] = []
  let firstError: string | undefined

  for (const file of files.slice(0, room)) {
    if (!file.type.startsWith('image/')) {
      firstError ??= `${file.name || 'A file'} is not an image and was skipped.`
      continue
    }
    if (file.size > IMAGE_MAX_BYTES) {
      firstError ??= `${file.name || 'A file'} is over 20 MB and was skipped.`
      continue
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
    const path = `listing-intake/${intakeId}/${stamp}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error: upErr } = await admin.storage
      .from(IMAGE_BUCKET)
      .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
    if (upErr) {
      firstError ??= upErr.message
      continue
    }
    added.push(admin.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl)
  }

  if (files.length > room) firstError ??= `Only ${room} more photo${room === 1 ? '' : 's'} fit (max ${IMAGE_MAX}).`
  if (added.length === 0) return { ok: false, error: firstError ?? 'No photos could be uploaded.' }

  const images = [...current, ...added]
  const saved = await setImages(intakeId, row.inputs, images)
  if (!saved) return { ok: false, error: 'Uploaded, but the save failed. Try again.' }
  revalidatePath(`${BASE}/${intakeId}`)
  return { ok: true, images }
}

/** Drop one staged photo (by URL) and best-effort remove the stored object. Bound to the intake id. */
export async function removeListingImage(intakeId: string, url: string): Promise<ListingImagesResult> {
  await requireStaffCap('structure', 'write')
  const row = await getRow(intakeId)
  if (!row) return { ok: false, error: 'Seed not found.' }
  const current = Array.isArray(row.inputs.images) ? row.inputs.images.filter((u): u is string => typeof u === 'string') : []
  const images = current.filter((u) => u !== url)
  if (images.length === current.length) return { ok: true, images }
  const saved = await setImages(intakeId, row.inputs, images)
  if (!saved) return { ok: false, error: 'Could not remove the photo. Try again.' }
  await removeStoredImages(intakeId, [url])
  revalidatePath(`${BASE}/${intakeId}`)
  return { ok: true, images }
}

/** Move one staged photo to the front (make it the primary). Bound to the intake id. */
export async function setPrimaryListingImage(intakeId: string, url: string): Promise<ListingImagesResult> {
  await requireStaffCap('structure', 'write')
  const row = await getRow(intakeId)
  if (!row) return { ok: false, error: 'Seed not found.' }
  const current = Array.isArray(row.inputs.images) ? row.inputs.images.filter((u): u is string => typeof u === 'string') : []
  if (!current.includes(url)) return { ok: false, error: 'That photo is not staged on this seed.' }
  const images = [url, ...current.filter((u) => u !== url)]
  const saved = await setImages(intakeId, row.inputs, images)
  if (!saved) return { ok: false, error: 'Could not set the primary photo. Try again.' }
  revalidatePath(`${BASE}/${intakeId}`)
  return { ok: true, images }
}

// ── Publish (hands off to Wave 2's publishListingIntake) ────────────────────────────────

export type PublishListingResult =
  | { ok: true; kind: ListingSeedKind; listingId: string; claimUrl: string | null }
  | { ok: false; error: string }

/**
 * Publish the reviewed intake. The materialize + claim-token logic lives in Wave 2's
 * publishListingIntake (lib/listing-seeder/publish); this action re-gates, delegates, and on success
 * revalidates the console + surfaces the claim URL the operator sends to the original poster. Bound to
 * the intake id. Fail-safe with a plain reason.
 */
export async function publishListingIntakeAction(intakeId: string): Promise<PublishListingResult> {
  await requireStaffCap('structure', 'write')
  const res = await publishListingIntake(intakeId)
  if (!res.ok) return { ok: false, error: res.error }

  revalidatePath(BASE)
  revalidatePath(`${BASE}/${intakeId}`)
  const claimUrl = res.claimToken ? `/listings/claim/${res.claimToken}` : null
  return { ok: true, kind: res.kind, listingId: res.listingId, claimUrl }
}

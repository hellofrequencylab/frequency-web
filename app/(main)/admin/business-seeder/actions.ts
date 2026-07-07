'use server'

// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the OPERATOR SEEDER CONSOLE actions (P3,
// docs/BUSINESS-IMPORTER.md §4/§8). Extends the P1 START action with the console's
// read + review + approve seams:
//   • startBusinessImport — capture inputs, create the intake, enqueue research (P1).
//   • listBusinessImports — the intake list (by status) for the landing view.
//   • getBusinessImportReview — the field-by-field review model for one 'review' intake.
//   • updateImportField — the operator's per-field EDIT / CONFIRM / DROP.
//   • approveBusinessImport — APPROVE -> Apply via applyIntake (defaults to an unlisted demo).
//
// AUTHZ: every action gates on requireStaffCap('structure', 'write') — seeding a business
// Space is a structure operation (pnpm check:authz). Reads are gated too (an intake row can
// hold un-verified third-party facts, so it is never world-readable). Every read/write binds
// to the intake `id` (tenancy) through the service-role-gated store (lib/importer/store),
// which itself binds each write to the row id. The list read binds to the operator (created_by)
// via the admin client.
//
// FAIL-SAFE (docs §7): a degraded / erroring intake returns a clear result, never throws to
// the page. The Apply path NEVER bypasses the materializer's commercial-fact gate (Gate B):
// updateImportField's CONFIRM sets verifiedBy:'human' on a real ledger entry, so the same gate
// the materializer re-derives clears it — the UI cannot publish an uncleared fact.
// ─────────────────────────────────────────────────────────────────────────────

import { after } from 'next/server'
import { requireStaffCap } from '@/lib/staff'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { listSpaces } from '@/lib/spaces/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { createIntake, getIntake, saveDraft, setInputs, intakeIdsBySpaceIds } from '@/lib/importer/store'
import { enqueueResearch } from '@/lib/importer/queue'
import { runResearch, EDITABLE_PROSE_FIELDS, nextEditedProse, editedProsePaths } from '@/lib/importer/pipeline'
import { reframe, applyReframe } from '@/lib/importer/reframe'
import { normalizeSeedMood, type SeedMood } from '@/lib/importer/moods'
import { applyIntake, fileSeedImagesIntoLoom } from '@/lib/importer/materialize'
import { adoptSpaceAsMasterProfile } from '@/lib/importer/adopt'
import { planSeedImages } from '@/lib/importer/vision'
import { withImageOrder } from '@/lib/importer/media-order'
import type { BusinessIntakeRow } from '@/lib/importer/intake'
import type { IntakeInputs, IntakeStatus } from '@/lib/importer/intake'
import type { BusinessProfile, LedgerEntry, ProvenanceLedger } from '@/lib/importer/schema'
import { buildReviewModel, type ReviewModel } from './review-model'

// ── Start (P1 trigger, carried forward) ──────────────────────────────────────────────

/** The trimmed inputs an operator submits to start an import. */
export interface StartImportInput {
  websiteUrl?: string
  pastedContent?: string
  nameHint?: string
  categoryHint?: string
  cityHint?: string
  type?: 'business' | 'nonprofit'
  socialHandles?: IntakeInputs['socialHandles']
  /** DIRECTIONS: a freeform steering modifier for the seed (Importer v2). Folded into the reframe. */
  directions?: string
  /** Structured content boxes (Importer v2) — labeled sections the operator pastes so the extractor can
   *  identify content more easily. All are folded (labeled) into the single pasted-content source. */
  overview?: string
  webContent?: string
  bookingSchedule?: string
  differentiators?: string
  /** Run the research inline (behind after()) for a faster operator turnaround, in addition to
   *  enqueuing it durably. Defaults to enqueue-only. */
  runInline?: boolean
}

/** Fold the labeled content boxes + the freeform paste into ONE labeled source block the harvest treats
 *  as a paste. Labeled headers help the extractor separate overview / web copy / schedule / differentiators.
 *  PURE. Returns '' when every box is empty. */
function composePaste(input: StartImportInput): string {
  const parts: string[] = []
  const add = (label: string, v?: string) => {
    const t = (v ?? '').trim()
    if (t) parts.push(`## ${label}\n${t}`)
  }
  add('Overview', input.overview)
  add('Website content', input.webContent)
  add('Booking and schedule', input.bookingSchedule)
  add('What makes them different', input.differentiators)
  const freeform = (input.pastedContent ?? '').trim()
  if (freeform) parts.push(freeform)
  return parts.join('\n\n')
}

export type StartImportResult = { ok: true; intakeId: string } | { ok: false; error: string }

/**
 * Start an operator-seeded import: create the intake row (status 'intake') and enqueue the
 * durable research job. Returns the intake id so the operator can watch it land in 'review'.
 * A seeded import is always a DEMO (unlisted/draft, consent.isDemo=true, docs §7): the operator
 * consciously flips it live later.
 */
export async function startBusinessImport(input: StartImportInput): Promise<StartImportResult> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  if (!operatorId) return { ok: false, error: 'No operator profile.' }

  const websiteUrl = (input.websiteUrl ?? '').trim()
  const pastedContent = composePaste(input) // labeled boxes + freeform, folded into one source
  const nameHint = (input.nameHint ?? '').trim()
  const directions = (input.directions ?? '').trim()
  if (!websiteUrl && !pastedContent && !nameHint) {
    return { ok: false, error: 'Give at least a website, some content, or a name to research.' }
  }

  const inputs: IntakeInputs = {
    consent: { isDemo: true }, // operator seeds are demos by default (docs §7)
  }
  if (websiteUrl) inputs.websiteUrl = websiteUrl
  if (pastedContent) inputs.pastedContent = pastedContent
  if (directions) inputs.directions = directions
  if (input.socialHandles) inputs.socialHandles = input.socialHandles
  const hints: NonNullable<IntakeInputs['hints']> = {}
  if (nameHint) hints.name = nameHint
  if ((input.categoryHint ?? '').trim()) hints.category = input.categoryHint!.trim()
  if ((input.cityHint ?? '').trim()) hints.city = input.cityHint!.trim()
  if (input.type === 'nonprofit' || input.type === 'business') hints.type = input.type
  if (Object.keys(hints).length) inputs.hints = hints

  const intakeId = await createIntake({ createdBy: operatorId, mode: 'operator', inputs })
  if (!intakeId) return { ok: false, error: 'Could not create the intake record.' }

  // Durable path: enqueue the research job (the process-queue cron drains it).
  await enqueueResearch(intakeId)

  // Optional faster turnaround: also run inline behind after() so the response returns
  // immediately while research proceeds (the durable job is the safety net if this is dropped).
  if (input.runInline) {
    after(() => runResearch(intakeId))
  }

  return { ok: true, intakeId }
}

// ── Intake list (the landing view) ─────────────────────────────────────────────────────

/** One row in the intake list — the shape the console landing view renders. */
export interface IntakeListItem {
  id: string
  status: IntakeStatus
  /** A best-effort display name (draft name -> name hint -> website host -> 'Untitled import'). */
  name: string
  /** The primary input the operator gave (website / paste / handle), for the card context. */
  seed: string
  isDemo: boolean
  targetSpaceId: string | null
  createdAt: string
  updatedAt: string
  error: string | null
}

/** The untyped admin handle for a bound LIST read of business_intake (table not in
 *  database.types yet — ADR-246 — so reached via a narrow cast, exactly like the store). The
 *  read is bound to the operator (created_by) so an operator sees only their own imports. */
function listQuery(operatorId: string) {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          order: (c: string, o: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
          }
        }
      }
    }
  }
  return db
    .from('business_intake')
    .select('id, status, inputs, draft, target_space_id, created_at, updated_at, error')
    .eq('created_by', operatorId)
    .order('updated_at', { ascending: false })
    .limit(100)
}

function hostOf(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).host
  } catch {
    return url
  }
}

/** List the operator's imports (most-recent first), for the console landing view. Fail-safe:
 *  returns [] on any error rather than throwing to the page. */
export async function listBusinessImports(): Promise<IntakeListItem[]> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  if (!operatorId) return []
  try {
    const { data, error } = await listQuery(operatorId)
    if (error || !data) return []
    return data.map((raw) => {
      const inputs = (raw.inputs as IntakeInputs) ?? {}
      const draft = (raw.draft as Partial<BusinessProfile>) ?? {}
      const name =
        (draft.name && String(draft.name).trim()) ||
        (inputs.hints?.name && inputs.hints.name.trim()) ||
        hostOf(inputs.websiteUrl) ||
        'Untitled import'
      const seed =
        (inputs.websiteUrl && hostOf(inputs.websiteUrl)) ||
        (inputs.pastedContent ? 'Pasted content' : '') ||
        (inputs.socialHandles ? 'Social handles' : '') ||
        'No source'
      return {
        id: raw.id as string,
        status: (raw.status as IntakeStatus) ?? 'intake',
        name,
        seed,
        isDemo: inputs.consent?.isDemo ?? true,
        targetSpaceId: (raw.target_space_id as string | null) ?? null,
        createdAt: raw.created_at as string,
        updatedAt: raw.updated_at as string,
        error: (raw.error as string | null) ?? null,
      }
    })
  } catch {
    return []
  }
}

// ── Review board read ─────────────────────────────────────────────────────────────────

export interface BusinessImportReview {
  id: string
  status: IntakeStatus
  name: string
  isDemo: boolean
  targetSpaceId: string | null
  error: string | null
  model: ReviewModel
  /** How many raw sources the harvest stage saved (0 until harvest runs) — drives the live progress
   *  stepper while status is 'researching' (harvest is the one mid-flight checkpoint persisted). */
  harvestedSources: number
  /** ISO timestamps for the progress UI's elapsed-time readout + freshness. */
  createdAtISO: string
  updatedAtISO: string
  /** The seed MOOD currently on the intake (Importer v2) — drives the Re-Seed mood picker's selection. */
  mood: SeedMood
  /** Operator-uploaded seed images (public `library-media` URLs, first-is-primary), staged on the intake.
   *  On Apply each is filed into the new Space's Loom (Importer v2). */
  images: string[]
  /** The image designer's per-image roles (Importer v2), keyed by URL, so the panel can chip each image. */
  imagePlan: { url: string; category: string; alt: string }[]
  /** Whether the hero is locked (Importer v2) — seeds the re-seed panel's lock toggle. */
  lockHero: boolean
}

/** Load the field-by-field review model for one intake. Fail-safe: returns null when the
 *  intake is absent or unreadable (the page then shows a clear empty/error state). */
export async function getBusinessImportReview(intakeId: string): Promise<BusinessImportReview | null> {
  await requireStaffCap('structure', 'write')
  const row = await getIntake(intakeId)
  if (!row) return null
  const draft = (row.draft as unknown as BusinessProfile) ?? ({ name: '', type: 'business' } as BusinessProfile)
  const ledger = (row.ledger as ProvenanceLedger) ?? {}
  return {
    id: row.id,
    status: row.status,
    name: (draft.name && String(draft.name).trim()) || row.inputs.hints?.name || 'Untitled import',
    isDemo: row.inputs.consent?.isDemo ?? true,
    targetSpaceId: row.targetSpaceId,
    error: row.error,
    model: buildReviewModel(draft, ledger),
    harvestedSources: row.rawSources.length,
    createdAtISO: row.createdAt,
    updatedAtISO: row.updatedAt,
    mood: normalizeSeedMood(row.inputs.mood),
    images: Array.isArray(row.inputs.images) ? row.inputs.images.filter((u): u is string => typeof u === 'string') : [],
    imagePlan: Array.isArray(row.inputs.imagePlan)
      ? row.inputs.imagePlan
          .filter((p): p is { url: string; category: string; alt: string; heroScore: number } => !!p && typeof p.url === 'string')
          .map((p) => ({ url: p.url, category: String(p.category ?? 'other'), alt: String(p.alt ?? '') }))
      : [],
    lockHero: row.inputs.lockHero ?? true,
  }
}

// ── Seed images (Importer v2): stage operator-uploaded images on the intake ────────────────

const SEED_IMAGE_BUCKET = 'library-media'
const SEED_IMAGE_MAX_BYTES = 20 * 1024 * 1024 // 20 MB, matching the Loom uploader ceiling
const SEED_IMAGE_MAX = 12 // how many images one seed may stage

export type SeederImagesResult = { ok: true; images: string[] } | { ok: false; error: string }

/**
 * Upload one or more images and STAGE them on the intake (inputs.images, first-is-primary order).
 * Staff-gated (structure:write, the seeder's authority) and bound to the intake id. The files land in
 * the `library-media` bucket under an intake-scoped prefix so a seed's staged images are namespaced;
 * on Apply the materializer FILES each into the new Space's Loom (space-scoped), so an uploaded image
 * and a claimed Space's own asset resolve identically. Fail-safe: partial batches still stage their
 * successes; a bad file is skipped with the first reason surfaced. Never throws to the page.
 */
export async function uploadSeederImages(intakeId: string, formData: FormData): Promise<SeederImagesResult> {
  await requireStaffCap('structure', 'write')
  const row = await getIntake(intakeId)
  if (!row) return { ok: false, error: 'Import not found.' }

  const current = Array.isArray(row.inputs.images)
    ? row.inputs.images.filter((u): u is string => typeof u === 'string')
    : []
  const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) return { ok: false, error: 'No images chosen.' }

  const room = SEED_IMAGE_MAX - current.length
  if (room <= 0) return { ok: false, error: `You can stage up to ${SEED_IMAGE_MAX} images.` }

  const admin = createAdminClient()
  const added: string[] = []
  let firstError: string | undefined

  for (const file of files.slice(0, room)) {
    if (!file.type.startsWith('image/')) {
      firstError ??= `${file.name || 'A file'} is not an image and was skipped.`
      continue
    }
    if (file.size > SEED_IMAGE_MAX_BYTES) {
      firstError ??= `${file.name || 'A file'} is over 20 MB and was skipped.`
      continue
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
    const path = `intake/${intakeId}/${stamp}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error: upErr } = await admin.storage
      .from(SEED_IMAGE_BUCKET)
      .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
    if (upErr) {
      firstError ??= upErr.message
      continue
    }
    added.push(admin.storage.from(SEED_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl)
  }

  if (files.length > room) firstError ??= `Only ${room} more image${room === 1 ? '' : 's'} fit (max ${SEED_IMAGE_MAX}).`
  if (added.length === 0) return { ok: false, error: firstError ?? 'No images could be uploaded.' }

  const images = [...current, ...added]
  const nextInputs: IntakeInputs = { ...row.inputs, images }

  // If the Space already exists (a post-apply upload onto a live/seeded business), file the NEW images
  // into its Loom right now so they land on the live Space immediately — not only on a future Apply.
  // Idempotent via imagesFiledToLoom, so a later Apply never double-files them.
  if (row.targetSpaceId) {
    const alreadyFiled = Array.isArray(row.inputs.imagesFiledToLoom)
      ? row.inputs.imagesFiledToLoom.filter((u): u is string => typeof u === 'string')
      : []
    const toFile = added.filter((u) => !alreadyFiled.includes(u))
    const filed = await fileSeedImagesIntoLoom(row.targetSpaceId, toFile, { primaryUrl: images[0] })
    if (filed.length > 0) nextInputs.imagesFiledToLoom = [...alreadyFiled, ...filed]
  }

  const saved = await setInputs(intakeId, nextInputs)
  if (!saved) return { ok: false, error: 'Uploaded, but the save failed. Try again.' }
  // Flow the images onto the draft (hero + gallery) so they paint on the page. New uploads never hijack a
  // locked hero; a fresh seed's first image becomes the hero.
  await syncDraftMediaToImages(row, images, !!row.inputs.lockHero)
  return { ok: true, images }
}

/**
 * Drop one staged seed image (by its public URL). Staff-gated + bound to the intake id. Best-effort
 * removes the stored object too (it lives under the intake prefix), so a dropped image leaves no litter.
 * Fail-safe: an unknown URL is a no-op that still returns the current list.
 */
export async function removeSeederImage(intakeId: string, url: string): Promise<SeederImagesResult> {
  await requireStaffCap('structure', 'write')
  const row = await getIntake(intakeId)
  if (!row) return { ok: false, error: 'Import not found.' }

  const current = Array.isArray(row.inputs.images)
    ? row.inputs.images.filter((u): u is string => typeof u === 'string')
    : []
  const images = current.filter((u) => u !== url)
  if (images.length === current.length) return { ok: true, images } // nothing matched

  const saved = await setInputs(intakeId, { ...row.inputs, images })
  if (!saved) return { ok: false, error: 'Could not remove the image. Try again.' }
  // Keep the draft media in step: if the removed image was the (unlocked) hero, the next image leads.
  await syncDraftMediaToImages(row, images, !!row.inputs.lockHero)

  // Best-effort storage cleanup: derive the object path from the public URL and delete it.
  try {
    const marker = `/${SEED_IMAGE_BUCKET}/`
    const at = url.indexOf(marker)
    if (at >= 0) {
      const path = url.slice(at + marker.length)
      if (path.startsWith(`intake/${intakeId}/`)) {
        await createAdminClient().storage.from(SEED_IMAGE_BUCKET).remove([path])
      }
    }
  } catch {
    /* best-effort */
  }
  return { ok: true, images }
}

/**
 * Sync the DRAFT media (hero image + gallery) to an ordered image list so the images actually paint on
 * the page (the materializer reads draft.media.heroPath for the cover + photoHero, gallery for the rest).
 * When the Space is live, point its cover at the resolved hero too. `lockHero` freezes the current hero
 * (a reorder/upload/arrange never moves it); an explicit "make primary" passes lockHero=false to override.
 * Best-effort; returns the resolved hero URL. Bound to the intake id.
 */
async function syncDraftMediaToImages(row: BusinessIntakeRow, order: string[], lockHero: boolean): Promise<string | undefined> {
  const draft = withImageOrder(row.draft as unknown as BusinessProfile, order, { lockHero })
  await saveDraft(row.id, { draft, ledger: (row.ledger as ProvenanceLedger) ?? {} })
  const heroPath = draft.media?.heroPath
  if (row.targetSpaceId && heroPath) {
    try {
      const admin = createAdminClient() as unknown as {
        from: (t: string) => { update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } }
      }
      await admin.from('spaces').update({ cover_image_url: heroPath }).eq('id', row.targetSpaceId)
    } catch {
      /* best-effort */
    }
  }
  return heroPath
}

/**
 * Make one staged image the PRIMARY (the hero + cover). An EXPLICIT operator choice, so it OVERRIDES a
 * hero lock (they are picking the hero on purpose). Moves the URL to the front of inputs.images and writes
 * it as draft.media.heroPath; on a live Space, repoints the cover immediately. Staff-gated + bound to the
 * intake id.
 */
export async function setPrimarySeederImage(intakeId: string, url: string): Promise<SeederImagesResult> {
  await requireStaffCap('structure', 'write')
  const row = await getIntake(intakeId)
  if (!row) return { ok: false, error: 'Import not found.' }
  const current = Array.isArray(row.inputs.images)
    ? row.inputs.images.filter((u): u is string => typeof u === 'string')
    : []
  if (!current.includes(url)) return { ok: false, error: 'That image is not staged on this import.' }
  const images = [url, ...current.filter((u) => u !== url)]
  const saved = await setInputs(intakeId, { ...row.inputs, images })
  if (!saved) return { ok: false, error: 'Could not set the primary image. Try again.' }
  await syncDraftMediaToImages(row, images, false) // explicit choice overrides any hero lock
  return { ok: true, images }
}

/**
 * Reorder the staged images to `order` (a permutation of the current set; unknown URLs dropped, missing
 * ones appended). Honours the hero lock (a reorder never moves a locked hero). Syncs the draft media so
 * the new order flows to the page. Staff-gated + bound to the intake id.
 */
export async function reorderSeederImages(intakeId: string, order: string[]): Promise<SeederImagesResult> {
  await requireStaffCap('structure', 'write')
  const row = await getIntake(intakeId)
  if (!row) return { ok: false, error: 'Import not found.' }
  const current = Array.isArray(row.inputs.images)
    ? row.inputs.images.filter((u): u is string => typeof u === 'string')
    : []
  const set = new Set(current)
  // Keep only real staged URLs from the requested order, then append any the caller forgot (no loss).
  const next = order.filter((u) => set.has(u))
  for (const u of current) if (!next.includes(u)) next.push(u)
  const saved = await setInputs(intakeId, { ...row.inputs, images: next })
  if (!saved) return { ok: false, error: 'Could not reorder. Try again.' }
  await syncDraftMediaToImages(row, next, !!row.inputs.lockHero)
  return { ok: true, images: next }
}

// ── Auto-arrange images with the AI designer (Importer v2) ────────────────────────────────

export type ArrangeImagesResult =
  | { ok: true; order: string[]; heroUrl: string | null }
  | { ok: false; error: string }

/**
 * Run the vision DESIGNER over the staged images: it classifies each, writes alt text, picks the primary
 * hero, and orders the set best-first. Staff-gated + bound to the intake id. Persists the new order + the
 * per-image plan, and syncs the draft media so the images paint on the page. RESPECTS the hero lock: when
 * the hero is locked, the current hero image is kept (only the gallery is re-ordered); when unlocked, the
 * designer's hero leads and becomes the cover. Fail-safe: designer off / over budget leaves images as-is.
 */
export async function autoArrangeSeederImages(intakeId: string): Promise<ArrangeImagesResult> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  const row = await getIntake(intakeId)
  if (!row) return { ok: false, error: 'Import not found.' }

  const images = Array.isArray(row.inputs.images)
    ? row.inputs.images.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : []
  if (images.length === 0) return { ok: false, error: 'Add some images first, then arrange them.' }

  const draft = (row.draft as unknown as BusinessProfile) ?? ({ name: '', type: 'business' } as BusinessProfile)
  const name = (draft.name && String(draft.name).trim()) || row.inputs.hints?.name || ''
  const plan = await planSeedImages(images, name, operatorId)
  if (!plan) return { ok: false, error: 'The image designer is off or over budget right now. Try again shortly.' }

  const nextInputs: IntakeInputs = {
    ...row.inputs,
    images: plan.order,
    imagePlan: plan.items.map((it) => ({ url: it.url, category: it.category, alt: it.alt, heroScore: it.heroScore })),
  }
  const saved = await setInputs(intakeId, nextInputs)
  if (!saved) return { ok: false, error: 'Arranged, but the save failed. Try again.' }

  // Flow the arranged order onto the draft media + the live cover, RESPECTING the hero lock (a locked hero
  // is not replaced by the designer's pick — only the gallery re-orders).
  const hero = await syncDraftMediaToImages(row, plan.order, !!row.inputs.lockHero)
  return { ok: true, order: plan.order, heroUrl: hero ?? plan.heroUrl }
}

// ── Re-Seed with a mood (Importer v2) ────────────────────────────────────────────────────

export type ReseedResult =
  | { ok: true; revoiced: boolean; reapplied: boolean; mood: SeedMood }
  | { ok: false; error: string }

/**
 * RE-SEED the whole page in a mood. This regenerates EVERYTHING the master profile drives — the copy, the
 * block layout, and the images — and re-applies it to the live Space, EXCEPT what is locked:
 *   • `lockHero` freezes the hero HEADLINE (tagline) and the hero IMAGE (draft.media.heroPath is left as
 *     it is, so the cover and photoHero image do not move). Everything else (about, story, offering
 *     blurbs, layout) is re-voiced + recomposed.
 *   • Edit-wins (P5): any prose field the operator hand-edited is preserved too (editedProsePaths).
 * Steps: persist mood + lockHero → re-voice the verified draft (best-effort; AI off just skips the
 * re-voice) → on an APPLIED intake, re-apply via applyIntake so the live page regenerates from the fresh
 * draft. The commercial-fact gate is untouched (re-voice only rewrites prose). Only from 'review' /
 * 'applied'; fail-safe with a plain reason.
 */
export async function reseedBusinessImport(
  intakeId: string,
  mood: SeedMood,
  lockHero = true,
): Promise<ReseedResult> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  const nextMood = normalizeSeedMood(mood)

  const row = await getIntake(intakeId)
  if (!row) return { ok: false, error: 'Import not found.' }
  if (row.status !== 'review' && row.status !== 'applied') {
    return { ok: false, error: `This import is '${row.status}', not ready to re-seed (finish research first).` }
  }

  // Persist the chosen mood + the hero lock so they stick and drive this + every future run.
  await setInputs(intakeId, { ...row.inputs, mood: nextMood, lockHero })

  // Re-voice the verified draft in the new mood. If AI is off / over budget, reframe returns null and the
  // copy is left as-is (the layout/images still regenerate on re-apply below).
  const draft = (row.draft as unknown as BusinessProfile) ?? ({ name: '', type: 'business' } as BusinessProfile)
  const ledger = (row.ledger as ProvenanceLedger) ?? {}
  const result = await reframe({ verified: draft, profileId: operatorId, mood: nextMood, directions: row.inputs.directions })

  let revoiced = false
  if (result) {
    // Preserve set: hand-edited prose always, plus the hero HEADLINE (tagline) when the hero is locked.
    // about / story / offering blurbs are re-voiced. The hero IMAGE is protected separately (media is
    // not touched by the re-voice).
    const preserve = new Set(editedProsePaths(row.draft))
    if (lockHero) preserve.add('tagline')
    const folded = applyReframe(draft, result.copy, ledger, preserve)
    const saved = await saveDraft(intakeId, { draft: folded.draft, ledger: folded.ledger })
    if (!saved) return { ok: false, error: 'Re-voiced, but the save failed. Try again.' }
    revoiced = true
  }

  // Re-apply to the live Space so the WHOLE page regenerates from the fresh draft (copy + layout + hero +
  // gallery), honouring the locks the draft already encodes. Only when the Space exists (applied).
  let reapplied = false
  if (row.status === 'applied' && row.targetSpaceId) {
    const res = await applyIntake(intakeId, { ownerProfileId: operatorId ?? row.createdBy })
    reapplied = res.ok
  }

  return { ok: true, revoiced, reapplied, mood: nextMood }
}

// ── Adopt a hand-made Space into a master profile (Importer v2) ───────────────────────────

export type AdoptSpaceResult = { ok: true; intakeId: string; created: boolean } | { ok: false; error: string }

/**
 * Create (or find) the editable MASTER PROFILE for an existing Space, derived from its own content, so a
 * business that was never seeded becomes re-seedable. Staff-gated (structure:write). Idempotent: a Space
 * that already has an intake returns it. Returns the intake id so the caller routes into the review board.
 */
export async function adoptSpaceMasterProfile(spaceId: string): Promise<AdoptSpaceResult> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  if (!operatorId) return { ok: false, error: 'No operator profile.' }
  return adoptSpaceAsMasterProfile(spaceId, operatorId)
}

// ── Re-seed ANY active Space: admin-only space search (Importer v2) ────────────────────────

/** One active Space an admin can pick to re-seed. */
export interface SpaceSearchResult {
  id: string
  name: string
  slug: string
  type: string
  /** Whether it already has a master profile (was seeded / adopted). Framing only. */
  seeded: boolean
}

/**
 * Search ACTIVE Spaces to re-seed (Importer v2). ADMIN-ONLY: re-seeding any Space (not just ones you
 * started) is a platform-admin power, so this gates on the staff web_role (admin / janitor), above the
 * seeder's own structure:write. Returns up to 20 active, non-root Spaces matching `query` (name / brand /
 * slug), most-recently-updated first. Fail-safe: an empty list for a non-admin or any error.
 */
export async function searchActiveSpaces(query: string): Promise<SpaceSearchResult[]> {
  const caller = await getCallerProfile().catch(() => null)
  const webRole = caller?.webRole
  if (webRole !== 'admin' && webRole !== 'janitor') return [] // admin-only
  try {
    const q = query.trim().toLowerCase()
    const spaces = await listSpaces()
    const active = spaces.filter((s) => s.status === 'active' && s.type !== 'root')
    const matched = (q
      ? active.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.brandName ?? '').toLowerCase().includes(q) ||
            s.slug.toLowerCase().includes(q),
        )
      : active
    ).slice(0, 20)
    const seededMap = await intakeIdsBySpaceIds(matched.map((s) => s.id))
    return matched.map((s) => ({
      id: s.id,
      name: s.brandName || s.name,
      slug: s.slug,
      type: s.type,
      seeded: !!seededMap[s.id],
    }))
  } catch {
    return []
  }
}

// ── Per-field edit / confirm / drop ─────────────────────────────────────────────────────

export type FieldAction =
  | { kind: 'edit'; value: string }
  | { kind: 'confirm' }
  | { kind: 'drop' }

export type UpdateFieldResult = { ok: true; model: ReviewModel } | { ok: false; error: string }

/**
 * Apply one operator action to one field, then persist the updated draft + ledger and return
 * the fresh review model. Bound to the intake id. Only allowed while status is 'review'.
 *
 *   • edit    — set the field's value in the draft. Marks the field human-supplied: the ledger
 *               entry becomes a verified human fact ({ kind:'fact', verifiedBy:'human' }), so the
 *               materializer's Gate B clears it (an operator edit IS a human confirmation).
 *   • confirm — keep the value, promote its ledger entry to a verified human fact. This is how a
 *               withheld commercial fact clears WITHOUT retyping it.
 *   • drop    — clear the field's value and remove its ledger entry (a red / unwanted field).
 *
 * PURE effect on the draft/ledger (setDraftValue / confirmLedger / dropField below), then one
 * bound saveDraft. Fail-safe: a bad path or a non-review status returns { ok:false } with a
 * plain reason, never throws.
 */
export async function updateImportField(
  intakeId: string,
  path: string,
  action: FieldAction,
): Promise<UpdateFieldResult> {
  await requireStaffCap('structure', 'write')
  const row = await getIntake(intakeId)
  if (!row) return { ok: false, error: 'Import not found.' }
  if (row.status !== 'review') {
    return { ok: false, error: `This import is '${row.status}', not open for edits (expected 'review').` }
  }

  const draft = structuredClone((row.draft as unknown as BusinessProfile) ?? { name: '', type: 'business' })
  const ledger: ProvenanceLedger = structuredClone((row.ledger as ProvenanceLedger) ?? {})

  try {
    if (action.kind === 'edit') {
      const value = (action.value ?? '').trim()
      setDraftValue(draft, path, value)
      confirmLedger(ledger, path, value)
    } else if (action.kind === 'confirm') {
      const current = readDraftValue(draft, path)
      if (!current) return { ok: false, error: 'Nothing to confirm — the field is empty.' }
      confirmLedger(ledger, path, current)
    } else if (action.kind === 'drop') {
      setDraftValue(draft, path, '')
      delete ledger[path]
    } else {
      return { ok: false, error: 'Unknown field action.' }
    }
  } catch {
    return { ok: false, error: 'That field path could not be updated.' }
  }

  // Edit-wins bookkeeping (P5, docs §5): record which identity-level PROSE fields the operator has
  // committed to (edit / confirm) or cleared (drop), on a sparse `draft._editedProse` marker. A later
  // re-research reads it (pipeline.editedProsePaths) and carries these values forward instead of
  // overwriting them with fresh AI copy. Only the shared EDITABLE_PROSE_FIELDS set is tracked.
  if ((EDITABLE_PROSE_FIELDS as readonly string[]).includes(path)) {
    const bag = draft as unknown as Record<string, unknown>
    bag._editedProse = nextEditedProse(bag._editedProse, path, action.kind)
  }

  const saved = await saveDraft(intakeId, { draft, ledger })
  if (!saved) return { ok: false, error: 'Could not save the change.' }
  return { ok: true, model: buildReviewModel(draft, ledger) }
}

// ── Approve -> Apply ─────────────────────────────────────────────────────────────────────

export type ApproveResult =
  | { ok: true; spaceId: string; slug?: string; profileHref: string; siteHref: string }
  | { ok: false; error: string; blockedFields?: string[] }

/**
 * Approve the reviewed draft and materialize it into a Space via applyIntake. DEFAULTS to an
 * unlisted / demo Space (never auto-public, docs §9b): the intake carries consent.isDemo=true
 * from the operator start, and applyIntake -> materializeBusiness honours it (isDemo posture).
 *
 * The materializer's Gate B (docs §4.3) re-derives, per commercial field, whether it is a
 * verified fact; an uncleared price/hours/address/phone is WITHHELD on the live surface. So this
 * approve NEVER publishes an unverified commercial fact — the UI does not pretend otherwise. If
 * any field is contradicted (red), the review model blocks it; we surface those here first.
 */
export async function approveBusinessImport(intakeId: string): Promise<ApproveResult> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  if (!operatorId) return { ok: false, error: 'No operator profile.' }

  const row = await getIntake(intakeId)
  if (!row) return { ok: false, error: 'Import not found.' }
  if (row.status !== 'review' && row.status !== 'applied') {
    return { ok: false, error: `This import is '${row.status}', not ready to approve (expected 'review').` }
  }

  // Surface red (contradicted) commercial fields before we hand off to Apply, so the operator
  // resolves them first. Apply itself would withhold them, but a clear message beats a silent drop.
  const draft = (row.draft as unknown as BusinessProfile) ?? ({ name: '', type: 'business' } as BusinessProfile)
  const model = buildReviewModel(draft, (row.ledger as ProvenanceLedger) ?? {})
  const blocked = model.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.blocksApply)
    .map((f) => f.label)
  if (blocked.length > 0) {
    return {
      ok: false,
      error: 'Some facts are contradicted by their source. Resolve or drop them, then approve.',
      blockedFields: blocked,
    }
  }

  const result = await applyIntake(intakeId, { ownerProfileId: operatorId })
  if (!result.ok || !result.spaceId) {
    return { ok: false, error: result.error ?? 'The Space could not be created.' }
  }

  const slug = result.slug
  const profileHref = slug ? `/spaces/${slug}` : `/spaces/${result.spaceId}`
  const siteHref = slug ? `/sites/${slug}` : profileHref
  return { ok: true, spaceId: result.spaceId, slug, profileHref, siteHref }
}

// ── Pure draft / ledger helpers (path-addressed) ────────────────────────────────────────

/** Whether a path targets a per-offering field, returning the index + leaf key. */
function offeringPath(path: string): { index: number; key: string } | null {
  const m = path.match(/^offerings\[(\d+)\]\.(\w+)$/)
  if (!m) return null
  return { index: Number(m[1]), key: m[2] }
}

/** Read the current string value at a draft path (mirrors review-model.extractFields). */
function readDraftValue(draft: BusinessProfile, path: string): string {
  const off = offeringPath(path)
  if (off) {
    const o = draft.offerings?.[off.index]
    if (!o) return ''
    const v = (o as unknown as Record<string, unknown>)[off.key]
    return v === undefined || v === null ? '' : String(v)
  }
  if (path.startsWith('contact.')) {
    const key = path.slice('contact.'.length)
    const v = (draft.contact as unknown as Record<string, unknown> | undefined)?.[key]
    return v === undefined || v === null ? '' : String(v)
  }
  if (path === 'rating') {
    return [draft.rating?.value, draft.rating?.count].filter(Boolean).join(' ')
  }
  const v = (draft as unknown as Record<string, unknown>)[path]
  return v === undefined || v === null ? '' : String(v)
}

/** Set a string value at a draft path. Numeric offering prices coerce; empty clears the field.
 *  Only the paths the review model exposes are writable (an unknown path throws -> handled). */
function setDraftValue(draft: BusinessProfile, path: string, value: string): void {
  const off = offeringPath(path)
  if (off) {
    if (!draft.offerings || !draft.offerings[off.index]) throw new Error('no offering')
    const o = draft.offerings[off.index] as unknown as Record<string, unknown>
    if (off.key === 'price') {
      const n = Number(value)
      if (value === '') delete o.price
      else if (Number.isFinite(n)) o.price = n
    } else {
      if (value === '') delete o[off.key]
      else o[off.key] = value
    }
    return
  }
  if (path.startsWith('contact.')) {
    const key = path.slice('contact.'.length)
    draft.contact = draft.contact ?? {}
    const c = draft.contact as unknown as Record<string, unknown>
    if (value === '') delete c[key]
    else c[key] = value
    return
  }
  if (path === 'rating') {
    draft.rating = draft.rating ?? {}
    draft.rating.value = value || undefined
    return
  }
  const allowedScalars = new Set([
    'name',
    'brandName',
    'slug',
    'type',
    'category',
    'accent',
    'tagline',
    'about',
    'story',
  ])
  if (!allowedScalars.has(path)) throw new Error('unknown path')
  const d = draft as unknown as Record<string, unknown>
  if (value === '' && path !== 'name' && path !== 'type') delete d[path]
  else d[path] = value
}

/** Promote a field's ledger entry to a verified HUMAN fact (an operator edit / confirm IS a
 *  human confirmation, docs §4.3). Keeps any existing sourceUrl/snippet as provenance; a
 *  hand-typed value with no prior source records the operator as the source. */
function confirmLedger(ledger: ProvenanceLedger, path: string, value: string): void {
  const prior = ledger[path]?.[0]
  const entry: LedgerEntry = {
    kind: 'fact',
    confidence: 1,
    verifiedBy: 'human',
    ...(prior?.sourceUrl ? { sourceUrl: prior.sourceUrl } : {}),
    // Keep the original snippet if it still supports the value; else record the operator's value.
    ...(prior?.snippet ? { snippet: prior.snippet } : { snippet: value }),
  }
  ledger[path] = [entry]
}

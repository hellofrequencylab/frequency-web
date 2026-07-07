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
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createIntake, getIntake, saveDraft, setInputs } from '@/lib/importer/store'
import { enqueueResearch } from '@/lib/importer/queue'
import { runResearch, EDITABLE_PROSE_FIELDS, nextEditedProse, editedProsePaths } from '@/lib/importer/pipeline'
import { reframe, applyReframe } from '@/lib/importer/reframe'
import { normalizeSeedMood, type SeedMood } from '@/lib/importer/moods'
import { applyIntake, fileSeedImagesIntoLoom } from '@/lib/importer/materialize'
import { adoptSpaceAsMasterProfile } from '@/lib/importer/adopt'
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
  /** Run the research inline (behind after()) for a faster operator turnaround, in addition to
   *  enqueuing it durably. Defaults to enqueue-only. */
  runInline?: boolean
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
  const pastedContent = (input.pastedContent ?? '').trim()
  const nameHint = (input.nameHint ?? '').trim()
  if (!websiteUrl && !pastedContent && !nameHint) {
    return { ok: false, error: 'Give at least a website, a paste, or a name to research.' }
  }

  const inputs: IntakeInputs = {
    consent: { isDemo: true }, // operator seeds are demos by default (docs §7)
  }
  if (websiteUrl) inputs.websiteUrl = websiteUrl
  if (pastedContent) inputs.pastedContent = pastedContent
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

// ── Re-Seed with a mood (Importer v2) ────────────────────────────────────────────────────

export type ReseedResult = { ok: true; revoiced: boolean; mood: SeedMood } | { ok: false; error: string }

/** The identity / hero PROSE the "lock primary info & hero" toggle protects on a re-seed: when locked,
 *  re-seed re-voices ONLY the marketing blocks (offering blurbs) and leaves these untouched. */
const PRIMARY_PROSE_PATHS = ['tagline', 'about', 'story'] as const

/**
 * Re-Seed the reviewed draft in a different MOOD. A mood changes only the reframe TONE (not the verified
 * FACTS), so this is a cheap RE-VOICE, not a full re-research: it persists the new mood on the intake,
 * then reframes the already-verified draft with that mood and folds the fresh copy back. Edit-wins (P5):
 * a prose field the operator already edited is preserved (editedProsePaths), so a mood re-voice never
 * clobbers a hand-written line. When `lockPrimary` (the default), the identity/hero prose (tagline,
 * about, story) is ALSO preserved, so re-seed only refreshes the marketing blocks (offering blurbs) and
 * never rewrites primary business info. Only from 'review' / 'applied' (there is a verified draft to
 * re-voice); fail-safe with a plain reason. The commercial-fact gate is untouched (this only rewrites
 * prose). On an APPLIED intake the re-voiced copy is saved to the master profile; the operator pushes it
 * to the live Space with an explicit Re-apply (so a live hand-edit is never silently clobbered).
 */
export async function reseedBusinessImport(
  intakeId: string,
  mood: SeedMood,
  lockPrimary = true,
): Promise<ReseedResult> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  const nextMood = normalizeSeedMood(mood)

  const row = await getIntake(intakeId)
  if (!row) return { ok: false, error: 'Import not found.' }
  if (row.status !== 'review' && row.status !== 'applied') {
    return { ok: false, error: `This import is '${row.status}', not ready to re-seed (finish research first).` }
  }

  // Persist the chosen mood on the intake inputs (so it sticks + drives future runs).
  await setInputs(intakeId, { ...row.inputs, mood: nextMood })

  // Re-voice the persisted verified draft in the new mood. If AI is off / over budget, reframe returns
  // null and we leave the draft unchanged (the mood is still saved for the next full run).
  const draft = (row.draft as unknown as BusinessProfile) ?? ({ name: '', type: 'business' } as BusinessProfile)
  const ledger = (row.ledger as ProvenanceLedger) ?? {}
  const result = await reframe({ verified: draft, profileId: operatorId, mood: nextMood })
  if (!result) return { ok: true, revoiced: false, mood: nextMood }

  // Preserve set: fields the operator hand-edited, plus (when locked) the identity/hero prose. Locking
  // the primary info is the "turn off re-seeding for main info / hero" control — only marketing blocks
  // (offering blurbs) are re-voiced.
  const preserve = new Set(editedProsePaths(row.draft))
  if (lockPrimary) for (const p of PRIMARY_PROSE_PATHS) preserve.add(p)
  const folded = applyReframe(draft, result.copy, ledger, preserve)
  const saved = await saveDraft(intakeId, { draft: folded.draft, ledger: folded.ledger })
  if (!saved) return { ok: false, error: 'Re-voiced, but the save failed. Try again.' }
  return { ok: true, revoiced: true, mood: nextMood }
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

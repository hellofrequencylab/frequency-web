'use server'

// ─────────────────────────────────────────────────────────────────────────────
// THE COVER OFFER — Recraft generation for any creation flow (ADR-993).
//
// The single door a review step calls when an author has no cover image and wants one drawn.
// Generalized from the admin Loom Studio (app/(main)/admin/library/recraft-actions.ts, ADR-488),
// which was the only surface that could reach Recraft at all: same engine, same budget
// discipline, opened to the flows where a missing cover actually costs someone something.
//
// THE FOUR LAWS THIS FILE KEEPS
//   1. IT IS AN OFFER. Nothing calls this except a person pressing a button. There is no
//      auto-generate on save, on publish, or on draft. Finishing with no image stays fine.
//   2. IT FILES INTO THE LOOM (ADR-987: the Loom is the only image path). A generated cover is a
//      real library_asset in the author's own Loom, catalogued, reusable, and deletable, never a
//      loose URL pointing at a vendor's CDN that expires.
//   3. IT IS LABELLED AS AI, three times over (docs/AI-VERA.md §10): the asset's `source` is
//      'recraft', its tags carry 'generated' (which is what the Loom picker reads to badge an
//      image), its title says so in plain words, and the action hands back a provenance entry so
//      the review board's own "Made by Vera" badge lights up from the kernel's ledger.
//   4. IT NEVER WRITES THE ENTITY. It returns a URL. Putting that URL on the draft is the
//      surface's job, which is what keeps this from becoming an autonomous write.
//
// GATED: signed in, the entity must really declare a fillable image field, Recraft must be
// configured, the AI kill switch must be on, and the 'entity-cover' daily cap must have room.
// Every one of those is re-checked here; the client is never trusted.
// ─────────────────────────────────────────────────────────────────────────────

import { after } from 'next/server'
import { getCallerProfile } from '@/lib/auth'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { studioManifest } from '@/lib/studio/registry'
import type { LedgerEntry } from '@/lib/studio/kernel/ledger'
import { getSpaceById, getSpaceBySlug, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { insertSpaceLibraryImage } from '@/lib/library/store'
import { ingestImageBytes } from '@/lib/library/ingest'
import { LIBRARY_MEDIA_BUCKET } from '@/lib/library/upload-kinds'
import { downloadRecraft, generateImages, recraftConfigured } from './recraft'
import {
  buildCoverPrompt,
  coverAssetTitle,
  coverFieldFor,
  COVER_LANE,
  COVER_SIZE,
  COVER_TAGS,
} from './cover'

/** The budget key + ledger feature for a generated cover (lib/ai/budget.ts). */
const FEATURE = 'entity-cover'

/** Recraft's list price for one raster generation, for the ledger. Matches the Loom Studio. */
const COST_USD = 0.04

/** What the caller gets back: the stored image, and the provenance that marks it as AI-made. */
export interface GeneratedCover {
  /** The Loom asset id, so the surface can show it in context or let the author remove it. */
  assetId: string
  /** The public URL to put on the draft field. */
  url: string
  /** The draft field path this cover is for (re-derived server-side from the manifest). */
  path: string
  /** The exact prompt Vera drew from, so an author can see what was asked for. */
  prompt: string
  /** Drop this into the draft's ledger under `path` and the review board badges it as AI-made
   *  with no new render code (lib/studio/kernel/review-kernel.ts). */
  provenance: LedgerEntry
}

/** Resolve + AUTHORIZE a Loom scope for a WRITE. Mirrors `resolveScope` in picker-actions.ts (a
 *  space needs canEditProfile; 'mine' lands in the root library stamped to the caller). Kept local
 *  because that one lives in a 'use server' module and cannot be exported without becoming an
 *  action of its own. FAIL-SAFE: any miss is an unauthorized null, never a throw. */
async function resolveWriteScope(callerId: string, scopeKey: string | undefined): Promise<string | null> {
  if (!scopeKey || scopeKey === 'mine') return loadRootSpaceId()
  try {
    const space = (await getSpaceById(scopeKey)) ?? (await getSpaceBySlug(scopeKey))
    if (!space) return null
    const caps = await getSpaceCapabilities(space, callerId)
    return caps.canEditProfile ? space.id : null
  } catch {
    return null
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'cover'
}

function extFor(contentType: string): string {
  if (contentType.includes('svg')) return 'svg'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  return 'png'
}

/**
 * Whether the cover offer can be shown at all right now. Cheap and side-effect free, so a review
 * step can ask before it paints a button that would only fail: the entity must declare a fillable
 * image field, Recraft must be configured, AI must be on, and the daily cap must have room.
 *
 * Returns a plain boolean, never a reason, because the reason is operator information and this is
 * answered to a member. When it is false the surface simply does not offer to draw one.
 */
export async function coverOfferAvailableAction(entity: string): Promise<{ available: boolean }> {
  const caller = await getCallerProfile()
  if (!caller) return { available: false }
  const manifest = studioManifest(entity)
  if (!manifest || !coverFieldFor(manifest)) return { available: false }
  if (!recraftConfigured()) return { available: false }
  if (!(await aiAvailable())) return { available: false }
  if (await featureOverBudget(FEATURE)) return { available: false }
  return { available: true }
}

/**
 * Draw one cover for a draft and file it in the author's Loom. Returns the stored image; it does
 * NOT touch the entity. The author can accept it, ask again, or ignore it and publish with no
 * image at all.
 *
 * @param input.entity    the Studio entity id (its manifest decides whether a cover is even allowed)
 * @param input.scopeKey  the Loom to file into: 'mine' (default) or a Space id/slug the caller manages
 */
export async function generateEntityCoverAction(input: {
  entity: string
  title: string
  summary?: string | null
  mood?: string | null
  directions?: string | null
  scopeKey?: string | null
}): Promise<ActionResult<GeneratedCover>> {
  const caller = await getCallerProfile()
  if (!caller) return fail('Sign in first.')

  // The manifest is the authority on whether this entity may have a drawn cover at all, so a
  // caller cannot name an entity that never offered one (a Space logo, a product photo) and get
  // an AI image onto it.
  const manifest = studioManifest(input.entity)
  if (!manifest) return fail('We do not know how to draw a cover for that.')
  const field = coverFieldFor(manifest)
  if (!field) return fail(`A ${manifest.label.toLowerCase()} does not take a drawn cover.`)

  const title = (input.title ?? '').trim().slice(0, 120)
  if (title.length < 3) return fail('Give it a name first, then Vera can draw a cover for it.')

  if (!recraftConfigured()) return fail('Drawing covers is not switched on right now.')
  if (!(await aiAvailable())) return fail('Vera is paused right now. You can add your own image instead.')
  if (await featureOverBudget(FEATURE)) {
    return fail("Vera has drawn her limit of covers for today. Try again tomorrow, or add your own image.")
  }

  const spaceId = await resolveWriteScope(caller.id, input.scopeKey ?? undefined)
  if (!spaceId) return fail('We could not find a library to save this in.')

  const prompt = buildCoverPrompt({
    entityLabel: manifest.label,
    title,
    summary: input.summary,
    mood: input.mood,
    directions: input.directions,
  })

  try {
    const results = await generateImages({ prompt, lane: COVER_LANE, size: COVER_SIZE, n: 1 })
    const first = results[0]
    if (!first?.url) return fail('Vera could not draw one this time. Try again, or add your own image.')

    // Spend is recorded whether or not the file survives the upload: the generation already
    // happened and the vendor already charged for it.
    after(() =>
      recordAiUsage({
        feature: FEATURE,
        model: 'recraft-v3',
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: COST_USD,
        profileId: caller.id,
      }),
    )

    const { bytes, contentType } = await downloadRecraft(first.url)
    const mime = contentType.startsWith('image/') ? contentType : 'image/png'
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
    const path = `${spaceId}/${slugify(title)}-cover-${stamp}.${extFor(mime)}`

    // INGEST (PROG-D1): checksum + dimensions for a generated cover. The strip is a no-op on a
    // Recraft render, but the dimensions are not — a cover that does not know its own aspect ratio
    // cannot be laid out without loading it first.
    const ingested = ingestImageBytes(bytes, mime)

    const admin = createAdminClient()
    const { error: upErr } = await admin.storage
      .from(LIBRARY_MEDIA_BUCKET)
      .upload(path, ingested.bytes, { contentType: mime, upsert: false })
    if (upErr) return fail('Vera drew it but could not save it. Try again.')

    const { data: pub } = admin.storage.from(LIBRARY_MEDIA_BUCKET).getPublicUrl(path)

    // Into the Loom like any other image (ADR-987), labelled as generated in three places: the
    // title, the tags, and the config provenance.
    const assetId = await insertSpaceLibraryImage({
      spaceId,
      title: coverAssetTitle(manifest.label, title),
      slug: `vera-cover-${slugify(title)}-${stamp}`,
      storageBucket: LIBRARY_MEDIA_BUCKET,
      storagePath: path,
      url: pub.publicUrl,
      mime,
      bytes: ingested.bytes.byteLength,
      sha256: ingested.sha256,
      width: ingested.width,
      height: ingested.height,
      kind: 'image',
      createdBy: caller.id,
      source: 'recraft',
      tags: [...COVER_TAGS, manifest.entity],
      config: { source: 'recraft', generator: 'vera', prompt, lane: COVER_LANE, entity: manifest.entity },
    })
    if (!assetId) {
      await admin.storage.from(LIBRARY_MEDIA_BUCKET).remove([path])
      return fail('Vera drew it but could not save it to your Loom. Try again.')
    }

    return ok({
      assetId,
      url: pub.publicUrl,
      path: field.path,
      prompt,
      // 'generated' with no source url: drawn, not sourced. The review board reads this and marks
      // the row as AI-made, so the label travels with the value rather than living in one button.
      provenance: { kind: 'generated', confidence: 0.5 },
    })
  } catch {
    return fail('Vera could not draw one this time. Try again, or add your own image.')
  }
}

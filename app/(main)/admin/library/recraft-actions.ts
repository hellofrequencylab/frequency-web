'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { getRootSpaceId } from '@/lib/library/store'
import { recordVersion, rollbackToVersion, listVersions, type LibraryVersion } from '@/lib/library/versions'
import { listStyles, recordStyle, resolveStyleId, deleteStyle, type BrandStyle } from '@/lib/library/styles'
import {
  recraftConfigured,
  generateImages,
  downloadRecraft,
  vectorizeImage,
  imageToImage,
  removeBackground,
  createStyle,
  type RecraftLane,
} from '@/lib/loom/recraft'

// The Loom's managed image studio — Recraft generation + non-destructive editing (ADR-488,
// docs/RESEARCH-ASSET-GEN.md). Janitor-gated, budget-gated, and inert unless RECRAFT_API_KEY is set.
// Generated/edited files land in the library-media bucket as normal library_assets; edits snapshot a
// version first (rollback via library_versions).

const FEATURE = 'recraft'
const BUCKET = 'library-media'
// Recraft list price, for the budget ledger.
const COST: Record<RecraftLane, number> = { raster: 0.04, vector: 0.08 }

// eslint-disable-next-line no-restricted-syntax -- library_* isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
const dbh = () => createAdminClient() as unknown as SupabaseClient

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'asset'
  )
}
function extFor(ct: string): string {
  if (ct.includes('svg')) return 'svg'
  if (ct.includes('png')) return 'png'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  if (ct.includes('webp')) return 'webp'
  return 'png'
}

/** Upload bytes to library-media and return the stored file's location + public url. */
async function store(spaceId: string, bytes: Uint8Array, contentType: string, base: string) {
  const admin = createAdminClient()
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
  const path = `${spaceId}/${slugify(base)}-${stamp}.${extFor(contentType)}`
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
  if (error) throw new Error(error.message)
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  return { path, url: pub.publicUrl, bucket: BUCKET, bytes: bytes.byteLength, mime: contentType }
}

async function gate(lane: RecraftLane) {
  const ctx = await requireAdmin('janitor')
  if (!recraftConfigured()) return { error: 'Recraft is not configured (set RECRAFT_API_KEY).', ctx: null }
  if (!(await aiAvailable())) return { error: 'AI is turned off right now.', ctx: null }
  if (await featureOverBudget(FEATURE)) return { error: "The image studio's daily budget is used up.", ctx: null }
  return { error: null as string | null, ctx, lane }
}

/** A freshly-generated draft image awaiting review (preview + publish). */
export type StudioDraft = { id: string; url: string | null; title: string; mime: string | null }

/** Generate one or more images with Recraft and store them as DRAFTS (status='draft', hidden from
 *  the published Loom until publishAssets). Returns the drafts so the studio can preview them. */
export async function generateStudioDraft(input: {
  prompt: string
  lane: RecraftLane
  size?: string
  count?: number
  category?: string
  styleId?: string
}): Promise<{ ok: true; drafts: StudioDraft[] } | { error: string }> {
  const g = await gate(input.lane)
  if (g.error || !g.ctx) return { error: g.error ?? 'Not available.' }

  const prompt = (input.prompt || '').trim().slice(0, 1000)
  if (prompt.length < 3) return { error: 'Describe what to generate.' }

  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found.' }

  // A picked brand style overrides the base style so the whole set matches (ADR-489).
  const recraftStyleId = input.styleId ? (await resolveStyleId(spaceId, input.styleId)) ?? undefined : undefined

  try {
    const results = await generateImages({ prompt, lane: input.lane, size: input.size, n: input.count ?? 1, styleId: recraftStyleId })
    if (results.length === 0) return { error: 'Recraft returned no images.' }

    const cost = COST[input.lane] * results.length
    after(() => recordAiUsage({ feature: FEATURE, model: 'recraft-v3', usage: { inputTokens: 0, outputTokens: 0 }, costUsd: cost, profileId: g.ctx!.profileId }))

    const drafts: StudioDraft[] = []
    for (const [i, r] of results.entries()) {
      const { bytes, contentType } = await downloadRecraft(r.url)
      const stored = await store(spaceId, bytes, contentType, prompt)
      const title = results.length > 1 ? `${prompt.slice(0, 60)} ${i + 1}` : prompt.slice(0, 80)
      const slug = `recraft-${slugify(title)}-${Date.now().toString(36)}-${i}`
      const { data, error } = await dbh()
        .from('library_assets')
        .insert({
          space_id: spaceId,
          kind: 'image',
          title,
          slug,
          category: input.category || (input.lane === 'vector' ? 'Recraft vectors' : 'Recraft images'),
          tags: ['recraft', 'generated', input.lane],
          status: 'draft',
          visibility: 'public',
          storage_bucket: stored.bucket,
          storage_path: stored.path,
          url: stored.url,
          mime: stored.mime,
          bytes: stored.bytes,
          config: { source: 'recraft', prompt, lane: input.lane, ...(recraftStyleId ? { styleId: recraftStyleId } : {}) },
        })
        .select('id, title, url, mime')
        .maybeSingle()
      if (!error && data) {
        const row = data as Record<string, unknown>
        drafts.push({ id: String(row.id), title: String(row.title ?? title), url: (row.url as string | null) ?? stored.url, mime: (row.mime as string | null) ?? stored.mime })
      }
    }
    if (drafts.length === 0) return { error: 'Generated, but could not save the drafts.' }
    revalidatePath('/admin/library')
    return { ok: true, drafts }
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : 'Recraft generation failed.' }
  }
}

/** Publish drafts into the live Loom (status → approved). Scoped to the root space. */
export async function publishAssets(ids: string[]): Promise<{ ok: true; count: number } | { error: string }> {
  await requireAdmin('janitor')
  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found.' }
  const clean = [...new Set((ids || []).filter(Boolean))]
  if (clean.length === 0) return { error: 'Nothing to publish.' }
  const { error } = await dbh()
    .from('library_assets')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .in('id', clean)
    .eq('space_id', spaceId)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true, count: clean.length }
}

/** Discard drafts (deletes the rows + their storage files). Only ever removes status='draft'. */
export async function discardDrafts(ids: string[]): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found.' }
  const clean = [...new Set((ids || []).filter(Boolean))]
  if (clean.length === 0) return { ok: true }

  const { data } = await dbh()
    .from('library_assets')
    .select('id, storage_bucket, storage_path')
    .in('id', clean)
    .eq('space_id', spaceId)
    .eq('status', 'draft')
  const rows = (data as Array<{ id: string; storage_bucket: string | null; storage_path: string | null }> | null) ?? []
  if (rows.length === 0) return { ok: true }

  const admin = createAdminClient()
  for (const r of rows) {
    if (r.storage_bucket && r.storage_path) {
      try {
        await admin.storage.from(r.storage_bucket).remove([r.storage_path])
      } catch {
        /* best-effort file cleanup */
      }
    }
  }
  await dbh().from('library_assets').delete().in('id', rows.map((r) => r.id))
  revalidatePath('/admin/library')
  return { ok: true }
}

export type RecraftOp = 'vectorize' | 'remove-bg' | 'variation'

/** Non-destructively edit an existing file-backed asset: snapshot the current state as a version,
 *  then replace it with the Recraft result. */
export async function recraftEditAsset(input: {
  assetId: string
  op: RecraftOp
  prompt?: string
}): Promise<{ ok: true } | { error: string }> {
  const isVector = input.op === 'vectorize'
  const g = await gate(isVector ? 'vector' : 'raster')
  if (g.error || !g.ctx) return { error: g.error ?? 'Not available.' }
  if (!input.assetId) return { error: 'Missing asset.' }

  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found.' }

  const { data } = await dbh().from('library_assets').select('url, title').eq('id', input.assetId).eq('space_id', spaceId).maybeSingle()
  const asset = data as { url: string | null; title: string | null } | null
  if (!asset?.url) return { error: 'This edit needs a file-backed image (generate one first).' }

  try {
    const src = await downloadRecraft(asset.url)
    let resultUrl: string
    if (input.op === 'vectorize') resultUrl = await vectorizeImage(src.bytes)
    else if (input.op === 'remove-bg') resultUrl = await removeBackground(src.bytes)
    else resultUrl = await imageToImage({ bytes: src.bytes, prompt: (input.prompt || 'a clean variation').slice(0, 1000), strength: 0.35 })

    const out = await downloadRecraft(resultUrl)
    const stored = await store(spaceId, out.bytes, out.contentType, asset.title || 'edit')

    // Snapshot the pre-edit state, then apply the new file.
    await recordVersion(input.assetId, `Recraft ${input.op}`, g.ctx.profileId)

    const cost = COST[isVector ? 'vector' : 'raster']
    after(() => recordAiUsage({ feature: FEATURE, model: 'recraft-v3', usage: { inputTokens: 0, outputTokens: 0 }, costUsd: cost, profileId: g.ctx!.profileId }))

    const { error } = await dbh()
      .from('library_assets')
      .update({ storage_bucket: stored.bucket, storage_path: stored.path, url: stored.url, mime: stored.mime, bytes: stored.bytes, updated_at: new Date().toISOString() })
      .eq('id', input.assetId)
    if (error) return { error: error.message }

    revalidatePath('/admin/library')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : 'Recraft edit failed.' }
  }
}

/** A gated list of an asset's versions (for the drawer's history panel). */
export async function listAssetVersions(assetId: string): Promise<LibraryVersion[]> {
  await requireAdmin('janitor')
  if (!assetId) return []
  return listVersions(assetId)
}

/** Roll an asset back to a previous version (snapshots current first, so it's reversible). */
export async function rollbackAssetVersion(assetId: string, versionId: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireAdmin('janitor')
  if (!assetId || !versionId) return { error: 'Missing asset or version.' }
  const res = await rollbackToVersion(assetId, versionId, ctx.profileId)
  if ('error' in res) return res
  revalidatePath('/admin/library')
  return { ok: true }
}

// ── Brand styles (ADR-489) — train a house style from reference assets so generated sets match ────

/** List the space's trained brand styles (for the generate panel's picker). */
export async function listBrandStyles(): Promise<BrandStyle[]> {
  await requireAdmin('janitor')
  const spaceId = await getRootSpaceId()
  if (!spaceId) return []
  return listStyles(spaceId)
}

/** Train a reusable brand style from 1–5 existing file-backed assets and persist it. The reference
 *  images teach Recraft the house look; the returned style_id then conditions every generation. */
export async function createBrandStyle(input: {
  name: string
  lane: RecraftLane
  assetIds: string[]
}): Promise<{ ok: true; style: BrandStyle } | { error: string }> {
  const g = await gate(input.lane)
  if (g.error || !g.ctx) return { error: g.error ?? 'Not available.' }

  const name = (input.name || '').trim().slice(0, 120)
  if (name.length < 2) return { error: 'Name the style.' }
  const ids = [...new Set((input.assetIds || []).filter(Boolean))].slice(0, 5)
  if (ids.length === 0) return { error: 'Pick 1–5 reference images first.' }

  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found.' }

  try {
    const { data } = await dbh()
      .from('library_assets')
      .select('url')
      .in('id', ids)
      .eq('space_id', spaceId)
    const urls = ((data as Array<{ url: string | null }> | null) ?? []).map((r) => r.url).filter((u): u is string => !!u)
    if (urls.length === 0) return { error: 'Those references have no image files.' }

    const refs = await Promise.all(urls.map(async (u) => (await downloadRecraft(u)).bytes))
    const recraftStyleId = await createStyle(input.lane, refs)

    const cost = COST[input.lane]
    after(() => recordAiUsage({ feature: FEATURE, model: 'recraft-style', usage: { inputTokens: 0, outputTokens: 0 }, costUsd: cost, profileId: g.ctx!.profileId }))

    const style = await recordStyle({
      spaceId,
      name,
      recraftStyleId,
      lane: input.lane,
      baseStyle: input.lane,
      refCount: refs.length,
      createdBy: g.ctx.profileId,
    })
    if (!style) return { error: 'Trained the style but could not save it.' }

    revalidatePath('/admin/library')
    return { ok: true, style }
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : 'Style training failed.' }
  }
}

/** Forget a trained brand style (removes our pointer; does not delete it on Recraft). */
export async function deleteBrandStyle(styleId: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor')
  if (!styleId) return { error: 'Missing style.' }
  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found.' }
  await deleteStyle(spaceId, styleId)
  revalidatePath('/admin/library')
  return { ok: true }
}

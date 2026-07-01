'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiAvailable, featureOverBudget, recordAiUsage } from '@/lib/ai/usage'
import { getRootSpaceId } from '@/lib/library/store'
import { recordVersion, rollbackToVersion, listVersions, type LibraryVersion } from '@/lib/library/versions'
import {
  recraftConfigured,
  generateImages,
  downloadRecraft,
  vectorizeImage,
  imageToImage,
  removeBackground,
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

/** Generate one or more assets with Recraft and store them in the Loom. */
export async function generateWithRecraft(input: {
  prompt: string
  lane: RecraftLane
  size?: string
  count?: number
  category?: string
}): Promise<{ ok: true; count: number } | { error: string }> {
  const g = await gate(input.lane)
  if (g.error || !g.ctx) return { error: g.error ?? 'Not available.' }

  const prompt = (input.prompt || '').trim().slice(0, 1000)
  if (prompt.length < 3) return { error: 'Describe what to generate.' }

  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found.' }

  try {
    const results = await generateImages({ prompt, lane: input.lane, size: input.size, n: input.count ?? 1 })
    if (results.length === 0) return { error: 'Recraft returned no images.' }

    const cost = COST[input.lane] * results.length
    after(() => recordAiUsage({ feature: FEATURE, model: 'recraft-v3', usage: { inputTokens: 0, outputTokens: 0 }, costUsd: cost, profileId: g.ctx!.profileId }))

    let n = 0
    for (const [i, r] of results.entries()) {
      const { bytes, contentType } = await downloadRecraft(r.url)
      const stored = await store(spaceId, bytes, contentType, prompt)
      const title = results.length > 1 ? `${prompt.slice(0, 60)} ${i + 1}` : prompt.slice(0, 80)
      const slug = `recraft-${slugify(title)}-${Date.now().toString(36)}-${i}`
      const { error } = await dbh().from('library_assets').insert({
        space_id: spaceId,
        kind: 'image',
        title,
        slug,
        category: input.category || (input.lane === 'vector' ? 'Recraft vectors' : 'Recraft images'),
        tags: ['recraft', 'generated', input.lane],
        status: 'approved',
        visibility: 'public',
        storage_bucket: stored.bucket,
        storage_path: stored.path,
        url: stored.url,
        mime: stored.mime,
        bytes: stored.bytes,
        config: { source: 'recraft', prompt, lane: input.lane },
      })
      if (!error) n++
    }
    revalidatePath('/admin/library')
    return { ok: true, count: n }
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : 'Recraft generation failed.' }
  }
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

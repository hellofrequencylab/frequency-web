'use server'

import { revalidatePath } from 'next/cache'
import type { Database } from '@/lib/database.types'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { asJson } from '@/lib/supabase/json'
import { getRootSpaceId, insertSpaceLibraryImage, findLibraryAssetBySha256 } from '@/lib/library/store'
import { ingestImageBytes } from '@/lib/library/ingest'
import { readImageDescriptor } from '@/lib/library/image-describe'
import { classifyLoomUpload, fallbackExtFor, fallbackMimeFor } from '@/lib/library/upload-kinds'
import { findLibraryAssetUsage } from '@/lib/library/usage'
import { LIBRARY_DOWNLOAD_POLICIES, type LibraryDownloadPolicy } from '@/lib/library/types'
import { recordVersion } from '@/lib/library/versions'
import {
  LIBRARY_PRIVATE_BUCKET,
  LIBRARY_PUBLIC_BUCKET,
  PROTECT_REFUSAL,
  planProtectMove,
  protectRefusal,
  type ProtectVersionRow,
} from '@/lib/library/protect-move'
import { readLibraryDownloadRecord } from '@/lib/library/download-door'

// ── THE LOOM STUDIO DOOR: every action on this route carries the PAGE's gate ─────────────────
// `requireAdmin('janitor', { staff: 'marketing' })`, the same call `page.tsx` makes, because a
// Marketer reaches Loom Studio (owner decision, ADR-851) and `marketer` holds marketing:'write',
// which is requireAdmin's default level. Until 2026-09-10 all 27 actions on this route were bare
// `requireAdmin('janitor')`, so the page ADMITTED a Marketer and every action DENIED one —
// `lib/admin/guard.ts` redirects to `/feed`, and `create-studio.tsx` calls `listBrandStyles()` in an
// on-mount effect, so the browser was thrown off the route seconds after load without a click
// (LIVE-289). "Studio-gated" below means exactly this call. A genuinely staff-only mutation would
// carry no `{ staff }` key — but nothing here is one: every action on this route is wired to a
// control this page renders, so a narrower gate is a button that redirects.

// Upload a file into The Loom: store it in the right bucket (images -> library-media, audio/video ->
// recordings-media) and write a `library_assets` row (kind resolved from the MIME, scoped to the
// root/shared library). Studio-gated. Airwaves P0 (ADR-608) widened the ACCEPTED types to audio +
// video via classifyLoomUpload; PROG-D1 routed the write through `insertSpaceLibraryImage` and added
// ingest, so `duplicateOf` is returned when the bytes are already in this Loom and nothing was stored.
export async function uploadLibraryImage(
  formData: FormData,
): Promise<{ ok: true; duplicateOf?: string } | { error: string }> {
  await requireAdmin('janitor', { staff: 'marketing' })

  const file = formData.get('file')
  const rawTitle = (formData.get('title') as string | null)?.trim()
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  const target = classifyLoomUpload(file.type)
  if (!target) return { error: 'Only image, audio, or video files.' }
  if (file.size > target.maxBytes) {
    const limitMb = Math.round(target.maxBytes / 1024 / 1024)
    return { error: `File must be under ${limitMb}MB.` }
  }

  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found; cannot scope the asset.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || fallbackExtFor(target.kind)).toLowerCase().replace(/[^a-z0-9]/g, '')
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
  const path = `${spaceId}/${stamp}.${ext}`

  // INGEST (PROG-D1). This action used to write `library_assets` directly, one of the two sites that
  // bypassed the chokepoint; it now runs the same pipeline as every other uploader — strip private
  // metadata, checksum the stored bytes, read the dimensions — and inserts through
  // `insertSpaceLibraryImage` so there is exactly ONE place a Loom row is written.
  const ingested = ingestImageBytes(new Uint8Array(await file.arrayBuffer()), file.type)
  const duplicate = await findLibraryAssetBySha256(spaceId, ingested.sha256)
  if (duplicate) return { ok: true, duplicateOf: duplicate.title || 'an asset already in the Loom' }

  const { error: upErr } = await admin.storage
    .from(target.bucket)
    .upload(path, ingested.bytes, { contentType: file.type || fallbackMimeFor(target.kind), upsert: false })
  if (upErr) return { error: upErr.message }

  const { data: pub } = admin.storage.from(target.bucket).getPublicUrl(path)

  const base = (file.name.replace(/\.[^.]+$/, '') || target.kind).slice(0, 120)
  const slug = `${base}-${stamp}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  const id = await insertSpaceLibraryImage({
    spaceId,
    title: rawTitle || base,
    slug,
    storageBucket: target.bucket,
    storagePath: path,
    url: pub.publicUrl,
    mime: file.type || fallbackMimeFor(target.kind),
    bytes: ingested.bytes.byteLength,
    kind: target.kind,
    source: 'curated',
    // The Studio's own upload is the SHARED master library, so it stays public — the one place a Loom
    // row is public rather than space-scoped, and the reason this call passes `visibility` explicitly.
    visibility: 'public',
    sha256: ingested.sha256,
    width: ingested.width,
    height: ingested.height,
    ...readImageDescriptor(formData),
  })
  if (!id) {
    // Roll back the orphaned file so a failed insert doesn't leave litter in storage.
    await admin.storage.from(target.bucket).remove([path])
    return { error: 'Could not save that file to the Loom. Try again.' }
  }

  revalidatePath('/admin/library')
  return { ok: true }
}

const dbh = () => createAdminClient()

/** Edit an asset's metadata. Tags arrive as a comma-separated string. Studio-gated.
 *
 *  THE PROTECTION FIELDS (LIVE-576, ADR-1577). `downloadPolicy` is validated against the closed set
 *  `LIBRARY_DOWNLOAD_POLICIES` here rather than left to the CHECK constraint, so an operator reads a
 *  sentence and not a Postgres error; `isProtected` must be a real boolean; `expiresAt` is a date the
 *  runtime can parse, or null / '' to clear the licence end. Every field is optional and independent,
 *  so the drawer's Save sends what it shows and an older caller that sends title and tags only is
 *  byte-identical.
 *
 *  PROTECTED MOVES THE FILE (LIVE-577, ADR-1595). `isProtected` is not written here as a bare flag
 *  any more: it is handed to `protectLibraryAsset`, which moves the file into or out of the private
 *  bucket and sets the flag in the same step. It runs FIRST, so a refused protect (the asset is on a
 *  page, it is audio, the copy failed) saves nothing and the operator reads why. */
export async function updateLibraryAssetMeta(
  id: string,
  fields: {
    title?: string
    alt?: string
    category?: string
    tags?: string
    downloadPolicy?: string
    isProtected?: boolean
    expiresAt?: string | null
  },
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor', { staff: 'marketing' })
  if (!id) return { error: 'Missing asset id.' }

  const patch: Database['public']['Tables']['library_assets']['Update'] = { updated_at: new Date().toISOString() }
  if (fields.downloadPolicy !== undefined) {
    const policy = fields.downloadPolicy.trim()
    if (!(LIBRARY_DOWNLOAD_POLICIES as readonly string[]).includes(policy)) {
      return { error: `Download policy must be one of ${LIBRARY_DOWNLOAD_POLICIES.join(', ')}.` }
    }
    patch.download_policy = policy as LibraryDownloadPolicy
  }
  if (fields.isProtected !== undefined && typeof fields.isProtected !== 'boolean') {
    return { error: 'Protected must be on or off.' }
  }
  if (fields.expiresAt !== undefined) {
    const raw = typeof fields.expiresAt === 'string' ? fields.expiresAt.trim() : ''
    if (!raw) patch.expires_at = null
    else {
      const t = new Date(raw).getTime()
      if (!Number.isFinite(t)) return { error: 'Expires needs a real date, or leave it blank.' }
      patch.expires_at = new Date(t).toISOString()
    }
  }
  if (fields.title !== undefined) {
    const t = fields.title.trim()
    if (!t) return { error: 'Title cannot be empty.' }
    patch.title = t.slice(0, 200)
  }
  if (fields.alt !== undefined) patch.alt = fields.alt.trim().slice(0, 500) || null
  if (fields.category !== undefined) patch.category = fields.category.trim().slice(0, 80) || null
  if (fields.tags !== undefined) {
    patch.tags = fields.tags
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 40)
  }

  // Every field above is validated before anything moves, so a bad date cannot strand a moved file.
  if (fields.isProtected !== undefined) {
    const moved = await protectLibraryAsset(id, fields.isProtected)
    if ('error' in moved) return moved
  }

  const { error } = await dbh().from('library_assets').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MOVE_FAILED = 'Could not move the file, so nothing changed. Try again.'

/** How many live page images point at this asset through a column reference (HYG-068's six TEXT
 *  image columns, 20270345006300). The block-document usage index does not see these, and a Space
 *  logo or a profile header is as live as a block. Null when any count could not be read. */
async function countColumnImageHolders(id: string): Promise<number | null> {
  const admin = createAdminClient()
  const reads = await Promise.all([
    admin.from('spaces').select('id', { count: 'exact', head: true }).or(`brand_logo_asset_id.eq.${id},cover_image_asset_id.eq.${id}`),
    admin.from('page_content').select('route', { count: 'exact', head: true }).eq('hero_image_asset_id', id),
    admin.from('page_settings').select('route', { count: 'exact', head: true }).or(`og_image_asset_id.eq.${id},header_image_asset_id.eq.${id}`),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('header_image_asset_id', id),
  ])
  let total = 0
  for (const r of reads) {
    if (r.error || typeof r.count !== 'number') return null
    total += r.count
  }
  return total
}

/** Protect an asset, or release it (LIVE-577, ADR-1595). Protected MOVES the file: the current
 *  object and every version's object are copied from `library-media` into the private
 *  `library-private` bucket, the rows follow, and the public copies are removed, so the original is
 *  no longer one public URL away. Off moves them back. Studio-gated.
 *
 *  REFUSED, with the row unchanged: audio or video (no private twin for recordings-media yet), a
 *  code-drawn element, a file outside the Loom buckets, a seed or import filed from the importer's
 *  object, a file another Loom row or version shares, an asset placed on any page or used as a
 *  page image (protecting it would blank that image; a protected asset is a download or a proof,
 *  never a page image), a usage read that failed, and any half-step through the copy and the row
 *  writes: every step taken is undone when a later one fails. The last step, removing the old
 *  objects, is the one exception, said at the step. A version is recorded first, so the move shows
 *  in the history like every other edit; the reverse of the move is this action with `on` false. */
export async function protectLibraryAsset(id: string, on: boolean): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireAdmin('janitor', { staff: 'marketing' })
  if (!id || !UUID_RE.test(id)) return { error: 'Missing asset id.' }
  if (typeof on !== 'boolean') return { error: 'Protected must be on or off.' }

  const admin = createAdminClient()
  const { data: rowData, error: readErr } = await admin
    .from('library_assets')
    .select('id, kind, storage_bucket, storage_path, url, is_protected, source')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return { error: MOVE_FAILED }
  if (!rowData) return { error: 'That asset no longer exists.' }
  const row = rowData as {
    id: string
    kind: string
    storage_bucket: string | null
    storage_path: string | null
    url: string | null
    is_protected: boolean
    source: string | null
  }
  const refusal = protectRefusal(row, on)
  if (refusal) return { error: refusal }

  // Nothing to move (already where the flag says): set the flag, and that is the whole edit.
  const first = planProtectMove(row, [], on, () => '')
  if (first.ok && !first.move) {
    if (on && row.storage_bucket === LIBRARY_PRIVATE_BUCKET && row.storage_path) {
      // Finish a move whose last step failed (step 4 below): sweep any public copy left at the same
      // paths. Removing an object that is not there is not an error, so this is safe to repeat.
      const { data: leftovers } = await admin.from('library_versions').select('storage_path').eq('asset_id', id).eq('storage_bucket', LIBRARY_PRIVATE_BUCKET)
      const paths = [row.storage_path, ...((leftovers ?? []) as Array<{ storage_path: string | null }>).map((v) => v.storage_path)]
      await admin.storage.from(LIBRARY_PUBLIC_BUCKET).remove([...new Set(paths.filter((p): p is string => !!p))])
    }
    if (row.is_protected === on) return { ok: true }
    const { error } = await admin.from('library_assets').update({ is_protected: on, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/library')
    return { ok: true }
  }

  // Protecting pulls the file off the open web, so a page that paints it would go blank. Refuse
  // while anything live points at it; a failed read refuses too (ADR-979: unread is not unused).
  if (on) {
    const usage = await findLibraryAssetUsage(id)
    if (!usage.ok) return { error: 'Could not check where this asset is used. Try again.' }
    const columns = await countColumnImageHolders(id)
    if (columns === null) return { error: 'Could not check where this asset is used. Try again.' }
    const places = usage.pages + columns
    if (places > 0) {
      return {
        error: `This asset is on ${places} page${places === 1 ? '' : 's'}. Swap it out there first, then protect it.`,
      }
    }
  }

  const readVersions = async (): Promise<ProtectVersionRow[] | null> => {
    const { data, error } = await admin
      .from('library_versions')
      .select('id, storage_bucket, storage_path, recipe')
      .eq('asset_id', id)
    if (error) return null
    return ((data ?? []) as Array<Record<string, unknown>>).map((v) => ({
      id: String(v.id),
      storage_bucket: (v.storage_bucket as string | null) ?? null,
      storage_path: (v.storage_path as string | null) ?? null,
      recipe: v.recipe && typeof v.recipe === 'object' ? (v.recipe as Record<string, unknown>) : null,
    }))
  }
  const publicUrlFor = (path: string) => admin.storage.from(LIBRARY_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl

  // Only an object this asset alone owns may move: removing a file another Loom row or another
  // asset's version points at would pull that one off the web as well.
  const before = await readVersions()
  if (!before) return { error: MOVE_FAILED }
  const preview = planProtectMove(row, before, on, publicUrlFor)
  if (!preview.ok) return { error: preview.error }
  if (!preview.move) return { ok: true }
  const [otherAssets, otherVersions] = await Promise.all([
    admin
      .from('library_assets')
      .select('id', { count: 'exact', head: true })
      .eq('storage_bucket', preview.from)
      .in('storage_path', preview.paths)
      .neq('id', id),
    admin
      .from('library_versions')
      .select('id', { count: 'exact', head: true })
      .eq('storage_bucket', preview.from)
      .in('storage_path', preview.paths)
      .neq('asset_id', id),
  ])
  if (otherAssets.error || otherVersions.error) return { error: 'Could not check where this asset is used. Try again.' }
  if ((otherAssets.count ?? 0) + (otherVersions.count ?? 0) > 0) return { error: PROTECT_REFUSAL.shared }

  // The move is an edit: record the state before it, like every other edit, so the history shows it.
  await recordVersion(id, on ? 'Before protect' : 'Before unprotect', ctx.profileId)

  // Re-read so the version just recorded moves with the rest (its snapshot names the old bucket).
  const versions = await readVersions()
  if (!versions) return { error: MOVE_FAILED }
  const plan = planProtectMove(row, versions, on, publicUrlFor)
  if (!plan.ok) return { error: plan.error }
  if (!plan.move) return { ok: true }

  // 1. Copy every object into the other bucket. A failed copy removes the copies already made.
  const copied: string[] = []
  const dropCopies = async () => {
    if (copied.length) await admin.storage.from(plan.to).remove(copied)
  }
  for (const path of plan.paths) {
    const { error } = await admin.storage.from(plan.from).copy(path, path, { destinationBucket: plan.to })
    if (error) {
      await dropCopies()
      return { error: MOVE_FAILED }
    }
    copied.push(path)
  }

  // 2. The asset row follows, guarded on the bucket it was read in, so a concurrent move loses.
  const now = () => new Date().toISOString()
  const { data: moved, error: assetErr } = await admin
    .from('library_assets')
    .update({ ...plan.asset, updated_at: now() })
    .eq('id', id)
    .eq('storage_bucket', plan.from)
    .select('id')
  if (assetErr || !moved || moved.length !== 1) {
    await dropCopies()
    return { error: MOVE_FAILED }
  }

  // 3. Each version row follows, so a rollback restores a file that exists. Undo on any failure.
  const rewritten: typeof plan.versions = []
  const undoRows = async () => {
    for (const v of rewritten) {
      await admin.from('library_versions').update({ storage_bucket: v.before.storage_bucket, recipe: asJson(v.before.recipe) }).eq('id', v.id)
    }
    await admin.from('library_assets').update({ ...plan.assetBefore, updated_at: now() }).eq('id', id)
  }
  for (const v of plan.versions) {
    const { error } = await admin
      .from('library_versions')
      .update({ storage_bucket: v.after.storage_bucket, recipe: asJson(v.after.recipe) })
      .eq('id', v.id)
    if (error) {
      await undoRows()
      await dropCopies()
      return { error: MOVE_FAILED }
    }
    rewritten.push(v)
  }

  // 4. Only now do the old objects go. This one step is NOT undone on failure: a remove that errored
  //    may still have deleted some objects, and undoing would then drop the only copy. The rows and
  //    the copies already agree, so the operator is told, and the next protect of this asset sweeps
  //    the leftovers (the already-private branch above).
  const { error: removeErr } = await admin.storage.from(plan.from).remove(plan.paths)
  if (removeErr) {
    revalidatePath('/admin/library')
    return {
      error: on
        ? 'Protected, but the public copy could not be removed yet. Save again to finish.'
        : 'Released, but the private copy could not be removed yet. It is not public, so nothing is exposed.',
    }
  }

  revalidatePath('/admin/library')
  return { ok: true }
}

/** Soft-remove: hide from the library without destroying the file or breaking references. */
export async function archiveLibraryAsset(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor', { staff: 'marketing' })
  if (!id) return { error: 'Missing asset id.' }
  const { error } = await dbh()
    .from('library_assets')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** Permanently delete: remove the stored file, then the row. Studio-gated. */
export async function deleteLibraryAsset(id: string): Promise<{ ok: true } | { error: string }> {
  await requireAdmin('janitor', { staff: 'marketing' })
  if (!id) return { error: 'Missing asset id.' }

  // SAFE DELETE (PROG-D4, ADR-1502): an asset that a stored block document still references is not
  // deleted; the operator archives it, or removes it from those pages first. Every ref would keep
  // rendering its cached url after a delete (ADR-1130's fail-open), so the page would not go blank
  // today, but the next Loom replace or rollback would have nothing to re-point and the "follows the
  // new file" promise those actions make would break silently. A FAILED usage read also refuses:
  // deleting what you could not prove unused is the destructive half of the ADR-979 bug.
  const usage = await findLibraryAssetUsage(id)
  if (!usage.ok) return { error: 'Could not check where this asset is used. Try again.' }
  if (usage.pages > 0) {
    return {
      error: `This asset is placed on ${usage.pages} page${usage.pages === 1 ? '' : 's'}. Archive it instead, or remove it from those pages first.`,
    }
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('library_assets')
    .select('storage_bucket, storage_path')
    .eq('id', id)
    .maybeSingle()
  const row = data as { storage_bucket: string | null; storage_path: string | null } | null
  if (row?.storage_bucket && row.storage_path) {
    await admin.storage.from(row.storage_bucket).remove([row.storage_path])
  }

  const { error } = await admin.from('library_assets').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/library')
  return { ok: true }
}

/** The download record the drawer shows under [data-loom-downloads] (LIVE-578, ADR-1596): how many
 *  times the file went through the download door, and when last. Studio-gated, so staff only. */
export async function libraryDownloadRecord(
  id: string,
): Promise<{ count: number; lastAt: string | null } | null> {
  await requireAdmin('janitor', { staff: 'marketing' })
  return readLibraryDownloadRecord(id)
}

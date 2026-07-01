import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Non-destructive version history for Loom assets (ADR-480 `library_versions`). Every edit snapshots
// the asset's state into a version row (the original is never lost); rollback restores a prior
// snapshot onto the live `library_assets` row. Works for BOTH file-backed assets (url/storage) and
// code-drawn elements (config.svg) — the full prior state lives in the version's `recipe` jsonb.
// Service-role only; callers gate via requireAdmin. See docs/LIBRARY.md.

// eslint-disable-next-line no-restricted-syntax -- library_* isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
const db = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient

/** The fields a version captures — enough to fully restore the live asset to this point. */
export type AssetSnapshot = {
  url: string | null
  storage_bucket: string | null
  storage_path: string | null
  mime: string | null
  bytes: number | null
  width: number | null
  height: number | null
  config: Record<string, unknown> | null
}

export type LibraryVersion = {
  id: string
  version: number
  note: string | null
  isCurrent: boolean
  createdAt: string
  snapshot: AssetSnapshot
}

const SNAP_COLS = 'url, storage_bucket, storage_path, mime, bytes, width, height, config'

async function readSnapshot(assetId: string): Promise<AssetSnapshot | null> {
  const { data } = await db().from('library_assets').select(SNAP_COLS).eq('id', assetId).maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  return {
    url: (r.url as string | null) ?? null,
    storage_bucket: (r.storage_bucket as string | null) ?? null,
    storage_path: (r.storage_path as string | null) ?? null,
    mime: (r.mime as string | null) ?? null,
    bytes: (r.bytes as number | null) ?? null,
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    config: (r.config as Record<string, unknown> | null) ?? null,
  }
}

/** Record the asset's CURRENT state as a new version (called BEFORE applying an edit, so the
 *  pre-edit state is preserved). Marks it current; unmarks the previous current. Best-effort. */
export async function recordVersion(assetId: string, note: string, createdBy?: string | null): Promise<void> {
  const snap = await readSnapshot(assetId)
  if (!snap) return
  const client = db()

  const { data: maxRow } = await client
    .from('library_versions')
    .select('version')
    .eq('asset_id', assetId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = (((maxRow as { version?: number } | null)?.version ?? 0) as number) + 1

  await client.from('library_versions').update({ is_current: false }).eq('asset_id', assetId).eq('is_current', true)
  await client.from('library_versions').insert({
    asset_id: assetId,
    version: nextVersion,
    storage_bucket: snap.storage_bucket,
    storage_path: snap.storage_path,
    recipe: snap,
    note: note.slice(0, 200),
    is_current: true,
    created_by: createdBy ?? null,
  })
}

/** All versions of an asset, newest first. */
export async function listVersions(assetId: string): Promise<LibraryVersion[]> {
  const { data } = await db()
    .from('library_versions')
    .select('id, version, note, is_current, created_at, recipe')
    .eq('asset_id', assetId)
    .order('version', { ascending: false })
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
    id: String(r.id),
    version: Number(r.version),
    note: (r.note as string | null) ?? null,
    isCurrent: Boolean(r.is_current),
    createdAt: String(r.created_at ?? ''),
    snapshot: (r.recipe as AssetSnapshot | null) ?? {
      url: null, storage_bucket: null, storage_path: null, mime: null, bytes: null, width: null, height: null, config: null,
    },
  }))
}

/** Restore a version's snapshot onto the live asset. Snapshots the current state first (so a
 *  rollback is itself reversible), then writes the chosen snapshot back and marks it current. */
export async function rollbackToVersion(
  assetId: string,
  versionId: string,
  createdBy?: string | null,
): Promise<{ ok: true } | { error: string }> {
  const client = db()
  const { data: vRow } = await client
    .from('library_versions')
    .select('version, recipe')
    .eq('asset_id', assetId)
    .eq('id', versionId)
    .maybeSingle()
  if (!vRow) return { error: 'Version not found.' }
  const snap = (vRow as { recipe: AssetSnapshot | null }).recipe
  if (!snap) return { error: 'That version has no snapshot to restore.' }

  // Preserve the current state as a version before overwriting it.
  await recordVersion(assetId, `Before rollback to v${(vRow as { version: number }).version}`, createdBy)

  const { error } = await client
    .from('library_assets')
    .update({
      url: snap.url,
      storage_bucket: snap.storage_bucket,
      storage_path: snap.storage_path,
      mime: snap.mime,
      bytes: snap.bytes,
      width: snap.width,
      height: snap.height,
      config: snap.config,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assetId)
  if (error) return { error: error.message }
  return { ok: true }
}

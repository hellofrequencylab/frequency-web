import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils'
import { asMediaKind, type MediaKind } from './types'

// Airwaves — Loom plumbing for A/V media (ADR-608, P0). The A/V analog of lib/library/event-loom.ts:
// file an already-stored audio/video object (bucket + path + url) into a Space's Loom as a
// library_assets row (kind = 'audio' | 'video', the lanes widened in 20261150000000). The
// recordings.loom_asset_id FK then guarantees the file and the Loom never drift.
//
// copyRecordingToLoom copies the idempotent-on-(space_id, storage_bucket, storage_path), best-effort
// posture of copyImageToLoom / insertSpaceLibraryImage — a repeat is a no-op that returns the existing
// asset id, so a re-upload can't duplicate. Unlike copyImageToLoom it RETURNS the asset id, because
// the caller needs it to set recordings.loom_asset_id (not null).
//
// library_assets isn't in lib/database.types.ts yet, so we use the untyped admin handle — the repo's
// standard pattern for a freshly-added seam (store.ts convention, ADR-246). Service-role only; every
// caller has already gated on per-Space edit permission.

// eslint-disable-next-line no-restricted-syntax -- library_assets isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
const db = () => createAdminClient() as unknown as SupabaseClient

/** The default A/V bucket added in 20261150000000. Large-media sink, separate from library-media. */
export const RECORDINGS_BUCKET = 'recordings-media' as const

/** The existing Loom asset id at (space_id, bucket, path), or null. The idempotency guard — a repeat
 *  copyRecordingToLoom returns this instead of inserting a duplicate. */
async function loomAssetIdAtPath(
  spaceId: string,
  storageBucket: string,
  storagePath: string,
): Promise<string | null> {
  try {
    const { data } = await db()
      .from('library_assets')
      .select('id')
      .eq('space_id', spaceId)
      .eq('storage_bucket', storageBucket)
      .eq('storage_path', storagePath)
      .limit(1)
      .maybeSingle()
    return (data as { id?: string } | null)?.id ? String((data as { id: string }).id) : null
  } catch {
    return null
  }
}

/**
 * File an already-stored A/V object into a Space's Loom and return its library_assets id (the value a
 * `recordings` row stores as loom_asset_id). Idempotent: a repeat at the same (space, bucket, path)
 * returns the existing id without inserting. `kind` must be 'audio' or 'video' (anything else is
 * rejected — this is the A/V path only). Returns null on a bad kind or any write miss, so the caller
 * decides whether a missing Loom id should block the flow (a Recording needs one, so it does).
 */
export async function copyRecordingToLoom(input: {
  spaceId: string
  mediaKind: MediaKind
  storagePath: string
  url: string
  storageBucket?: string
  title?: string | null
  mime?: string | null
  bytes?: number | null
  durationSeconds?: number | null
}): Promise<string | null> {
  const kind = asMediaKind(input.mediaKind)
  if (!kind) return null // A/V only — never file an image through this path.
  const spaceId = (input.spaceId ?? '').trim()
  const storagePath = (input.storagePath ?? '').trim()
  const url = (input.url ?? '').trim()
  if (!spaceId || !storagePath || !url) return null

  const bucket = (input.storageBucket ?? '').trim() || RECORDINGS_BUCKET

  try {
    const existing = await loomAssetIdAtPath(spaceId, bucket, storagePath)
    if (existing) return existing

    const base = (
      input.title?.trim() ||
      storagePath.split('/').pop()?.replace(/\.[^.]+$/, '') ||
      (kind === 'video' ? 'Recording video' : 'Recording audio')
    ).slice(0, 120)
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
    const slug = slugify(`${base}-${stamp}`) || `recording-${stamp}`

    const { data, error } = await db()
      .from('library_assets')
      .insert({
        space_id: spaceId,
        kind, // 'audio' | 'video'
        title: base,
        slug,
        status: 'approved',
        visibility: 'space',
        storage_bucket: bucket,
        storage_path: storagePath,
        url,
        mime: input.mime || (kind === 'video' ? 'video/mp4' : 'audio/mpeg'),
        bytes: input.bytes ?? 0,
        // Duration rides the parametric config blob (no dedicated column on library_assets); the
        // recordings row carries the authoritative duration_seconds.
        config: input.durationSeconds != null ? { durationSeconds: input.durationSeconds } : null,
      })
      .select('id')
      .maybeSingle()
    if (error) {
      // A concurrent copy may have won the (space_id, slug) unique index or the path race — re-read.
      return await loomAssetIdAtPath(spaceId, bucket, storagePath)
    }
    return (data as { id?: unknown } | null)?.id ? String((data as { id: unknown }).id) : null
  } catch {
    return null
  }
}

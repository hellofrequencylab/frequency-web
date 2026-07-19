import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertSpaceLibraryImage } from './store'
import { slugify } from '@/lib/utils'

// Loom plumbing for event images. The Loom is the SPACE-scoped asset library (library_assets,
// space_id). "A member's Loom" = the assets under a space they own. Two seams live here:
//   1. resolveProfileLoomSpaceId — the space that backs a profile's personal Loom.
//   2. copyImageToLoom — file an event-media image into that Loom, idempotently.
// Every caller is best-effort: a Loom write must never fail an event upload or a claim.

// eslint-disable-next-line no-restricted-syntax -- library_assets / spaces aren't fully in the generated types; untyped admin handle (store.ts convention)
const db = () => createAdminClient() as unknown as SupabaseClient

/**
 * The space that backs a profile's personal Loom: the active, non-root space they OWN
 * (spaces.owner_profile_id = profileId), oldest first so it stays stable across uploads. Members
 * who run no space have no Loom yet (personal Looms plug in later, lib/library/scope.ts) → null,
 * and every caller treats that as "skip the Loom copy". FAIL-SAFE to null on any error.
 */
export async function resolveProfileLoomSpaceId(
  profileId: string | null | undefined,
): Promise<string | null> {
  const id = (profileId ?? '').trim()
  if (!id) return null
  try {
    const { data } = await db()
      .from('spaces')
      .select('id')
      .eq('owner_profile_id', id)
      .neq('type', 'root')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    return (data as { id?: string } | null)?.id ?? null
  } catch {
    return null
  }
}

/** True when this space's Loom already holds an image at `storagePath` (idempotency guard). */
async function loomHasStoragePath(spaceId: string, storageBucket: string, storagePath: string): Promise<boolean> {
  try {
    const { data } = await db()
      .from('library_assets')
      .select('id')
      .eq('space_id', spaceId)
      .eq('storage_bucket', storageBucket)
      .eq('storage_path', storagePath)
      .limit(1)
      .maybeSingle()
    return Boolean(data)
  } catch {
    return false
  }
}

/**
 * File an already-stored public image (bucket + path + url) into a space's Loom. Idempotent (a
 * repeat is a no-op) and best-effort (returns silently on any miss). Reuses insertSpaceLibraryImage,
 * so the asset lands space-scoped + approved exactly like a Loom Studio upload.
 */
export async function copyImageToLoom(input: {
  spaceId: string
  storageBucket: string
  storagePath: string
  url: string
  title?: string | null
  mime?: string | null
  bytes?: number | null
  /** The uploader (library_assets.created_by), so the image shows in their personal Loom "My uploads". */
  createdBy?: string | null
}): Promise<void> {
  try {
    if (await loomHasStoragePath(input.spaceId, input.storageBucket, input.storagePath)) return
    const base = (input.title?.trim() || input.storagePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Event photo').slice(0, 120)
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
    const slug = slugify(`${base}-${stamp}`) || `event-photo-${stamp}`
    await insertSpaceLibraryImage({
      spaceId: input.spaceId,
      title: base,
      slug,
      storageBucket: input.storageBucket,
      storagePath: input.storagePath,
      url: input.url,
      mime: input.mime || 'image/jpeg',
      bytes: input.bytes ?? 0,
      createdBy: input.createdBy ?? null,
    })
  } catch {
    /* best-effort: a Loom copy failure must never break the event flow */
  }
}

/** One Loom image the caller may reuse: their OWN space's asset OR a public shared-library asset. */
export type PickableLoomImage = {
  id: string
  title: string
  url: string
  storageBucket: string | null
  storagePath: string | null
  mime: string | null
}

/**
 * Fetch a Loom image by id that the caller is allowed to reuse: it must belong to THEIR Loom space
 * OR be a public shared-library asset (the same authority searchSpaceLibraryImages grants the
 * picker). Returns null on any miss, so a spoofed id can never widen into another space's private
 * assets. `callerSpaceId` may be null (a member with no Loom) — then only public assets resolve.
 */
export async function getPickableLoomImage(
  callerSpaceId: string | null,
  assetId: string,
): Promise<PickableLoomImage | null> {
  const id = (assetId ?? '').trim()
  if (!id) return null
  try {
    const { data } = await db()
      .from('library_assets')
      .select('id, title, url, storage_bucket, storage_path, mime, space_id, visibility, kind, status')
      .eq('id', id)
      .maybeSingle()
    const r = data as Record<string, unknown> | null
    if (!r) return null
    if (r.kind !== 'image' || r.status === 'archived') return null
    const isOwn = callerSpaceId != null && r.space_id === callerSpaceId
    const isPublic = r.visibility === 'public'
    if (!isOwn && !isPublic) return null
    const url = typeof r.url === 'string' ? r.url : ''
    if (!url) return null
    return {
      id: String(r.id),
      title: String(r.title ?? '') || 'Loom image',
      url,
      storageBucket: (r.storage_bucket as string | null) ?? null,
      storagePath: (r.storage_path as string | null) ?? null,
      mime: (r.mime as string | null) ?? null,
    }
  } catch {
    return null
  }
}

/** Resolve + file an event-media image into the caller's own Loom, if they run a space. Best-effort. */
export async function copyEventMediaToProfileLoom(input: {
  profileId: string | null | undefined
  storagePath: string
  url: string
  title?: string | null
  mime?: string | null
  bytes?: number | null
}): Promise<void> {
  const spaceId = await resolveProfileLoomSpaceId(input.profileId)
  if (!spaceId) return
  await copyImageToLoom({
    spaceId,
    storageBucket: 'event-media',
    storagePath: input.storagePath,
    url: input.url,
    title: input.title,
    mime: input.mime,
    bytes: input.bytes,
    // The profile owns this Loom, so stamp them as the uploader → shows in their "My uploads".
    createdBy: input.profileId,
  })
}

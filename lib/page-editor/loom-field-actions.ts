'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { searchSpaceLibraryImages, insertSpaceLibraryImage } from '@/lib/library/store'
import { classifyLoomUpload, fallbackExtFor, fallbackMimeFor } from '@/lib/library/upload-kinds'

// Server actions behind the Loom-backed image field (lib/page-editor/loom-image-field.tsx). A
// 'use server' module exports ONLY async functions, so the pure field component + its Puck config
// import THESE, never a server-only module (the build trap: the editor bundle stays client-safe and
// the public profile ships no editor runtime).
//
// GATE: these are used by a SPACE OPERATOR editing their OWN profile, who is usually NOT platform
// staff. So every action RE-RESOLVES the space from its `slug` and RE-GATES caps.canEditProfile
// (owner / admin / editor) server-side, the SAME authority the space-landing publish action uses
// (app/(main)/spaces/[slug]/edit-page/actions.ts). The slug is threaded from the editor via the
// SpaceEditor context (lib/page-editor/space-editor-context.tsx); the client can lie about it, so the
// server treats it as untrusted and re-checks permission against the resolved space.
//
// SCOPE: uploads file into the SPACE'S OWN Loom (library_assets with space_id = <this space>,
// visibility = 'space') -- NEVER the shared root/public library. The picker searches the space's own
// images UNIONED with the shared/public library for reuse, but writes are always space-scoped.
// Images resolve through the Loom asset `url` (the library-media public URL), so a picked asset and an
// uploaded asset resolve identically.

/** One pickable Loom image: the served URL plus the label the picker grid shows. */
export type LoomImagePick = { id: string; title: string; url: string; alt: string | null }

/** Resolve + AUTHORIZE the caller as an editor (owner / admin / editor) of `slug`'s space. Returns the
 *  space id, or null on any miss (unknown slug, not visible, no edit permission). Untrusted slug: the
 *  gate is the authority, so a client that passes another space's slug still fails unless the caller
 *  can actually edit THAT space. */
async function authorizeSpaceEditor(slug: string | null | undefined): Promise<string | null> {
  const s = (slug ?? '').trim()
  if (!s) return null
  try {
    const caller = await getCallerProfile()
    const viewerProfileId = caller?.id ?? null
    const space = await getVisibleSpaceBySlug(s, viewerProfileId)
    if (!space) return null
    const caps = await getSpaceCapabilities(space, viewerProfileId)
    if (!caps.canEditProfile) return null // owner / admin / editor (the write authority)
    return space.id
  } catch {
    return null
  }
}

/** The images a space operator may pick: the space's OWN Loom images unioned with the shared/public
 *  library, optionally filtered by a text query. Gated on per-space edit permission; FAIL-SAFE to []
 *  (an unauthorized caller, an unknown slug, an empty catalog, or any error). */
export async function listLoomImages(slug: string, query?: string): Promise<LoomImagePick[]> {
  const spaceId = await authorizeSpaceEditor(slug)
  if (!spaceId) return []
  return searchSpaceLibraryImages(spaceId, query)
}

/** Upload a file and FILE IT INTO the SPACE'S OWN Loom (library_assets, space_id = this space,
 *  visibility = 'space'), then return its served public URL. Gated on per-space edit permission. The
 *  block stores that URL (the same address the Loom serves it at), so a picked asset + an uploaded
 *  asset resolve identically. Rolls back the stored file if the catalog insert fails, so a failed
 *  upload never litters storage.
 *
 *  Airwaves P0 (ADR-608) widens the ACCEPTED types beyond images: an image still routes to
 *  library-media at kind='image' with the 20 MB ceiling BYTE-IDENTICALLY, while audio/video route to
 *  the recordings-media bucket at kind='audio'|'video' with the 500 MB ceiling. classifyLoomUpload is
 *  the single place that mapping lives. A non-image/audio/video file is still rejected. */
export async function uploadToLoom(
  slug: string,
  formData: FormData,
): Promise<{ url: string; id: string } | { error: string }> {
  const spaceId = await authorizeSpaceEditor(slug)
  if (!spaceId) return { error: 'You do not have access to add files to this space.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file chosen.' }
  const target = classifyLoomUpload(file.type)
  if (!target) return { error: 'Choose an image, audio, or video file.' }
  if (file.size > target.maxBytes) {
    const limitMb = Math.round(target.maxBytes / 1024 / 1024)
    return { error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${limitMb} MB.` }
  }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || fallbackExtFor(target.kind)).toLowerCase().replace(/[^a-z0-9]/g, '')
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
  // Namespace the object under the owning space, so a space's uploads live in its own storage prefix.
  const path = `${spaceId}/${stamp}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from(target.bucket)
    .upload(path, bytes, { contentType: file.type || fallbackMimeFor(target.kind), upsert: false })
  if (upErr) return { error: upErr.message }

  const { data: pub } = admin.storage.from(target.bucket).getPublicUrl(path)

  const base = (file.name.replace(/\.[^.]+$/, '') || target.kind).slice(0, 120)
  const slugified = `${base}-${stamp}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  const id = await insertSpaceLibraryImage({
    spaceId,
    title: base,
    slug: slugified,
    storageBucket: target.bucket,
    storagePath: path,
    url: pub.publicUrl,
    mime: file.type || fallbackMimeFor(target.kind),
    bytes: file.size,
    kind: target.kind,
  })
  if (!id) {
    // Roll back the orphaned file so a failed insert doesn't leave litter in storage.
    await admin.storage.from(target.bucket).remove([path])
    return { error: 'Could not save the file to your library. Try again.' }
  }

  return { url: pub.publicUrl, id }
}

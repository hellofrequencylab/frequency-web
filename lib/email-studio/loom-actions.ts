'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { writerGate } from '@/lib/beta/guard'
import { getCallerProfile } from '@/lib/auth'
import { getRootSpaceId, searchSpaceLibraryImages, insertSpaceLibraryImage } from '@/lib/library/store'

// Server actions behind the Email Studio canvas's on-canvas image editor. A 'use server' module exports
// ONLY async functions, so the (client) editor imports THESE, never a server-only module — the editor
// bundle stays client-safe.
//
// GATE: these are used by an EMAIL WRITER drafting a campaign, so every action runs the SAME writerGate()
// the rest of the Email Studio write path uses (app/(main)/admin/email-studio/actions.ts): a staff web_role
// OR the marketing capability at WRITE. A read-only marketer (or anyone without write) can neither list nor
// upload here. The gate is the authority; the wire is never trusted.
//
// SCOPE: the Email Studio shares the FREQUENCY MASTER library, which the ROOT space owns. Uploads file into
// the ROOT space's own Loom (library_assets with space_id = <root>, visibility = 'space'); the picker
// searches the root space's images unioned with the shared/public library. An email is a platform-wide
// artifact, so it never touches a member space's private Loom. Images resolve through the Loom asset `url`
// (the library-media public URL), so a picked asset and an uploaded asset resolve identically.

/** One pickable Loom image: the served URL plus the label the picker grid shows. */
export type LoomImagePick = { id: string; title: string; url: string; alt: string | null }

/** The images an email writer may pick: the ROOT space's own Loom images unioned with the shared/public
 *  library, optionally filtered by a text query. Gated on email WRITE authority; FAIL-SAFE to [] (an
 *  unauthorized caller, a missing root space, an empty catalog, or any error). */
export async function listEmailLoomImages(query?: string): Promise<LoomImagePick[]> {
  try {
    const gate = await writerGate()
    if (!gate.ok) return []
    const rootSpaceId = await getRootSpaceId()
    if (!rootSpaceId) return []
    return searchSpaceLibraryImages(rootSpaceId, query)
  } catch {
    return []
  }
}

// Kept UNDER the framework server-action body limit (next.config bodySizeLimit, 10mb) so a single upload
// request never overflows the boundary (which crashes the request instead of returning an error). The client
// rejects oversize files up front too; this is the server backstop.
const MAX_BYTES = 9 * 1024 * 1024

/** Upload an image and FILE IT INTO the ROOT space's own Loom (library_assets, space_id = root,
 *  visibility = 'space'), then return its served public URL. Gated on email WRITE authority. The canvas
 *  stores that URL (the same address the Loom serves it at), so a picked asset + an uploaded asset resolve
 *  identically. Rolls back the stored file if the catalog insert fails, so a failed upload never litters
 *  storage. FAIL-SAFE: any thrown error becomes a returned `{ error }` (never an unhandled rejection that
 *  would hang the caller with no feedback). */
export async function uploadEmailLoomImage(
  formData: FormData,
): Promise<{ url: string; id: string } | { error: string }> {
  try {
    const gate = await writerGate()
    if (!gate.ok) return { error: 'You do not have access to add images.' }

    const rootSpaceId = await getRootSpaceId()
    if (!rootSpaceId) return { error: 'The shared library is unavailable. Try again.' }

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return { error: 'No image chosen.' }
    if (!file.type.startsWith('image/')) return { error: 'Choose an image file.' }
    if (file.size > MAX_BYTES) {
      return { error: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 9 MB.` }
    }

    const admin = createAdminClient()
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
    // Namespace the object under the owning (root) space, so uploads live in the shared library's storage prefix.
    const path = `${rootSpaceId}/${stamp}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: upErr } = await admin.storage
      .from('library-media')
      .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
    if (upErr) return { error: upErr.message }

    const { data: pub } = admin.storage.from('library-media').getPublicUrl(path)

    const base = (file.name.replace(/\.[^.]+$/, '') || 'image').slice(0, 120)
    const slugified = `${base}-${stamp}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const id = await insertSpaceLibraryImage({
      spaceId: rootSpaceId,
      title: base,
      slug: slugified,
      storageBucket: 'library-media',
      storagePath: path,
      url: pub.publicUrl,
      mime: file.type || 'image/jpeg',
      bytes: file.size,
      // Stamp the uploader so this asset shows in their personal Loom ("My uploads").
      createdBy: (await getCallerProfile())?.id ?? null,
    })
    if (!id) {
      // Roll back the orphaned file so a failed insert doesn't leave litter in storage.
      await admin.storage.from('library-media').remove([path])
      return { error: 'Could not save the image to the library. Try again.' }
    }

    return { url: pub.publicUrl, id }
  } catch {
    return { error: 'That upload did not go through. Try again.' }
  }
}

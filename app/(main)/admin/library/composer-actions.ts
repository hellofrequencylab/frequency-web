'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRootSpaceId } from '@/lib/library/store'
import { composeBadge, type BadgeSpec } from '@/lib/loom/badge-composer'

// Save a deterministically-composed badge/trophy (ADR-492). The client renders the composer SVG,
// rasterizes it to a PNG, and posts the base64 here; we store the PNG in library-media and catalog it
// as a normal image asset. Draft (hidden) until published, matching the Studio's preview-first flow.

const BUCKET = 'library-media'

// eslint-disable-next-line no-restricted-syntax -- library_* isn't in lib/database.types.ts yet (types regen is a follow-up integrator step); genuinely untyped table access
const dbh = () => createAdminClient() as unknown as SupabaseClient

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'badge'
}

/** Store a composed badge PNG + catalog it. `publish` decides draft vs live. */
export async function saveComposedBadge(input: {
  title: string
  pngBase64: string
  spec: BadgeSpec
  publish: boolean
}): Promise<{ ok: true; id: string } | { error: string }> {
  const ctx = await requireAdmin('janitor')
  const spaceId = await getRootSpaceId()
  if (!spaceId) return { error: 'No root space found.' }

  const title = (input.title || '').trim().slice(0, 120) || 'Badge'
  const b64 = (input.pngBase64 || '').trim()
  if (b64.length < 100) return { error: 'Nothing to save — compose a badge first.' }

  let bytes: Buffer
  try {
    bytes = Buffer.from(b64, 'base64')
  } catch {
    return { error: 'Could not read the composed image.' }
  }
  if (bytes.byteLength === 0) return { error: 'The composed image was empty.' }

  try {
    const admin = createAdminClient()
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`
    const path = `${spaceId}/badge-${slugify(title)}-${stamp}.png`
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: false })
    if (upErr) return { error: upErr.message }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

    const { data, error } = await dbh()
      .from('library_assets')
      .insert({
        space_id: spaceId,
        kind: 'image',
        title,
        slug: `badge-${slugify(title)}-${Date.now().toString(36)}`,
        category: 'Badges',
        tags: ['composed', 'badge', input.spec.template],
        status: input.publish ? 'approved' : 'draft',
        visibility: 'public',
        storage_bucket: BUCKET,
        storage_path: path,
        url: pub.publicUrl,
        mime: 'image/png',
        bytes: bytes.byteLength,
        width: 400,
        height: 440,
        // Keep the recipe + the source SVG so a badge can be re-opened/re-composed later.
        config: { source: 'composer', spec: input.spec, svg: composeBadge(input.spec), createdBy: ctx.profileId },
      })
      .select('id')
      .maybeSingle()
    if (error || !data) return { error: error?.message ?? 'Could not save the badge.' }

    revalidatePath('/admin/library')
    return { ok: true, id: String((data as { id: string }).id) }
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : 'Could not save the badge.' }
  }
}

'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getPracticeCapabilities } from '@/lib/core/load-capabilities'
import { slugify } from '@/lib/utils'

// Safe raster image types for cover uploads. SVG is excluded deliberately (it can carry script);
// the public site-media bucket has no MIME constraint, so an arbitrary content-type (text/html,
// image/svg+xml) would serve EXECUTABLE from the CDN URL stored in header_image (stored XSS).
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
// The practice detail route is id-based (/practices/[id]); the settings drawer also matches the
// bespoke /practices/new. Guard so a non-uuid id never hits the uuid PK (Postgres 22P02).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// In-place "Practice settings" admin module (EMBEDDED-ADMIN.md / ADR-133), mirroring
// the Event + Circle settings modules. The DB reads/writes run on the SESSION client
// (RLS-enforced; T0 convergence), and re-check practice.editSettings in app code as
// defense-in-depth. Only the cover-image storage upload still uses the admin client.
// The cover is stored as a public URL in
// practices.header_image (like circles.image_url, via the 'site-media' bucket), NOT a
// storage path — so reads need no getPublicUrl resolution, unlike events.

/** Load the editable fields of a practice, but only for a viewer who may edit it.
 *  Returns null when the practice is missing or the caller lacks
 *  practice.editSettings (so the module renders no chrome for someone who can't
 *  manage this practice). The route resolves practices by id (/practices/[id]). */
export async function getPracticeAdminData(id: string) {
  // Non-uuid ids (e.g. /practices/new, matched by the settings-drawer scope regex) would fire a
  // Postgres 22P02 against the uuid PK. Fail closed before querying — the module renders nothing.
  if (!UUID_RE.test(id)) return null

  const db = await createClient()
  const { data: practice } = await db
    .from('practices')
    .select('id, slug, title, summary, description, header_image, duration_min, category')
    .eq('id', id)
    .maybeSingle()
  if (!practice) return null

  const caps = await getPracticeCapabilities(practice.id)
  if (!caps.has('practice.editSettings')) return null

  // header_image is already a public URL (site-media bucket), so no getPublicUrl
  // resolution is needed — unlike events, which store a storage path.
  return {
    id: practice.id,
    slug: practice.slug,
    title: practice.title,
    summary: practice.summary,
    description: practice.description,
    header_image: practice.header_image,
    duration_min: practice.duration_min,
    category: practice.category,
  }
}

/** Patch the day-to-day practice settings in place. Re-checks practice.editSettings
 *  before writing. */
export async function updatePracticeSettings(id: string, slug: string | null, fd: FormData) {
  const caps = await getPracticeCapabilities(id)
  if (!caps.has('practice.editSettings')) throw new Error('Unauthorized')

  const db = await createClient()

  const title = (fd.get('title') as string).trim()
  if (!title) throw new Error('Title is required')

  // Duration: empty clears to null; otherwise a positive integer in minutes (parseInt would let a
  // negative through, so clamp to >= 1).
  const durationRaw = ((fd.get('duration_min') as string) ?? '').trim()
  const durationParsed = durationRaw ? parseInt(durationRaw, 10) : NaN
  const durationMin = Number.isFinite(durationParsed) && durationParsed > 0 ? durationParsed : null

  const { error } = await db
    .from('practices')
    .update({
      title,
      summary: ((fd.get('summary') as string) ?? '').trim() || null,
      description: ((fd.get('description') as string) ?? '').trim() || null,
      duration_min: durationMin,
      category: ((fd.get('category') as string) ?? '').trim() || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/practices/${id}`)
  if (slug) revalidatePath(`/practices/${slug}`)
  revalidatePath('/practices')
}

// Cover image: upload to the public `site-media` bucket and persist the public URL in
// practices.header_image, or clear it. Both re-check practice.editSettings
// (capabilities are law). Mirrors uploadCircleCover EXACTLY — the URL-storing pattern
// (the column holds the full public URL, not a storage path).
export async function uploadPracticeCover(
  id: string,
  slug: string | null,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const caps = await getPracticeCapabilities(id)
  if (!caps.has('practice.editSettings')) return { error: 'Unauthorized' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Image must be under 8MB.' }
  if (!IMAGE_MIME.includes(file.type)) return { error: 'Use a JPEG, PNG, WebP, GIF, or AVIF image.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `practices/${id}/cover-${Date.now()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from('site-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return { error: upErr.message }

  const { data } = admin.storage.from('site-media').getPublicUrl(path)
  const { error: dbErr } = await admin
    .from('practices')
    .update({ header_image: data.publicUrl })
    .eq('id', id)
  if (dbErr) return { error: dbErr.message }

  revalidatePath(`/practices/${id}`)
  if (slug) revalidatePath(`/practices/${slug}`)
  revalidatePath('/practices')
  return { url: data.publicUrl }
}

export async function removePracticeCover(id: string, slug: string | null) {
  const caps = await getPracticeCapabilities(id)
  if (!caps.has('practice.editSettings')) throw new Error('Unauthorized')

  const db = await createClient()
  const { error } = await db.from('practices').update({ header_image: null }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/practices/${id}`)
  if (slug) revalidatePath(`/practices/${slug}`)
  revalidatePath('/practices')
}

/** Rename a practice's permalink. Slugifies the input, rejects empty, and ensures the
 *  new slug is unique across practices before writing. Returns the new slug so the
 *  client can redirect the page. Re-checks practice.editSettings. */
export async function updatePracticePermalink(
  id: string,
  slug: string | null,
  newSlug: string,
): Promise<{ slug: string } | { error: string }> {
  const caps = await getPracticeCapabilities(id)
  if (!caps.has('practice.editSettings')) return { error: 'Unauthorized' }

  const next = slugify(newSlug ?? '')
  if (!next) return { error: 'Permalink cannot be empty.' }

  const db = await createClient()

  if (next !== slug) {
    const { data: clash } = await db
      .from('practices')
      .select('id')
      .eq('slug', next)
      .neq('id', id)
      .maybeSingle()
    if (clash) return { error: 'That permalink is already taken.' }
  }

  const { error } = await db.from('practices').update({ slug: next }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/practices/${id}`)
  if (slug) revalidatePath(`/practices/${slug}`)
  revalidatePath(`/practices/${next}`)
  revalidatePath('/practices')
  return { slug: next }
}

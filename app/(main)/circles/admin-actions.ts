'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { listPublicPractices, getCircleActivePractice } from '@/lib/practices'
import { slugify } from '@/lib/utils'
import type { Database } from '@/lib/database.types'

// Known rail block keys — the editor and the saved order are constrained to these.
const SIDEBAR_KEYS = ['members', 'health', 'practice', 'events', 'invite'] as const

// In-place "Circle settings" admin module (EMBEDDED-ADMIN.md / ADR-133, Phase-2
// pilot). Both the read and the write re-resolve the per-circle capability set via
// getCircleCapabilities — the dock's role-gated visibility is UX only; THIS is the
// authority (capabilities are law, capabilities.ts). The admin client bypasses
// RLS, so the check here — not RLS — is what protects the mutation.

/** Load the editable fields of a circle, but only for a viewer who may edit it.
 *  Returns null when the circle is missing or the caller lacks circle.editSettings
 *  (so the module renders no chrome for someone who can't manage this circle). */
export async function getCircleAdminData(slug: string) {
  const admin = createAdminClient()
  // sidebar_order isn't in the generated types yet (added by a fresh migration) —
  // read it via the untyped client and project it onto the typed select.
  const { data: circle } = await (admin as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{
            data:
              | (Database['public']['Tables']['circles']['Row'] & { sidebar_order: string[] | null })
              | null
          }>
        }
      }
    }
  })
    .from('circles')
    .select('id, slug, name, about, type, member_cap, status, image_url, sidebar_order')
    .eq('slug', slug)
    .maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.editSettings')) return null

  // Also load the practice picker data ("This week's practice" lives here now).
  const [practice_library, activePractice] = await Promise.all([
    listPublicPractices(),
    getCircleActivePractice(circle.id),
  ])

  return {
    id: circle.id,
    slug: circle.slug,
    name: circle.name,
    about: circle.about,
    type: circle.type,
    member_cap: circle.member_cap,
    status: circle.status,
    image_url: circle.image_url,
    sidebar_order: (circle.sidebar_order ?? null) as string[] | null,
    practice_library: practice_library.map((p) => ({ id: p.id, title: p.title })),
    active_practice_id: activePractice?.id ?? null,
  }
}

/** Patch the day-to-day circle settings in place. Re-checks circle.editSettings
 *  before writing; leaves host_id / hub_id untouched (host/hub reassignment stays
 *  in the full admin editor). */
export async function updateCircleSettings(id: string, slug: string, fd: FormData) {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('circles')
    .update({
      name: (fd.get('name') as string).trim(),
      about: ((fd.get('about') as string) ?? '').trim() || null,
      type: fd.get('type') as Database['public']['Enums']['circle_type'],
      member_cap: parseInt(fd.get('member_cap') as string, 10) || 12,
      status: fd.get('status') as Database['public']['Enums']['group_status'],
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
}

// Field-level patch for the inline tuning layer (ADR-138). Allowlisted to the
// edit-in-place fields so an inline edit can never wipe the rest of the circle;
// re-checks circle.editSettings, same as the full settings form.
const INLINE_FIELDS = ['name', 'about'] as const
type InlineField = (typeof INLINE_FIELDS)[number]

export async function updateCircleField(id: string, slug: string, field: InlineField, value: string) {
  if (!INLINE_FIELDS.includes(field)) throw new Error('Invalid field')

  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) throw new Error('Unauthorized')

  const trimmed = value.trim()
  if (field === 'name' && !trimmed) throw new Error('Name is required')

  const admin = createAdminClient()
  const { error } = await admin
    .from('circles')
    .update(field === 'about' ? { about: trimmed || null } : { name: trimmed })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
}

// Cover image: upload to the public `site-media` bucket and persist image_url, or
// clear it. Both re-check circle.editSettings (capabilities are law). Mirrors the
// Puck uploader (lib/page-editor/upload-action.ts) but gated per-circle, not staff.
export async function uploadCircleCover(
  id: string,
  slug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Image must be under 8MB.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `circles/${id}/${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from('site-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return { error: upErr.message }

  const { data } = admin.storage.from('site-media').getPublicUrl(path)
  const { error: dbErr } = await admin.from('circles').update({ image_url: data.publicUrl }).eq('id', id)
  if (dbErr) return { error: dbErr.message }

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
  return { url: data.publicUrl }
}

export async function removeCircleCover(id: string, slug: string) {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin.from('circles').update({ image_url: null }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
}

// The admin client is typed against generated types that don't yet know about
// circles.sidebar_order (a fresh migration). Cast to an untyped update surface so we
// can write the new column without a type error — the capability gate above is the
// authority either way.
type UntypedUpdate = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => {
      eq: (c: string, val: string) => Promise<{ error: { message: string } | null }>
    }
  }
}

/** Persist the host-chosen order of the right-rail blocks. Re-checks
 *  circle.editSettings; rejects anything that isn't an array of known block keys. */
export async function saveSidebarOrder(id: string, slug: string, order: string[]) {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) throw new Error('Unauthorized')

  if (
    !Array.isArray(order) ||
    order.some((k) => typeof k !== 'string' || !SIDEBAR_KEYS.includes(k as (typeof SIDEBAR_KEYS)[number]))
  ) {
    throw new Error('Invalid sidebar order')
  }

  const admin = createAdminClient()
  const { error } = await (admin as unknown as UntypedUpdate)
    .from('circles')
    .update({ sidebar_order: order })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/circles/${slug}`)
}

/** Rename a circle's permalink. Slugifies the input, rejects empty, and ensures the
 *  new slug is unique across circles before writing. Returns the new slug so the
 *  client can redirect the page. Re-checks circle.editSettings. */
export async function updateCirclePermalink(
  id: string,
  slug: string,
  newSlug: string,
): Promise<{ slug: string } | { error: string }> {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) return { error: 'Unauthorized' }

  const next = slugify(newSlug ?? '')
  if (!next) return { error: 'Permalink cannot be empty.' }

  const admin = createAdminClient()

  if (next !== slug) {
    const { data: clash } = await admin
      .from('circles')
      .select('id')
      .eq('slug', next)
      .neq('id', id)
      .maybeSingle()
    if (clash) return { error: 'That permalink is already taken.' }
  }

  const { error } = await (admin as unknown as UntypedUpdate)
    .from('circles')
    .update({ slug: next })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/circles/${slug}`)
  revalidatePath(`/circles/${next}`)
  revalidatePath('/circles')
  return { slug: next }
}

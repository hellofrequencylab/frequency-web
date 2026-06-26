'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { slugify } from '@/lib/utils'
import type { AttendanceMode } from '@/lib/events/geocode'

// In-place "Event settings" admin module (EMBEDDED-ADMIN.md / ADR-133). Read +
// write both re-resolve event.editSettings server-side (the dock's role gate is UX;
// this is the authority — the admin client bypasses RLS). Cancel/reinstate lives
// here too (the header kebab is gone; Settings is the one host surface).

// The admin client's generated types don't cover every events column used below
// (cover_image_path / capacity / attendance_mode / slug are newer than the generated
// types — repo convention; see app/(main)/events/index-data.ts). Cast to an untyped
// update surface for those, with the capability gate as the real authority.
type UntypedUpdate = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => {
      eq: (c: string, val: string) => Promise<{ error: { message: string } | null }>
    }
  }
}

const VALID_ATTENDANCE: AttendanceMode[] = ['in_person', 'online', 'hybrid']

export async function getEventAdminData(slug: string) {
  const admin = createAdminClient()
  // cover_image_path / capacity / attendance_mode are newer than the generated DB
  // types — read them through an untyped client (repo convention).
  const { data: event } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: EventAdminRow | null }> }
      }
    }
  })
    .from('events')
    .select(
      'id, slug, title, description, location, starts_at, ends_at, is_cancelled, cover_image_path, capacity, attendance_mode',
    )
    .eq('slug', slug)
    .maybeSingle()
  if (!event) return null

  const caps = await getEventCapabilities(event.id)
  if (!caps.has('event.editSettings')) return null

  // Cover lives as a storage PATH in the public `event-media` bucket (mirrors
  // event-activity / recap-album; see index-data.ts ~400). Resolve it to a public
  // URL for InlineCover to display — the stored value stays a path.
  const coverUrl = event.cover_image_path
    ? admin.storage.from('event-media').getPublicUrl(event.cover_image_path).data.publicUrl
    : null

  return { ...event, coverUrl }
}

type EventAdminRow = {
  id: string
  slug: string
  title: string
  description: string | null
  location: string | null
  starts_at: string | null
  ends_at: string | null
  is_cancelled: boolean
  cover_image_path: string | null
  capacity: number | null
  attendance_mode: string | null
}

/** Cancel or reinstate the event — the host control that used to live in the
 *  header kebab. Same capability gate as the rest of this module. */
export async function setEventCancelled(id: string, slug: string, cancelled: boolean) {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin.from('events').update({ is_cancelled: cancelled }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

export async function updateEventSettings(id: string, slug: string, fd: FormData) {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const startsAt = fd.get('starts_at') as string
  const endsAt = fd.get('ends_at') as string
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    throw new Error('End time must be after the start time.')
  }

  // Capacity: empty clears to null (unlimited); otherwise a positive integer (parseInt would let a
  // negative through, so require > 0).
  const capacityRaw = ((fd.get('capacity') as string) ?? '').trim()
  const capacityParsed = capacityRaw ? parseInt(capacityRaw, 10) : NaN
  const capacity = Number.isFinite(capacityParsed) && capacityParsed > 0 ? capacityParsed : null

  // Attendance mode is app-constrained (free text at the DB layer); fall back to
  // in_person for anything unexpected, matching the rest of the events code.
  const modeRaw = (fd.get('attendance_mode') as string | null) ?? 'in_person'
  const attendanceMode: AttendanceMode = (VALID_ATTENDANCE as string[]).includes(modeRaw)
    ? (modeRaw as AttendanceMode)
    : 'in_person'

  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({
      title: (fd.get('title') as string).trim(),
      description: ((fd.get('description') as string) ?? '').trim() || null,
      location: ((fd.get('location') as string) ?? '').trim() || null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      capacity,
      attendance_mode: attendanceMode,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

// Field-level patch for the inline tuning layer (ADR-138). Allowlisted; re-checks
// event.editSettings, same as the full settings form.
const INLINE_FIELDS = ['title', 'description'] as const
type InlineField = (typeof INLINE_FIELDS)[number]

export async function updateEventField(id: string, slug: string, field: InlineField, value: string) {
  if (!INLINE_FIELDS.includes(field)) throw new Error('Invalid field')

  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const trimmed = value.trim()
  if (field === 'title' && !trimmed) throw new Error('Title is required')

  const admin = createAdminClient()
  const { error } = await admin
    .from('events')
    .update(field === 'title' ? { title: trimmed } : { description: trimmed || null })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

// Cover image: upload to the PUBLIC `event-media` bucket and persist the storage
// PATH in events.cover_image_path (resolved to a public URL at read time via
// getPublicUrl — see index-data.ts), or clear it. Both re-check event.editSettings
// (capabilities are law; the admin client bypasses RLS). Mirrors uploadCircleCover,
// but events store a PATH, not the full URL, so the upload returns the resolved URL
// for InlineCover to preview while the column keeps the path.
export async function uploadEventCover(
  id: string,
  slug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Image must be under 8MB.' }
  // Safe raster types only (defense in depth: the event-media bucket constrains MIME, but the
  // action should too). SVG excluded deliberately (it can carry script).
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) {
    return { error: 'Use a JPEG, PNG, WebP, GIF, or AVIF image.' }
  }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${id}/cover-${Date.now()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return { error: upErr.message }

  // Persist the PATH (not the public URL) — events resolve the URL at read time.
  const { error: dbErr } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ cover_image_path: path })
    .eq('id', id)
  if (dbErr) return { error: dbErr.message }

  const { data } = admin.storage.from('event-media').getPublicUrl(path)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
  return { url: data.publicUrl }
}

export async function removeEventCover(id: string, slug: string) {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ cover_image_path: null })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

/** Rename an event's permalink. Slugifies the input, rejects empty, and ensures the
 *  new slug is unique across events before writing. Returns the new slug so the
 *  client can redirect the page. Re-checks event.editSettings. */
export async function updateEventPermalink(
  id: string,
  slug: string,
  newSlug: string,
): Promise<{ slug: string } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const next = slugify(newSlug ?? '')
  if (!next) return { error: 'Permalink cannot be empty.' }

  const admin = createAdminClient()

  if (next !== slug) {
    const { data: clash } = await admin
      .from('events')
      .select('id')
      .eq('slug', next)
      .neq('id', id)
      .maybeSingle()
    if (clash) return { error: 'That permalink is already taken.' }
  }

  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ slug: next })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/events/${slug}`)
  revalidatePath(`/events/${next}`)
  revalidatePath('/events')
  revalidatePath('/feed')
  return { slug: next }
}

import { EventGallery } from '@/components/events/event-gallery'
import { getEventContext } from '@/lib/events/active-event'
import { createAdminClient } from '@/lib/supabase/admin'
import { posterSignedUrl } from '@/lib/events/poster-media'

// The event GALLERY module (the `event-gallery` layout block): the clickable photo strip + lightbox
// an operator can place in the event page's arrangeable body. Self-fetches from the request-scoped
// event context (lib/events/active-event.ts) — it reads the event id, resolves the header + gallery
// image URLs itself (mirroring the detail page's build), and renders EventGallery, which self-hides
// with fewer than two photos so it leaves no empty slot. Mirrors the other event body modules.
//
// This makes the gallery an ARRANGEABLE content box in the page Layout selector rather than a
// hard-locked render: the header is previewed as the FIRST tile (the unified model keeps
// cover_image_path == gallery_image_paths[0]).
export const EventGalleryBlock = async () => {
  const ctx = getEventContext()
  if (!ctx) return null

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('events')
    .select('cover_image_path, poster_path, gallery_image_paths')
    .eq('id', ctx.event.id)
    .maybeSingle()
  if (!row) return null

  const publicUrl = (path: string) =>
    admin.storage.from('event-media').getPublicUrl(path).data.publicUrl

  // The header leads: the uploaded cover (== gallery[0] under the unified model), else the original
  // scanned poster (signed, private bucket). Then the uploaded gallery extras. Dedupe by URL so the
  // header photo shows once, not twice.
  const coverUrl = row.cover_image_path ? publicUrl(row.cover_image_path) : null
  const posterUrl = coverUrl ? null : await posterSignedUrl(row.poster_path)
  const galleryUrls = [
    ...new Set(
      [coverUrl ?? posterUrl, ...(row.gallery_image_paths ?? []).map(publicUrl)].filter(
        (u): u is string => !!u,
      ),
    ),
  ]

  return <EventGallery images={galleryUrls} />
}

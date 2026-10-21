import { createPublicClient } from '@/lib/supabase/public'
import { SITE_NAME } from '@/lib/site'
import { stageCardResponse } from '@/lib/og/stage-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = 'nodejs'
export const alt = `A host on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. next/og emits lossless PNG, and a photographic 1200x630 card measures
// ~1,776KB that way against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// Per-host dynamic OG card for /discover/events/organizer/[handle] (SCAN-202): a sitemapped,
// self-canonical profile page that was sharing the generic brand card. Falls back to a generic
// branded card when the host isn't found. Visual language mirrors
// app/discover/partners/[slug]/opengraph-image.tsx: near-black gradient ground, amber brand bar
// (#E2912F — Satori has no access to the CSS token system, so the literal mirrors the root image),
// white display type.
//
// Reads the SAME RPC the page reads (public_organizer_events, ADR-899), so no new query shape
// enters the graph: city-only, PUBLISHED + PUBLIC + non-removed + non-demo events on a
// network-visible Space. The card shows only the host's identity and how many public events are
// upcoming — never a venue, never an event that isn't listable.

type OrganizerCardRow = {
  host_display_name: string | null
  host_handle: string | null
  id: string | null
  is_past: boolean | null
}

/** Never throws. The page's own reader returns null on a miss but lets a transport failure
 *  propagate (it must, so a crawler gets a real 404 rather than a soft one). An OG route has no
 *  such consequence and is prerendered for the same ~500 handles as the page, so a read failure
 *  here degrades to the branded fallback rather than ending a production export (LIVE-084). */
async function readOrganizer(
  handle: string,
): Promise<{ displayName: string; handle: string; upcoming: number } | null> {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase.rpc('public_organizer_events', { _handle: handle })
    if (error || !Array.isArray(data) || data.length === 0) return null
    const rows = data as OrganizerCardRow[]
    const head = rows[0]
    if (!head?.host_handle) return null
    // Rows without an id are the host-only row the RPC returns when nothing is listable.
    const upcoming = rows.filter((r) => r.id && !r.is_past).length
    return {
      displayName: head.host_display_name ?? 'A Frequency host',
      handle: head.host_handle,
      upcoming,
    }
  } catch {
    return null
  }
}

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const organizer = await readOrganizer(handle)

  const name = organizer?.displayName ?? 'Hosts'
  const isFallback = !organizer
  const count = organizer?.upcoming ?? 0
  const chip =
    organizer && count > 0 ? `${count} upcoming ${count === 1 ? 'event' : 'events'}` : null

  return stageCardResponse({
    kicker: 'Host',
    title: name,
    line: isFallback ? `Hosts on ${SITE_NAME}` : `Events hosted on ${SITE_NAME}`,
    meta: [organizer ? `@${organizer.handle}` : null, chip].filter(Boolean).join(' · ') || null,
  })
}

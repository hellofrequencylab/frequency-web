import { getSpaceBySlug } from '@/lib/spaces/store'
import { assembleShowFeed } from '@/lib/airwaves/shows'
import { buildShowRssXml } from '@/lib/airwaves/rss'
import { SITE_URL } from '@/lib/site'

// Airwaves P3 — the PUBLIC podcast RSS feed (ADR-608). This lives at the top-level `app/podcasts/*`
// segment, OUTSIDE the `(main)` group, so it carries no app shell and (like `app/sites/*`) no auth
// gate: a podcast client (Apple, Spotify, Overcast) polls this URL with no cookie, so it MUST resolve
// for an anonymous request. There is no middleware in this repo, so nothing walls `/podcasts/*` off;
// the feed's own visibility floor is `assembleShowFeed`, which returns null for a missing / draft /
// private-feed Show (we 404 those identically, no existence leak).
//
// force-dynamic: the feed reads live rows every request (a new Episode must appear without a rebuild).
// The XML itself is built by the PURE `buildShowRssXml` (lib/airwaves/rss.ts); this handler only
// resolves the Space + feed and computes the absolute URLs the builder needs.
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ spaceSlug: string; showSlug: string }> },
) {
  const { spaceSlug, showSlug } = await params

  const space = await getSpaceBySlug(spaceSlug)
  if (!space) return new Response('Not found', { status: 404 })

  const feed = await assembleShowFeed(space.id, showSlug)
  if (!feed) return new Response('Not found', { status: 404 })

  const showPageUrl = `${SITE_URL}/spaces/${spaceSlug}/podcasts/${showSlug}`
  const xml = buildShowRssXml(feed, {
    feedUrl: `${SITE_URL}/podcasts/${spaceSlug}/${showSlug}/rss.xml`,
    showPageUrl,
    episodeUrl: (ep) => `${showPageUrl}#${ep.recording.slug ?? ep.recording.id}`,
  })

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // Podcast clients poll on their own schedule; a short shared cache absorbs bursts without
      // holding a stale feed for long.
      'Cache-Control': 'public, max-age=300',
    },
  })
}

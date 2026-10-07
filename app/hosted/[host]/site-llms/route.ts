import { hostedSitePages, resolveHostedCrawlTarget } from '@/lib/sites/hosted-crawl'
import { siteLlmsTxt } from '@/lib/sites/seo'
import { withoutAccentMarks } from '@/lib/sites/house-theme'
import { readSiteHero } from '@/lib/spaces/website'
import { readSiteBooking } from '@/lib/sites/site-booking'

// llms.txt for a Space website on its own domain or free subdomain. proxy.ts rewrites
// `https://<domain>/llms.txt` here, so an answer engine reads about the site, not Frequency's own
// llms.txt. The summary is the website intro, else the Space tagline. A host with no published site
// has none and 404s, like its sitemap.
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }): Promise<Response> {
  const { host } = await params
  const { origin, space } = await resolveHostedCrawlTarget(host)
  if (!space) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  const summary = readSiteHero(space.preferences).tagline ?? space.tagline ?? null
  const body = siteLlmsTxt(origin, {
    name: space.brandName?.trim() || space.name,
    summary: summary ? withoutAccentMarks(summary) : null,
    pages: hostedSitePages(space, (await readSiteBooking(space.id)).takesBookings),
  })
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

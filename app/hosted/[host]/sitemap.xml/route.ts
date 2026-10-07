import { hostedSitemapSlugs, resolveHostedCrawlTarget } from '@/lib/sites/hosted-crawl'
import { siteSitemapXml } from '@/lib/sites/seo'
import { readSiteBooking } from '@/lib/sites/site-booking'

// sitemap.xml for a Space website on its own domain (PROG-E10 phase 4, LIVE-783). proxy.ts rewrites
// `https://<domain>/sitemap.xml` here. It lists the site's own pages on the domain; a host with no
// published site has no sitemap and 404s.
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }): Promise<Response> {
  const { host } = await params
  const { origin, space } = await resolveHostedCrawlTarget(host)
  if (!space) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  const { takesBookings } = await readSiteBooking(space.id)
  return new Response(siteSitemapXml(origin, hostedSitemapSlugs(space, takesBookings)), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })
}

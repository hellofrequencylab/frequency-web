import { resolveHostedCrawlTarget } from '@/lib/sites/hosted-crawl'
import { siteRobotsTxt } from '@/lib/sites/seo'

// robots.txt for a Space website on its own domain (PROG-E10 phase 4, LIVE-783). proxy.ts rewrites
// `https://<domain>/robots.txt` here, so the domain describes the site and not Frequency. An unbound
// host or an unpublished site asks crawlers to stay out.
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }): Promise<Response> {
  const { host } = await params
  const { origin, space } = await resolveHostedCrawlTarget(host)
  return new Response(siteRobotsTxt(origin, space !== null), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

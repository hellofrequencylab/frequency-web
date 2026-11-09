// THE PROXY'S ONE QUESTION ABOUT A SITE (LIVE-SUBDOMAIN-ATTRIBUTION): where does this Space's website
// live? Asked only for a tagged visit to a slug subdomain, answered by the cached JSON route
// app/api/site-domain/[slug] on Frequency's own origin, never by the database: the proxy runs on every
// request and keeps its no-database rule. A slow or failed answer is null, and the visitor gets the
// subdomain page as before (its own ISR redirect still runs, without the tag), so the worst case is
// today's behaviour. No cookies, no credentials: a public GET for public data.
import { appOrigin, siteDomainApiPath } from '@/lib/sites/host'

const LOOKUP_TIMEOUT_MS = 1500

/** The live custom domain of a Space website, or null (none, unknown slug, slow or failed lookup). */
export async function lookupLiveSiteDomain(slug: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchFn(`${appOrigin()}${siteDomainApiPath(slug)}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { domain?: unknown }
    return typeof data.domain === 'string' && data.domain ? data.domain : null
  } catch {
    return null
  }
}

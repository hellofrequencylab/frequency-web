// IndexNow (LIVE-1137): tell Bing and the other IndexNow engines which public URLs changed, so a new
// event or Space page is seen within minutes instead of at the next crawl. PURE except submitIndexNow.
//
// The key is NOT a secret. The protocol proves host ownership by fetching the same string from a file
// at the site root, so it is public by design: public/${INDEXNOW_KEY}.txt holds it. Rotating it means
// changing the constant and the file name together; the unit test pins that they agree.
import { SITE_URL } from '@/lib/site'

export const INDEXNOW_KEY = 'ea8f4ab0df2e38b80b8baa334f60c17f'
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
/** The protocol caps one request at 10,000 URLs. */
const INDEXNOW_MAX_URLS = 10_000

interface IndexNowPayload {
  host: string
  key: string
  keyLocation: string
  urlList: string[]
}

/** The URLs from a sitemap whose lastModified falls inside the window, kept to this site's own host
 *  and de-duplicated. A sitemap row with no lastModified is never "recent": it cannot be told from
 *  an unchanged one, and submitting the whole map every day is what the protocol asks you not to do. */
export function recentSitemapUrls(
  entries: { url: string; lastModified?: string | number | Date }[],
  sinceMs: number,
  siteUrl: string = SITE_URL,
): string[] {
  const host = new URL(siteUrl).host
  const out = new Set<string>()
  for (const e of entries) {
    if (e.lastModified === undefined) continue
    const at = new Date(e.lastModified).getTime()
    if (!Number.isFinite(at) || at < sinceMs) continue
    try {
      if (new URL(e.url).host === host) out.add(e.url)
    } catch {
      /* a malformed sitemap url is skipped, not fatal */
    }
  }
  return [...out].slice(0, INDEXNOW_MAX_URLS)
}

export function buildIndexNowPayload(urls: string[], siteUrl: string = SITE_URL): IndexNowPayload {
  return {
    host: new URL(siteUrl).host,
    key: INDEXNOW_KEY,
    keyLocation: `${siteUrl.replace(/\/$/, '')}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  }
}

/** POST the payload. Returns the HTTP status: 200 and 202 both mean accepted. */
export async function submitIndexNow(urls: string[]): Promise<number> {
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(buildIndexNowPayload(urls)),
  })
  return res.status
}

// GET /.well-known/security.txt (RFC 9116, SCAN-1278): where to report a security problem. The crawl of
// 2026-11-19 found none, so a researcher had no published contact. Public, static text, no caller identity.
// The proxy matcher skips /.well-known/, so this answers before any session code runs.
import { CONTACT_EMAIL, SITE_URL } from '@/lib/site'

export const dynamic = 'force-static'

/** RFC 9116 asks for an Expires under a year out. Re-read on every build, so a deploy renews it. */
function expires(now = new Date()): string {
  const next = new Date(now)
  next.setUTCDate(next.getUTCDate() + 300)
  return next.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function GET() {
  const body = [
    `Contact: mailto:${CONTACT_EMAIL}`,
    `Expires: ${expires()}`,
    'Preferred-Languages: en',
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
  ].join('\n')
  return new Response(body + '\n', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  })
}

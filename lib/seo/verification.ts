// Search engine site-verification tags, set from env so the owner can verify by tag when DNS is
// awkward (OWN-098, OWN-099, LIVE-1136). Blank means unset (lib/env/string.ts): a blank value must
// never ship an empty <meta content="">. PURE: reads process.env at call time.
import type { Metadata } from 'next'
import { envStringOrNull } from '@/lib/env/string'

export function siteVerification(): Metadata['verification'] | undefined {
  const google = envStringOrNull('GOOGLE_SITE_VERIFICATION')
  const bing = envStringOrNull('BING_SITE_VERIFICATION')
  if (!google && !bing) return undefined
  return {
    ...(google ? { google } : {}),
    ...(bing ? { other: { 'msvalidate.01': bing } } : {}),
  }
}

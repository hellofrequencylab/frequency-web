'use server'

import { headers } from 'next/headers'
import { getMyProfileId } from '@/lib/auth'
import { rateLimitOk } from '@/lib/rate-limit'
import { ensureShareLink, readShareLinkOpens } from './short-link-store'
import { shortenablePath } from './short-link'

// SHORT SHARE LINKS (LIVE-1960, part 2). The share buttons ask for a short code for the page in front of
// them. The sharer is the session's own profile, never a client-supplied id, so nobody can mint a link
// that credits someone else. A page that is not a public one answers null and the button keeps its long
// URL. Returns a root-relative `/s/<code>`; the button puts its own origin in front.
export async function shortShareLink(path: string): Promise<{ rel: string; opens: number | null } | null> {
  if (typeof path !== 'string' || path.length > 300) return null
  const profileId = await getMyProfileId()
  const ip = ((await headers()).get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim()
  if (!(await rateLimitOk('share_link', profileId ?? ip, 30, '10 m', { whenUnconfigured: 'allow' }))) return null
  const rel = await ensureShareLink('', path, profileId)
  if (!rel) return null
  // The sharer sees how often their own link was opened (counts only, last 30 days).
  const clean = shortenablePath(path)
  return { rel, opens: clean ? await readShareLinkOpens(clean, profileId) : null }
}

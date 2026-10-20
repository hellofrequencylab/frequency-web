import { NextResponse } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { normalizeCardToken, sha256Hex } from '@/lib/devices/credentials'
import { cardTokenIsLive, scannerDevicesEnabled } from '@/lib/devices/store'

export const dynamic = 'force-dynamic'

// /c/<token> (LIVE-1125, docs/LOYALTY.md "Counter scanners"): what a member card opens on a phone. The
// card's NDEF URI is this link, so tapping it sends the member to their own Regulars cards on /rewards,
// through sign-in when they are signed out. It checks NOBODY in: a check-in needs the Space's scanner
// (POST /api/v1/devices/scan) or the door code. A phone tap shows the reader's OWN cards, never the
// card holder's, so a found card reveals nothing about whose it is. A revoked or unknown card says so.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const origin = new URL(request.url).origin
  const to = (path: string) => NextResponse.redirect(new URL(path, origin))
  const signedIn = (await getMyProfileId()) !== null
  const rewards = signedIn ? '/rewards' : `/sign-in?next=${encodeURIComponent('/rewards')}`
  if (!scannerDevicesEnabled()) return to(rewards)
  const token = normalizeCardToken((await params).token)
  if (!token || !(await cardTokenIsLive(sha256Hex(token)))) return to('/code-unavailable')
  return to(rewards)
}

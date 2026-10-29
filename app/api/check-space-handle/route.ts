import { NextResponse } from 'next/server'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'
import { isHandleShape, verdictFor } from '@/lib/create-space/handle'
import { isSpaceSlugTaken } from '@/lib/spaces/store'

// Space handle availability for the signed-out builder on /create-a-space. Anyone may ask, so the answer is ONE word:
// `free`, `taken` or `invalid`, and never whose Space holds a taken handle, whether it is active, or anything else
// about it. The rule is the one createSpace applies: the slug shape (isSafeSlug, plus the builder's own stricter
// shape) and uniqueness across every Space, active or not (isSpaceSlugTaken). A failed read answers 503 with no body
// of substance, never "free". Per-IP rate limited like the member handle check (/api/check-handle), which answers
// for PROFILE handles and not Space slugs.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  if (!(await rateLimitOk('check-space-handle', clientIp(request), 30, '60 s'))) return tooMany()

  const handle = new URL(request.url).searchParams.get('handle')?.trim().toLowerCase() ?? ''
  // The shape is judged before the table is touched, so a malformed handle costs no query.
  if (!isHandleShape(handle)) return NextResponse.json({ status: 'invalid' }, { headers: NO_STORE })

  const verdict = verdictFor(handle, await isSpaceSlugTaken(handle).catch(() => null))
  if (!verdict) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  return NextResponse.json({ status: verdict }, { headers: NO_STORE })
}

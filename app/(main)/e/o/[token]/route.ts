// OPEN TRACKING pixel endpoint (public, no auth, FAIL-SAFE). A Space send's html carries
// `<img src="/e/o/<token>">`; loading it here decodes the token to a send row and logs an 'open' event,
// then ALWAYS returns a 1x1 transparent GIF with no-cache headers. A bad/forged/expired token records
// nothing but STILL returns the gif (never a 4xx that would show a broken image in the recipient's mail).
// Nothing here can throw: recording is best-effort and wrapped, so an email client always gets its pixel.

import { decodeSendToken, recordEmailEvent, resolveSendForTracking } from '@/lib/spaces/email-tracking'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// The smallest transparent GIF (43 bytes).
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

function pixelResponse(): Response {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const { token } = await params
    const sendId = decodeSendToken(token)
    if (sendId) {
      const send = await resolveSendForTracking(sendId)
      if (send) {
        await recordEmailEvent({ spaceId: send.spaceId, sendId, email: send.email, kind: 'open' })
      }
    }
  } catch {
    // FAIL-SAFE: swallow everything — the recipient's mail client must always get the pixel.
  }
  return pixelResponse()
}

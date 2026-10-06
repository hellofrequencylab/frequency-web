import { z } from 'zod'
import { nodeCaptureInput } from '@/lib/contract'
import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { captureNode } from '@/lib/engagement/capture'

// POST /api/v1/nodes/{id}/capture (LIVE-721): a native QR scan, NFC tap or geofence entry lands
// here. Same pipeline the web's claimNode runs (lib/engagement/capture.ts): the server verifies the
// window, the signed code, proximity and capacity, writes the exactly-once ledger row and awards
// zaps. Nothing the device sends is trusted beyond being an input to that check.
//
// NFC: a tag carries an NDEF URI record of the same /n/<id>?s=<code> link a QR carries, so a tag
// and a code are one path (docs/APP-CONTRACT.md). A refusal is still a 200 with `ok: false` and the
// verifier's reason, as on the web: the app shows the reason, it is not an error.

export const dynamic = 'force-dynamic'

const nodeId = z.uuid()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'node-capture', { limit: 60, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(nodeId, (await params).id)
    const body = readInput(nodeCaptureInput, (await request.json().catch(() => ({}))) ?? {})
    const result = await captureNode({
      nodeId: id,
      actorProfileId: auth.caller.id,
      location: body.location ?? null,
      presentedSecret: body.secret ?? null,
    })
    return ok({
      ok: result.ok,
      reason: result.reason ?? null,
      zapsAwarded: result.zapsAwarded ?? null,
      offerTitle: result.offerTitle ?? null,
    })
  } catch (e) {
    return failFrom(e)
  }
}

import { listOperatedSpaces } from './operated'
import { ensureCheckinNode } from './checkin'
import { signedNodeUrl } from '@/lib/qr/node-code'

// THE DOOR LINKS OF EVERY SPACE A PERSON RUNS (LIVE-1115). The app's NFC tag writer asks "which
// check-in link do I put on this tag?". Each answer is the same signed `/n/<nodeId>?s=<code>` link
// the Space's check-in settings print as a QR (app/(main)/spaces/[slug]/settings/checkin/section.tsx),
// built the same way: ensureCheckinNode (owner-gated create-or-get, idempotent) then signedNodeUrl.
//
// Must run as the caller (asCaller on /api/v1): ensureCheckinNode re-derives the gate from the
// session, so a Space the caller does not edit yields null and is skipped. FAIL-SAFE to [].

interface CheckinLink {
  spaceId: string
  spaceSlug: string
  spaceName: string
  nodeId: string
  url: string
}

/** More than any one operator runs today; bounds the node work one request can cause. */
const MAX_SPACES = 25

export async function listMyCheckinLinks(profileId: string): Promise<CheckinLink[]> {
  try {
    const spaces = (await listOperatedSpaces(profileId)).slice(0, MAX_SPACES)
    const links = await Promise.all(
      spaces.map(async (s): Promise<CheckinLink | null> => {
        const node = await ensureCheckinNode(s.id)
        if (!node) return null
        return { spaceId: s.id, spaceSlug: s.slug, spaceName: s.name, nodeId: node.id, url: signedNodeUrl(node.id) }
      }),
    )
    return links.filter((l): l is CheckinLink => l !== null)
  } catch {
    return []
  }
}

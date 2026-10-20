'use server'

// SPACE CHECK-IN TAG actions for the CyberUnicorn console (LIVE-1182, docs/LOYALTY.md "Check-in tags").
// Staff only: every call runs behind consoleStaffGate (lib/devices/store.ts) or ensureCheckinNodeForStaff.
// The flow: startSpaceTag returns the Space's signed door link, the console writes it with
// `frequency.write_tag`, then finishSpaceTag records the chip it read back.

import { type ActionResult, ok, fail } from '@/lib/action-result'
import { ensureCheckinNodeForStaff } from '@/lib/spaces/checkin'
import { signedPlacardUrl } from '@/lib/qr/node-code'
import { normalizeUid } from './credentials'
import { latestCheckinSince, listSpaceTags, recordSpaceTag, removeSpaceTag, type SpaceTagRow } from './space-tags'

const LABEL_MAX = 60

/** The link to write: the Space's signed door check-in link (the node is made if the Space has none). */
export async function startSpaceTag(spaceId: unknown): Promise<ActionResult<{ nodeId: string; url: string }>> {
  if (typeof spaceId !== 'string' || !spaceId) return fail('Choose a Space first.')
  const node = await ensureCheckinNodeForStaff(spaceId)
  if (!node) return fail('Could not get that Space’s check-in link. Only Frequency staff can write Space tags.')
  try {
    // The placard link carries `m=nfc`, so Scan stats count placard taps apart from QR scans.
    return ok({ nodeId: node.id, url: signedPlacardUrl(node.id) })
  } catch {
    return fail('Could not sign that Space’s check-in link. Try again.')
  }
}

/** The tag is written: put it on the Space's list. */
export async function finishSpaceTag(
  spaceId: unknown,
  nodeId: unknown,
  rawUid: unknown,
  rawType: unknown,
  rawLabel: unknown,
): Promise<ActionResult> {
  if (typeof spaceId !== 'string' || typeof nodeId !== 'string') return fail('The tag was written but could not be listed.')
  const label = (typeof rawLabel === 'string' ? rawLabel.trim() : '').slice(0, LABEL_MAX)
  const chipType = typeof rawType === 'string' && rawType.trim() ? rawType.trim().slice(0, 40) : null
  const saved = await recordSpaceTag({ spaceId, nodeId, uid: normalizeUid(rawUid), chipType, label })
  return saved ? ok() : fail('The tag works, but it could not be added to the list.')
}

/** The Space's tags, for the console after a Space is chosen. */
export async function readSpaceTags(spaceId: unknown): Promise<ActionResult<SpaceTagRow[]>> {
  if (typeof spaceId !== 'string' || !spaceId) return ok([])
  return ok(await listSpaceTags(spaceId))
}

/** Take a tag off the list. */
export async function dropSpaceTag(tagId: unknown): Promise<ActionResult> {
  if (typeof tagId !== 'string' || !(await removeSpaceTag(tagId))) return fail('Could not remove that tag.')
  return ok()
}

/** Has anyone checked in on this Space's door link since the placard was written? Polled by the
 *  console's "tap it with your phone" step. */
export async function checkPlacardTap(nodeId: unknown, sinceIso: unknown): Promise<ActionResult<{ name: string; at: string; count: number } | null>> {
  if (typeof nodeId !== 'string' || typeof sinceIso !== 'string' || !Number.isFinite(Date.parse(sinceIso))) return ok(null)
  return ok(await latestCheckinSince(nodeId, new Date(Date.parse(sinceIso)).toISOString()))
}

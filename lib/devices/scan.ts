// COUNTER SCANNERS: one card scan (LIVE-1125, docs/LOYALTY.md "Counter scanners"). Device → Space →
// member → the Space's check-in node → captureNode, so a card at the counter runs EXACTLY what the
// member's phone runs at the door code: verification, the exactly-once ledger, the Regulars stamp and
// its Zaps, hunts and the CRM timeline (lib/engagement/capture.ts). Nothing here re-implements any of it.
//
// The device is the witness: it is standing at its own Space, so the scan presents a code this server
// signs on the spot for the Space's node (signNodeCode) and the Space's own pin as the location, which
// clears the node's geofence when the owner turned one on. A card works only at the Space that issued
// it (space_id) or everywhere (space_id null). A chip UID is bound on the first scan; after that a
// token presented on a different chip, or with no UID, is refused.
//
// Member cards (LIVE-1282, docs/LOYALTY.md "Member cards"): a paused face refuses the check-in
// (`card_paused`): the holder's own face, or the Space's face for a card registered to a Space. A check-in
// answers with a greeting line, and a numbered member card at a Space that set a cardholder perk also
// gets the perk line. Both are optional fields on the wire, so an older firmware reads the reply as before.

import { captureNode } from '@/lib/engagement/capture'
import { readCheckinNode } from '@/lib/spaces/checkin'
import { signNodeCode } from '@/lib/qr/node-code'
import { readMemberFace, readSpaceFace } from '@/lib/member-cards/store'
import { hashUid, sha256Hex } from './credentials'
import {
  bindCardUid,
  findActiveCard,
  readMemberName,
  readSpacePin,
  touchCard,
  type ScannerDevice,
} from './store'

/** Why a scan did not check the member in. The capture verifier's reasons pass through unchanged. */
type ScanReason =
  | 'unknown_card'
  | 'card_mismatch'
  | 'card_paused'
  | 'checkin_not_set_up'
  | 'already_captured'
  | 'unknown_node'
  | 'inactive'
  | 'not_yet_valid'
  | 'expired'
  | 'bad_signature'
  | 'location_required'
  | 'too_far'
  | 'capacity_reached'

/** The device's reply, exactly as POST /api/v1/devices/scan sends it (docs/LOYALTY.md). Fields are only
 *  ever ADDED, and optional, so a board on older firmware keeps working. */
interface ScanReply {
  ok: boolean
  reason?: ScanReason
  member: { display_name: string } | null
  zapsAwarded: number
  loyalty: { stamps: number; required: number; earned: boolean; reward_code?: string } | null
  /** On a check-in: "Welcome back, Maya". */
  greeting?: string
  /** On a check-in with a numbered member card at a Space that set a cardholder perk:
   *  "Cardholder perk: free oat milk upgrade". */
  perk?: string
}

/** The greeting line a check-in shows at the counter. */
export function greetingFor(name: string): string {
  return name && name !== 'Member' ? `Welcome back, ${name}` : 'Welcome back'
}

/** The perk line, or null when the Space set none. */
export function perkLine(perk: string | null): string | null {
  const p = perk?.trim()
  return p ? `Cardholder perk: ${p}` : null
}

export async function scanCard(device: ScannerDevice, input: { cardToken: string; uid: string | null }): Promise<ScanReply> {
  const refuse = (reason: ScanReason, member: ScanReply['member'] = null): ScanReply => ({
    ok: false,
    reason,
    member,
    zapsAwarded: 0,
    loyalty: null,
  })

  const card = await findActiveCard(sha256Hex(input.cardToken))
  if (!card || (card.spaceId !== null && card.spaceId !== device.spaceId)) return refuse('unknown_card')

  // The chip check. First scan with a UID binds it; once bound, the UID must match.
  if (card.uidHash) {
    if (!input.uid || hashUid(input.uid) !== card.uidHash) return refuse('card_mismatch')
  } else if (input.uid) {
    await bindCardUid(card.id, hashUid(input.uid))
  }

  const name = await readMemberName(card.profileId)
  const member = { display_name: name }

  // A Space card answers to its Space's face, every other card to its holder's. Paused stops it here.
  const face = card.faceSpaceId ? await readSpaceFace(card.faceSpaceId) : await readMemberFace(card.profileId)
  if (face.paused) return refuse('card_paused', member)

  const node = await readCheckinNode(device.spaceId)
  if (!node) return refuse('checkin_not_set_up', member)

  const result = await captureNode({
    nodeId: node.id,
    actorProfileId: card.profileId,
    presentedSecret: signNodeCode(node.id),
    location: await readSpacePin(device.spaceId),
    medium: 'device',
  })
  await touchCard(card.id)

  if (!result.ok) return refuse((result.reason ?? 'unknown_node') as ScanReason, member)
  const l = result.loyalty ?? null
  // The perk is for a numbered member card, not a Space's own team card.
  const perk = card.cardNumber !== null && !card.faceSpaceId ? perkLine((await readSpaceFace(device.spaceId)).cardholderPerk) : null
  return {
    ok: true,
    member,
    zapsAwarded: result.zapsAwarded ?? 0,
    loyalty: l
      ? {
          stamps: l.stamps,
          required: l.required,
          earned: l.earnedCode !== null,
          ...(l.earnedCode ? { reward_code: l.earnedCode } : {}),
        }
      : null,
    greeting: greetingFor(name),
    ...(perk ? { perk } : {}),
  }
}

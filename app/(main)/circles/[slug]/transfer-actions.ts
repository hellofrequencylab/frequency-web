'use server'

// MOVE A CIRCLE, FROM THE CIRCLE'S OWN PAGE. The transfer engine (lib/circles/transfer.ts,
// ADR-843) shipped with one door only: the SPACE side. A Space console can push one of its
// circles out (app/(main)/spaces/[slug]/circles/actions.ts), and can pull one in. From a Circle's
// own admin rail there was no way to move it anywhere, so a host who also runs a Space had no
// path from the circle they were looking at to the Space they wanted it in. This is that door.
//
// IT ADDS NO RULES. Every decision stays where it already lives:
//   * canTransferCircle / transferCircle  — authority on BOTH sides, plus the membership-tier PIN.
//   * listManagedSpaces                   — which Spaces this caller may steward.
//   * getCircleCapabilities               — whether this caller may manage THIS circle.
// The picker is BUILT FROM listManagedSpaces, the same contract listTransferTargetsAction keeps:
// a destination the gate would refuse is never offered, so the control cannot show a door that
// does not open. The write re-derives the same list before it calls the engine, so a hand-posted
// space id is refused in plain words rather than reaching the gate as a surprise.
//
// 🔴 EVERY EXPORT RETURNS A RESULT AND NEVER THROWS. A thrown server-action error arrives in the
// browser as an opaque digest with no message, which is exactly how the Circle invite link became
// a silent no-op (#2112). A refusal here is DATA: the gate's own sentence, carried verbatim to the
// surface that asked, because that copy (TIER_LINKED especially) is written for a member to read
// and tells them what to do next.
//
// THE HANDOFF HALF (ADR-845) lives here too, for the same reason and with the same discipline.
// ADR-1024 booked it: `offerCircleToPerson` and `cancelCircleOffer` were Space-console-only, so the
// host of a PERSONAL circle — one on the root sentinel, which appears in no Space console — could
// not hand it to anyone, while help/leading/how-to-start-a-circle.md told them they could.
//
// Handing a circle to someone ELSE is not a move: a circle carries members, so it is an OFFER the
// recipient answers, and NOTHING changes until they do. The recipient's side already exists
// (CircleHandoffBanner on the circle page). This is the sender's side.
//
// A PENDING OFFER BLOCKS THE CIRCLE. One pending offer per circle is a unique partial index
// (migration 20261230000000), and moveCircleToSpaceAction's own refusal tells the operator to
// "cancel that first" — so the read below reports the open offer and the module lets its sender
// take it back. Without that, a host could strand their own circle with no way out.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { loadCircleShell, spaceIdForCircle } from '@/lib/circles/store'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { listManagedSpaces } from '@/lib/spaces/managed'
import { tierLinksForCircle } from '@/lib/spaces/tier-circle'
import { transferCircle, TIER_LINKED } from '@/lib/circles/transfer'
import {
  offerCircleToPerson,
  cancelCircleOffer,
  pendingOfferForCircle,
} from '@/lib/circles/handoff'
import { ok, fail, type ActionResult } from '@/lib/action-result'

/** One destination the picker may offer. */
export interface CircleMoveSpace {
  id: string
  name: string
  slug: string
}

/** What the move control needs to draw itself, once, on open. */
export interface CircleMoveData {
  circleId: string
  slug: string
  name: string
  /** Active members who travel with it. Named in the confirm step so nothing is a surprise. */
  memberCount: number
  /** The Space that owns it today, or null when it is the host's own circle. */
  currentSpace: { id: string; name: string } | null
  /** Spaces this caller helps run, minus the one it already lives in. Never the root Space. */
  targets: CircleMoveSpace[]
  /** Set when the move is ALREADY refused before anyone picks, so the refusal is shown up front
   *  instead of after a failed submit. The gate's own sentence, verbatim. */
  blockedReason: string | null
  /** An unanswered handoff on this circle. While it stands the circle can go nowhere else — the
   *  unique partial index refuses a second pending offer and the move refuses too — so the control
   *  shows it BEFORE either picker and offers the only move that is actually available: take it
   *  back. `toName` is who it is waiting on. */
  pendingOffer: { id: string; toName: string } | null
}

/** Said when the tier-link read misses. "We could not tell" must never read as "no links"
 *  (lib/spaces/tier-circle.ts), so the control blocks and says so rather than offering a move the
 *  write is going to refuse anyway. */
const CANNOT_CHECK = 'We could not check this circle right now. Try again in a moment.'
/** The same sentence lib/circles/transfer.ts refuses a foreign destination with, so the shaping
 *  layer and the gate speak with one voice. */
const NOT_YOURS_TO_TAKE = 'You can only move a circle into a space you help run.'

/** Both surfaces a Space shows its circles and their events on. */
function revalidateSpace(slug: string) {
  revalidatePath(`/spaces/${slug}`)
  revalidatePath(`/spaces/${slug}/circles`)
}

/**
 * The one authority check every write here shares: a signed-in caller who may manage THIS circle.
 * Same shape as the Space console's `requireSpaceEditor` — a string back is the refusal to return
 * verbatim. It is not the gate: `transferCircle` / `canOfferCircle` still decide. It is what keeps
 * a caller with no business here from reaching them at all, and it takes the refusal sentence as an
 * argument so each door says what it is refusing ("move it" / "hand it off").
 */
async function authorise(
  slug: string,
  refusal: string,
): Promise<{ profileId: string; circleId: string } | string> {
  const profileId = await getMyProfileId().catch(() => null)
  if (!profileId) return 'Sign in first.'

  const shell = await loadCircleShell(slug)
  if (!shell) return 'Circle not found.'

  const caps = await getCircleCapabilities(shell.circle.id)
  if (!caps.has('circle.editSettings')) return refusal
  return { profileId, circleId: shell.circle.id }
}

/** The circle's own page, plus the Space console that also lists it (its "Handoff waiting" badge
 *  and its move control both read this state). */
async function revalidateCircleAndHome(slug: string, circleId: string) {
  revalidatePath(`/circles/${slug}`)
  const [spaceId, root] = await Promise.all([spaceIdForCircle(circleId), loadRootSpaceId()])
  if (spaceId && spaceId !== root) {
    const home = await getSpaceById(spaceId)
    if (home) revalidateSpace(home.slug)
  }
}

/**
 * Read the move control's whole state for a circle, or null for anyone who may not manage it
 * (so the module renders no chrome at all for a member). FAIL-SAFE: null on any read error.
 */
export async function getCircleMoveData(slug: string): Promise<CircleMoveData | null> {
  try {
    const shell = await loadCircleShell(slug)
    if (!shell) return null
    const circle = shell.circle

    const caps = await getCircleCapabilities(circle.id)
    if (!caps.has('circle.editSettings')) return null

    const [spaceId, root, managed, links, offer] = await Promise.all([
      spaceIdForCircle(circle.id),
      loadRootSpaceId(),
      listManagedSpaces(),
      tierLinksForCircle(circle.id),
      pendingOfferForCircle(circle.id),
    ])
    // The root Space means "no Space owns this" — a member's own circle (ADR-843).
    const currentSpaceId = spaceId && spaceId !== root ? spaceId : null
    const current = currentSpaceId ? await getSpaceById(currentSpaceId) : null

    return {
      circleId: circle.id,
      slug: circle.slug,
      name: circle.name,
      memberCount: circle.member_count ?? 0,
      currentSpace: current
        ? { id: current.id, name: current.brandName?.trim() || current.name }
        : null,
      // listManagedSpaces is already scoped to THIS caller (owner, or active editor+), so the
      // picker can only ever offer destinations the transfer gate will accept.
      targets: managed
        .filter((s) => s.type !== 'root' && s.id !== currentSpaceId)
        .map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
      blockedReason: !links.ok
        ? CANNOT_CHECK
        : links.tiers.length > 0
          ? TIER_LINKED
          : null,
      // pendingOfferForCircle carries the RECIPIENT's display name in `fromName` on purpose
      // (lib/circles/handoff.ts): for the sender's view the useful name is who is being waited on.
      pendingOffer: offer ? { id: offer.id, toName: offer.fromName } : null,
    }
  } catch {
    return null
  }
}

/**
 * Move this circle into one of the caller's Spaces. Its members and its events go with it: the
 * engine restamps every circle-scoped event onto the destination's calendar (ADR-857).
 *
 * Returns the gate's refusal verbatim when it refuses, and revalidates the circle plus BOTH
 * Spaces — the destination gained the circle and its events, the source lost them.
 */
export async function moveCircleToSpaceAction(
  slug: string,
  spaceId: string,
): Promise<ActionResult<{ spaceSlug: string }>> {
  try {
    const gate = await authorise(slug, 'Only the team that runs this circle can move it.')
    if (typeof gate === 'string') return fail(gate)
    if (!spaceId) return fail('Pick where it should go.')

    // The picker's shaping rule, re-derived on the write: the destination must be one of the
    // caller's own Spaces. The gate decides this again inside transferCircle, so this is not the
    // authority — it is what turns a hand-posted space id into a plain sentence instead of a
    // round trip that ends in the engine's generic refusal.
    const managed = await listManagedSpaces()
    const destination = managed.find((s) => s.id === spaceId && s.type !== 'root')
    if (!destination) return fail(NOT_YOURS_TO_TAKE)

    const fromSpaceId = await spaceIdForCircle(gate.circleId)

    const res = await transferCircle(gate.circleId, { kind: 'space', spaceId }, gate.profileId)
    if (!res.ok) return fail(res.reason || 'Could not move that circle.')

    revalidatePath(`/circles/${res.slug ?? slug}`)
    revalidateSpace(destination.slug)
    const root = await loadRootSpaceId()
    if (fromSpaceId && fromSpaceId !== root) {
      const from = await getSpaceById(fromSpaceId)
      if (from) revalidateSpace(from.slug)
    }
    return ok({ spaceSlug: destination.slug })
  } catch {
    return fail('Could not move that circle. Please try again.')
  }
}

/**
 * Offer this circle to another person. NOTHING changes on the circle: it keeps its owner, its
 * members and any Run until they accept, which is why this is an offer and not the move above.
 *
 * Every rule stays in `offerCircleToPerson` / `canOfferCircle` (ADR-845), including the two this
 * layer must not second-guess: offering it to YOURSELF is refused, because taking your own circle
 * is the immediate move, and a circle a membership tier points at is pinned. The gate's sentence
 * comes back verbatim, since it is written for a member to read and says what to do next.
 */
export async function offerCircleToPersonAction(
  slug: string,
  toProfileId: string,
): Promise<ActionResult<void>> {
  try {
    const gate = await authorise(slug, 'Only the team that runs this circle can hand it off.')
    if (typeof gate === 'string') return fail(gate)
    if (!toProfileId) return fail('Pick who should get it.')

    const res = await offerCircleToPerson(gate.circleId, toProfileId, gate.profileId)
    if (!res.ok) return fail(res.reason || 'Could not send that handoff.')

    await revalidateCircleAndHome(slug, gate.circleId)
    return ok()
  } catch {
    return fail('Could not send that handoff. Please try again.')
  }
}

/**
 * Take back an unanswered handoff. This is the way OUT of the block: while an offer is pending the
 * unique partial index refuses a second one and the move refuses too, so without this door a host
 * could strand their own circle. Authority is the same on both sides of the offer, so the same
 * check that let them send it lets them withdraw it.
 */
export async function cancelCircleOfferAction(
  slug: string,
  offerId: string,
): Promise<ActionResult<void>> {
  try {
    const gate = await authorise(slug, 'Only the team that runs this circle can hand it off.')
    if (typeof gate === 'string') return fail(gate)
    if (!offerId) return fail('That handoff is no longer available.')

    const res = await cancelCircleOffer(offerId, gate.profileId)
    if (!res.ok) return fail(res.reason || 'Could not cancel that handoff.')

    await revalidateCircleAndHome(slug, gate.circleId)
    return ok()
  } catch {
    return fail('Could not cancel that handoff. Please try again.')
  }
}

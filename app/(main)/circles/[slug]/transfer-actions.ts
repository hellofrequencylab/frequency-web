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

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { loadCircleShell, spaceIdForCircle } from '@/lib/circles/store'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { listManagedSpaces } from '@/lib/spaces/managed'
import { tierLinksForCircle } from '@/lib/spaces/tier-circle'
import { transferCircle, TIER_LINKED } from '@/lib/circles/transfer'
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

    const [spaceId, root, managed, links] = await Promise.all([
      spaceIdForCircle(circle.id),
      loadRootSpaceId(),
      listManagedSpaces(),
      tierLinksForCircle(circle.id),
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
    const profileId = await getMyProfileId().catch(() => null)
    if (!profileId) return fail('Sign in first.')
    if (!spaceId) return fail('Pick where it should go.')

    const shell = await loadCircleShell(slug)
    if (!shell) return fail('Circle not found.')
    const circle = shell.circle

    const caps = await getCircleCapabilities(circle.id)
    if (!caps.has('circle.editSettings')) {
      return fail('Only the team that runs this circle can move it.')
    }

    // The picker's shaping rule, re-derived on the write: the destination must be one of the
    // caller's own Spaces. The gate decides this again inside transferCircle, so this is not the
    // authority — it is what turns a hand-posted space id into a plain sentence instead of a
    // round trip that ends in the engine's generic refusal.
    const managed = await listManagedSpaces()
    const destination = managed.find((s) => s.id === spaceId && s.type !== 'root')
    if (!destination) return fail(NOT_YOURS_TO_TAKE)

    const fromSpaceId = await spaceIdForCircle(circle.id)

    const res = await transferCircle(circle.id, { kind: 'space', spaceId }, profileId)
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

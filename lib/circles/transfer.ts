import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformStaff } from '@/lib/auth'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { tierLinksForCircle } from '@/lib/spaces/tier-circle'

// CIRCLE OWNERSHIP TRANSFER (ADR-843): move a Circle between Spaces, or out of a Space to a
// person. A Circle's ownership is two fields, and a transfer is a coherent move of both:
//   * circles.space_id — the Space that owns it. The ROOT space means "no Space owns this", i.e.
//     a member's own Circle. So "to a person" is not a special case, it is a move to root.
//   * circles.host_id  — the person who runs it day to day. It travels only on a move to a
//     person, because a Space Circle keeps whoever is already hosting it.
//
// AUTHORITY ON BOTH SIDES. The actor must hold authority over the source (the Space that owns it
// today, or the host for a personal Circle) AND over the destination (a Space they steward, or
// themselves). That is deliberate: a Circle carries members, so it can be MOVED between places
// the actor already runs, but it cannot be pushed onto a third party who never agreed to it.
// Handing a Circle to someone else needs an acceptance flow, which is recorded as a deferral in
// ADR-843 rather than faked here.
//
// The pure decision is split from the IO so it unit-tests without a database, matching
// lib/events/host-gate.ts (ADR-841) and lib/journeys/run-gate.ts (ADR-842).

/** Where a Circle is headed. `kind: 'space'` moves it under a Space; `kind: 'person'` makes it
 *  that member's own Circle (space_id = root, host_id = them). */
export type TransferTarget =
  | { kind: 'space'; spaceId: string }
  | { kind: 'person'; profileId: string }

/** The facts the pure gate decides over. */
export interface TransferGateFacts {
  /** The signed-in caller's profile id (null = anonymous). */
  viewerProfileId: string | null
  /** Does the viewer steward the Space that owns the Circle today? False for a personal Circle. */
  sourceSpaceCanEdit: boolean
  /** circles.host_id as it stands now. */
  currentHostId: string | null
  /** Does the viewer steward the DESTINATION Space? Only meaningful for a space target. */
  targetSpaceCanEdit: boolean
  /** The destination, so the gate can tell a move-to-self from a hand-off. */
  target: TransferTarget
  /** Platform staff on the STAFF axis (web_role admin/janitor), preview-aware. */
  staff: boolean
  /** How many membership tiers currently point at this Circle
   *  (space_membership_tiers.circle_id). Anything above zero LOCKS the move — see TIER_LINKED. */
  linkedTierCount: number
}

export interface TransferDecision {
  allowed: boolean
  /** Why not, in plain member-facing copy. Empty when allowed. */
  reason: string
}

const NOT_SIGNED_IN = 'Sign in first.'
const NOT_YOURS = 'Only the team that owns this circle can move it.'
const NOT_THEIRS = 'You can only move a circle into a space you help run.'
const NEEDS_ACCEPTANCE =
  'You can move a circle to a space you run, or take it as your own. Handing it to someone else is not available yet.'
export const TIER_LINKED =
  'This circle is linked to a membership tier. Unlink it in the space membership settings first, then move it.'

/**
 * May this viewer move this Circle to this destination? PURE.
 *
 * Source authority: the Space's team for a Space Circle, the host for a personal one, or staff.
 * Destination authority: the viewer must steward the target Space, or the target person must BE
 * the viewer. Staff pass both sides. Anonymous never passes, staff flag or not.
 *
 * THE TIER LOCK sits ABOVE all of that, staff included, because it is not an authority question.
 * A Space links a membership tier to one of its circles (space_membership_tiers.circle_id) and the
 * billing lifecycle then mints provenance-stamped `memberships` rows into it forever
 * (lib/spaces/tier-circle.ts). Move the circle out and the link survives the move: the old Space
 * keeps granting paid members a seat on a roster that now belongs to somebody else. That is a
 * cross-tenant membership leak, so the linked circle is PINNED until an operator unlinks it.
 *
 * WHY PIN RATHER THAN UNLINK-ON-TRANSFER. Auto-unlinking would make a transfer silently revoke the
 * circle access every paying member of that tier bought, as a side effect of an ownership edit
 * nobody framed as a billing change; it would also split one invariant across two writes, and a
 * failure between them recreates exactly this leak. Refusing costs the operator one deliberate
 * click in the surface that owns the commercial consequence, and it keeps the invariant a single
 * fact instead of a two-step dance.
 */
export function canTransferCircle(facts: TransferGateFacts): TransferDecision {
  if (!facts.viewerProfileId) return { allowed: false, reason: NOT_SIGNED_IN }
  if (facts.linkedTierCount > 0) return { allowed: false, reason: TIER_LINKED }
  if (facts.staff) return { allowed: true, reason: '' }

  const ownsSource =
    facts.sourceSpaceCanEdit ||
    (!!facts.currentHostId && facts.currentHostId === facts.viewerProfileId)
  if (!ownsSource) return { allowed: false, reason: NOT_YOURS }

  if (facts.target.kind === 'space') {
    if (!facts.targetSpaceCanEdit) return { allowed: false, reason: NOT_THEIRS }
    return { allowed: true, reason: '' }
  }
  // To a person: only to yourself. Giving it away needs the other side to accept.
  if (facts.target.profileId !== facts.viewerProfileId) {
    return { allowed: false, reason: NEEDS_ACCEPTANCE }
  }
  return { allowed: true, reason: '' }
}

/** What the transfer wrote, for the caller's confirmation copy. */
export interface TransferResult {
  ok: boolean
  reason: string
  /** The Circle's slug, for revalidation. */
  slug: string | null
}

/**
 * IO front door: resolve both sides, decide, then write. FAIL-CLOSED on a missing Circle, a
 * missing destination, or any read error.
 *
 * Active Runs are deliberately LEFT RUNNING. A Run's members are mid-program, and ending one
 * because the Circle changed hands would destroy progress the move never asked to touch. The
 * Run's Journey may now belong to a different Space than the Circle does, which is honest: the
 * Circle took its history with it.
 */
export async function transferCircle(
  circleId: string,
  target: TransferTarget,
  viewerProfileId: string | null,
): Promise<TransferResult> {
  if (!circleId || !viewerProfileId) return { ok: false, reason: NOT_SIGNED_IN, slug: null }
  try {
    const admin = createAdminClient()
    const { data: circle } = await admin
      .from('circles')
      .select('id, slug, host_id, space_id')
      .eq('id', circleId)
      .maybeSingle()
    if (!circle) return { ok: false, reason: 'Circle not found.', slug: null }

    const root = await loadRootSpaceId()
    const sourceSpaceId = circle.space_id && circle.space_id !== root ? circle.space_id : null

    // Source side.
    let sourceSpaceCanEdit = false
    if (sourceSpaceId) {
      const space = await getSpaceById(sourceSpaceId)
      const caps = await getSpaceCapabilities(space, viewerProfileId)
      sourceSpaceCanEdit = caps.canEditProfile
    }

    // Destination side, plus the validation that it exists at all.
    let targetSpaceCanEdit = false
    if (target.kind === 'space') {
      if (target.spaceId === sourceSpaceId) {
        return { ok: false, reason: 'That circle already lives there.', slug: circle.slug }
      }
      const space = await getSpaceById(target.spaceId)
      if (!space) return { ok: false, reason: 'We could not find that space.', slug: circle.slug }
      const caps = await getSpaceCapabilities(space, viewerProfileId)
      targetSpaceCanEdit = caps.canEditProfile
    } else {
      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('id', target.profileId)
        .maybeSingle()
      if (!profile) return { ok: false, reason: 'We could not find that person.', slug: circle.slug }
      if (!sourceSpaceId && circle.host_id === target.profileId) {
        return { ok: false, reason: 'That circle is already theirs.', slug: circle.slug }
      }
    }

    // The tier lock's one fact. A read MISS is fatal, not permissive: "we could not tell" must
    // never resolve to "no links", or a transient error reopens the leak the gate exists to close.
    const links = await tierLinksForCircle(circleId)
    if (!links.ok) {
      return { ok: false, reason: 'Could not move that circle. Please try again.', slug: circle.slug }
    }

    const staff = await isPlatformStaff().catch(() => false)
    const decision = canTransferCircle({
      viewerProfileId,
      sourceSpaceCanEdit,
      currentHostId: circle.host_id ?? null,
      targetSpaceCanEdit,
      target,
      staff,
      linkedTierCount: links.tiers.length,
    })
    if (!decision.allowed) return { ok: false, reason: decision.reason, slug: circle.slug }

    // The write. A move to a Space changes only where it lives; a move to a person also hands
    // over the host seat, because a personal Circle with nobody hosting it has no one in charge.
    const patch =
      target.kind === 'space'
        ? { space_id: target.spaceId }
        : { space_id: root, host_id: target.profileId }

    const { error } = await admin.from('circles').update(patch).eq('id', circleId)
    if (error) {
      console.error('[circle-transfer] write failed', { code: error.code, circleId, target })
      return { ok: false, reason: 'Could not move that circle. Please try again.', slug: circle.slug }
    }

    // The circle's EVENTS travel with it (ADR-857): every circle-scoped event carries
    // events.space_id derived from the owning Space, which is what places it on that Space's
    // calendar. Restamp them to the destination (root on a move to a person) or the old owner's
    // calendar keeps showing — and gating, under space isolation — a circle it no longer owns.
    // Best-effort: the ownership move above is the authoritative write and has already succeeded.
    const eventSpaceId = target.kind === 'space' ? target.spaceId : root
    if (eventSpaceId) {
      const { error: restampErr } = await admin
        .from('events')
        .update({ space_id: eventSpaceId } as never)
        .eq('scope_type', 'circle')
        .eq('scope_id', circleId)
      if (restampErr) {
        console.error('[circle-transfer] event restamp failed', { code: restampErr.code, circleId })
      }
    }
    return { ok: true, reason: '', slug: circle.slug }
  } catch {
    return { ok: false, reason: 'Could not move that circle. Please try again.', slug: null }
  }
}

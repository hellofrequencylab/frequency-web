// The member join, as one path (SCAN-774). See joinCircleAsMember.

import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformStaff } from '@/lib/auth'
import { asCircleAccess, canJoinCircle, LISTABLE_CIRCLE_STATUS } from '@/lib/circles/visibility'
import { isSpacePaidMember, isSpaceTeamSeat } from '@/lib/circles/space-entry'
import { processGamificationEvent } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'
import { track } from '@/lib/analytics/track'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/**
 * Join a circle as `myProfileId`. The body of the member-facing join, shared by the joinCircle
 * Server Action (app/(main)/circles/actions.ts) and the /q resolver (app/q/[slug]/route.ts).
 *
 * 🔴 THIS IS NOT A SERVER ACTION, ON PURPOSE (SCAN-774). The exported action used to take an
 * `invited` flag, and a Server Action is a public POST endpoint, so any signed-in client could pass
 * `invited: true` and walk into a closed or paid circle. The flag now lives only on this helper,
 * which no client can reach; the action never passes it, and the /q route passes it only after
 * checking that the code's minter actually holds authority over the circle.
 *
 * 🔴 THIS IS A SERVICE-ROLE PATH BY DESIGN, so RLS guards none of it (ADR-1015). The admin
 * client is used because the `memberships` insert policy only lets crew+ self-join, while an
 * ordinary member joining a circle is the single most common thing in the product — so every rule
 * that would have been a policy has to be written here instead. Capacity was already such a rule.
 * ACCESS (axis 2) is now another, and it is load-bearing: joining WRITES a memberships row, and a
 * memberships row is what `can_enter_circle` reads. Without a gate here, a stranger who learns the
 * id of a closed circle joins it and thereby grants themselves entry — the model would be circular.
 *
 * NOTE which axis this does NOT consult: `unlisted`. Discoverability says nothing about who may
 * join, and a LISTED closed circle is precisely a circle a stranger is meant to find and then be
 * refused until they are invited, buy the tier, or belong to the Space. That refusal is the funnel
 * working, not a bug.
 *
 * `invited` is passed ONLY by a caller that actually holds an invite — the QR route (`/q/[slug]`,
 * once it has verified the code's minter is the Host, a Space steward or staff) is the one such
 * caller today. The invite-link redemption path (`joinViaInviteLink`) writes its own membership
 * row and never comes through here. The argument is required, so a new call site has to say
 * which side of the door it is on.
 */
export async function joinCircleAsMember(
  myProfileId: string,
  circleId: string,
  opts: { invited: boolean },
): Promise<ActionResult<{ joined: boolean }>> {
  const admin = createAdminClient()

  // Check circle capacity + access. `circles.access` is newer than the generated types, so the row
  // is read through the sanctioned untyped seam (ADR-246) and narrowed below.
  const { data: circleRaw } = await (admin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }
      }
    }
  })
    .from('circles')
    .select('member_count, member_cap, hub_id, access, unlisted, space_id, host_id, status')
    .eq('id', circleId)
    .maybeSingle()

  if (!circleRaw) return fail('This circle is no longer available.')
  // SCAN-691: only a LIVE circle (forming or active) takes a join. The page hides Join on a draft,
  // but a stale QR code or a direct call reached this insert for a draft, inactive or archived
  // circle, and the admin client skips RLS, so the status is the gate here.
  if (!(LISTABLE_CIRCLE_STATUS as readonly string[]).includes(String(circleRaw.status))) {
    return fail('This circle is no longer available.')
  }
  const circle = circleRaw as unknown as { member_count: number; member_cap: number; hub_id: string | null }

  // THE ACCESS GATE. Every closed mode has its own door; the default is deny.
  const row = circleRaw as {
    access?: unknown
    unlisted?: unknown
    space_id?: string | null
    host_id?: string | null
  }
  const access = asCircleAccess(row.access)
  if (access !== 'open') {
    const spaceId = row.space_id ?? null
    const [alreadyIn, staff, teamSeat, paidMembership] = await Promise.all([
      admin
        .from('memberships')
        .select('id')
        .eq('circle_id', circleId)
        .eq('profile_id', myProfileId)
        .eq('status', 'active')
        .maybeSingle(),
      isPlatformStaff(),
      // Each Space mode gets ITS OWN lookup, and each is skipped unless this circle is on that
      // mode — a seat opens only 'space_members', a paid membership opens only
      // 'space_paid_members', and neither is a general key to a Space's Circles (OWN-034 ruling C).
      access === 'space_members' && spaceId
        ? isSpaceTeamSeat(admin, spaceId, myProfileId)
        : Promise.resolve(false),
      access === 'space_paid_members' && spaceId
        ? isSpacePaidMember(admin, spaceId, myProfileId)
        : Promise.resolve(false),
    ])

    const verdict = canJoinCircle({
      unlisted: row.unlisted === true,
      access,
      hostId: (row.host_id ?? null) as string | null,
      viewerProfileId: myProfileId,
      isMember: !!alreadyIn.data,
      isSpaceMember: teamSeat,
      isSpacePaidMember: paidMembership,
      // A steward is resolved through the staff arm only here: the operator surfaces that manage a
      // Circle do not route through joinCircle, so paying for a second Space lookup on the join
      // path would buy nothing. FAIL-CLOSED is the right direction for a join.
      isSpaceSteward: false,
      isPlatformStaff: staff,
      invited: opts.invited === true,
    })

    if (!verdict.ok) {
      // ⚠️ ONE refusal string for every closed mode, and it is BYTE-IDENTICAL to the missing-circle
      // copy above. A per-mode message ("buy the membership", "ask for an invite") would confirm
      // that this circle exists and hint at its shape, which for an UNLISTED closed circle is
      // exactly the thing being protected. The join / buy call to action belongs on the circle's
      // own public face, where the viewer has already been allowed to see that it exists.
      return fail('This circle is no longer available.')
    }
  }

  if (circle.member_count >= circle.member_cap) return fail('This circle is full.') // full

  // Nexus capacity only applies when the circle belongs to a hub → nexus. A
  // circle with no hub (a standalone / founding circle) has no nexus cap to
  // enforce, so it falls straight through to the join instead of aborting.
  if (circle.hub_id) {
    const { data: hub } = await admin
      .from('hubs')
      .select('nexus_id')
      .eq('id', circle.hub_id)
      .maybeSingle()

    if (hub?.nexus_id) {
      const { data: nexus } = await admin
        .from('nexuses')
        .select('id, member_cap')
        .eq('id', hub.nexus_id)
        .maybeSingle()

      if (nexus) {
        // Count active memberships across every circle in every hub of this nexus in a
        // SINGLE round-trip via an inner join (memberships → circles → hubs → nexus),
        // instead of the old serial N+1 (fetch hub ids, then circle ids, then count with
        // an unbounded IN(...)). Pre-check only — the F2 trigger is the hard guarantee.
        const { count } = await admin
          .from('memberships')
          .select('id, circles!inner(hubs!inner(nexus_id))', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('circles.hubs.nexus_id', hub.nexus_id)

        if ((count ?? 0) >= nexus.member_cap) return fail('This region is at capacity right now.') // nexus at capacity
      }
    }
  }

  // Use admin client. RLS only permits crew+ to self-join via policy, but new
  // members (role = 'member') should be able to join circles directly.
  // Authorization is enforced above in code (capacity, auth check).
  const { error } = await admin.from('memberships').insert({
    profile_id: myProfileId,
    circle_id: circleId,
    status: 'active',
  })
  if (error) {
    // The DB is the HARD capacity guarantee (enforce_circle_member_cap, migration
    // 20260726000000); the member_count check above is only fast-fail UX, so a join race arrives
    // here as a typed raise. Name it, the way the pre-check already does.
    if (error.code === 'P0001' && (error.message ?? '').includes('circle_full')) {
      return fail('This circle is full.')
    }

    // UNIQUE(profile_id, circle_id): a row for this pair ALREADY EXISTS, so "please try again" was
    // advice that could never work — every retry hits the same constraint, forever. The commonest
    // way in is the plainest one: an active member taps Join on a page that had not caught up yet,
    // and gets told the circle they are standing in refused them. Read the row that beat the
    // insert and finish the job instead (the grantCircleRow shape, lib/spaces/tier-circle.ts).
    if (error.code !== '23505') {
      console.error('[joinCircle] membership insert failed', {
        code: error.code, message: error.message, circleId, profileId: myProfileId,
      })
      return fail('Could not join this circle. Please try again.')
    }

    const settled = await settleExistingMembership(admin, circleId, myProfileId)
    if (settled === 'full') return fail('This circle is full.')
    if (settled === 'error') return fail('Could not join this circle. Please try again.')
    if (settled === 'already_active') {
      // They are already in. Nothing was joined, so nothing is awarded, tracked, or credited a
      // second time; the caller sends them where they asked to go, exactly as the happy path does.
      return ok({ joined: false })
    }
    // 'reactivated' — a dormant row waking up IS a join. Falls through to the rewards below.
  }

  processGamificationEvent({ type: 'circle_join', profileId: myProfileId }).catch(() => {})
  awardGems(myProfileId, 'circle_join').catch(() => {})
  // Activation-funnel step 3 + the engagement funnel's join step (ADR-075). Best-effort.
  await track('circle.joined', { circleId }, myProfileId)

  return ok({ joined: true })
}

/** What the row that beat joinCircle's insert turned out to be, once it was read. */
type MembershipConflict = 'already_active' | 'reactivated' | 'full' | 'error'

/**
 * Settle a UNIQUE(profile_id, circle_id) conflict on the join path. Mirrors grantCircleRow
 * (lib/spaces/tier-circle.ts): an ACTIVE row means the member is already in and there is nothing
 * to do; a dormant row (pending / inactive) is woken up.
 *
 * 🔴 THE CAP IS RE-CHECKED ON THE REACTIVATING UPDATE, and it has to be counted rather than read
 * off circles.member_count (ADR-863). enforce_circle_member_cap is BEFORE INSERT only and counts
 * ACTIVE rows, so flipping a status walks straight past it — while member_count is maintained by
 * an insert/delete trigger and therefore ALREADY counts the dormant row, which is exactly why the
 * pre-check above waved this join through. Two different numbers; the active count is the one the
 * cap means.
 *
 * 2026-09-05 (scan2 L6-13): both sentences above are now history. Migration 20270345000500 makes
 * the cap trigger fire on UPDATE OF status as well as INSERT (locking the circle row, so two dormant
 * members reactivating together serialize), and makes member_count follow status transitions so it
 * counts ACTIVE rows only. The JS count below is still a fast-fail pre-check; the DB is the hard
 * guarantee, and its raise on the update is mapped to 'full' exactly as the insert path maps it.
 *
 * The access gate ran before the insert and does not run again here: it reads active membership
 * (`isMember`), so a dormant row was never a key to a closed circle. Nothing below can widen it.
 */
async function settleExistingMembership(
  admin: ReturnType<typeof createAdminClient>,
  circleId: string,
  profileId: string,
): Promise<MembershipConflict> {
  const { data: existing, error: readError } = await admin
    .from('memberships')
    .select('id, status')
    .eq('circle_id', circleId)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (readError || !existing) {
    console.error('[joinCircle] conflicting membership unreadable', {
      circleId, profileId, message: readError?.message,
    })
    return 'error'
  }
  if (existing.status === 'active') return 'already_active'

  const [{ count }, { data: circle }] = await Promise.all([
    admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('circle_id', circleId)
      .eq('status', 'active'),
    admin.from('circles').select('member_cap').eq('id', circleId).maybeSingle(),
  ])
  const cap = circle?.member_cap ?? null
  if (cap != null && typeof count === 'number' && count >= cap) return 'full'

  const { error: updateError } = await admin
    .from('memberships')
    .update({ status: 'active' })
    .eq('id', existing.id)
  if (updateError) {
    // The DB guard now fires on this update too (20270345000500): a lost race arrives as the same
    // typed raise the insert path names.
    if (updateError.code === 'P0001' && (updateError.message ?? '').includes('circle_full')) return 'full'
    console.error('[joinCircle] membership reactivate failed', {
      code: updateError.code, message: updateError.message, circleId, profileId,
    })
    return 'error'
  }
  return 'reactivated'
}

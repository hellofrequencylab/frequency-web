import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformStaff } from '@/lib/auth'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { tierLinksForCircle } from '@/lib/spaces/tier-circle'

// CIRCLE HANDOFF (ADR-845). The ADR-843 deferral, built: giving a Circle to another PERSON.
//
// Moving a Circle between places the actor already runs stays immediate (lib/circles/transfer.ts),
// because both sides are theirs. Handing one to someone else is different in kind: a Circle carries
// members, so it takes an OFFER the recipient accepts. Nothing about the Circle changes until they
// do, and the actual move then runs through the same transfer write, so there is one place that
// knows how ownership is expressed.
//
// The pure decisions are split from the IO, matching the sibling gates (ADR-841/842/843).

/** Who may offer a Circle away: the same authority that may move it (source side only). */
export interface OfferGateFacts {
  viewerProfileId: string | null
  /** Does the viewer steward the Space that owns the Circle today? False for a personal Circle. */
  sourceSpaceCanEdit: boolean
  /** circles.host_id as it stands now. */
  currentHostId: string | null
  /** The person being offered the Circle. */
  toProfileId: string
  staff: boolean
  /** How many membership tiers currently point at this Circle
   *  (space_membership_tiers.circle_id). Anything above zero LOCKS the handoff — see TIER_LINKED. */
  linkedTierCount: number
}

export interface OfferDecision {
  allowed: boolean
  reason: string
}

const NOT_SIGNED_IN = 'Sign in first.'
const NOT_YOURS = 'Only the team that owns this circle can hand it off.'
const TO_SELF = 'That circle is already yours to run.'
export const TIER_LINKED =
  'This circle is linked to a membership tier. Unlink it in the space membership settings first, then hand it off.'

/**
 * May this viewer OFFER the Circle to that person? PURE. Source authority only: the offer changes
 * nothing on its own, so the destination's agreement is collected by the accept step rather than
 * checked here. Offering to yourself is refused because taking your own circle is the immediate
 * move (transferCircle), not an offer that would sit waiting for you to answer.
 *
 * The TIER LOCK (transfer.ts) applies here too, staff included: an accepted offer runs the same
 * ownership write, so a circle a Space is minting paid-member rows into may not be offered away
 * while the link stands. Refusing at OFFER time is the honest place to say it — the alternative is
 * a recipient who accepts something that then cannot complete.
 */
export function canOfferCircle(facts: OfferGateFacts): OfferDecision {
  if (!facts.viewerProfileId) return { allowed: false, reason: NOT_SIGNED_IN }
  if (facts.toProfileId === facts.viewerProfileId) return { allowed: false, reason: TO_SELF }
  if (facts.linkedTierCount > 0) return { allowed: false, reason: TIER_LINKED }
  if (facts.staff) return { allowed: true, reason: '' }

  const ownsSource =
    facts.sourceSpaceCanEdit ||
    (!!facts.currentHostId && facts.currentHostId === facts.viewerProfileId)
  if (!ownsSource) return { allowed: false, reason: NOT_YOURS }
  return { allowed: true, reason: '' }
}

/** An offer as the surfaces read it. */
export interface CircleOffer {
  id: string
  circleId: string
  circleName: string
  circleSlug: string
  fromProfileId: string
  fromName: string
  toProfileId: string
  status: string
  createdAt: string
}

export interface OfferResult {
  ok: boolean
  reason: string
  circleSlug: string | null
}

/** Resolve the caller's authority over the Circle's current owner side. Shared by offer + cancel. */
async function sourceAuthority(
  circleId: string,
  viewerProfileId: string,
): Promise<{
  circle: { id: string; slug: string; name: string; host_id: string | null; space_id: string | null } | null
  sourceSpaceId: string | null
  sourceSpaceCanEdit: boolean
  staff: boolean
}> {
  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, name, host_id, space_id')
    .eq('id', circleId)
    .maybeSingle()
  if (!circle) return { circle: null, sourceSpaceId: null, sourceSpaceCanEdit: false, staff: false }

  const root = await loadRootSpaceId()
  const sourceSpaceId = circle.space_id && circle.space_id !== root ? circle.space_id : null
  let sourceSpaceCanEdit = false
  if (sourceSpaceId) {
    const space = await getSpaceById(sourceSpaceId)
    const caps = await getSpaceCapabilities(space, viewerProfileId)
    sourceSpaceCanEdit = caps.canEditProfile
  }
  const staff = await isPlatformStaff().catch(() => false)
  return { circle, sourceSpaceId, sourceSpaceCanEdit, staff }
}

/**
 * Offer a Circle to another person. Creates a PENDING row and changes nothing else: the Circle
 * keeps its owner, its members, and any Run until the recipient accepts.
 *
 * The unique partial index on (circle_id) where status='pending' is the race guard, so a
 * double-submit or two stewards acting at once collide in Postgres rather than creating two
 * acceptable offers. A 23505 is reported as the honest "already offered" rather than a failure.
 */
export async function offerCircleToPerson(
  circleId: string,
  toProfileId: string,
  viewerProfileId: string | null,
): Promise<OfferResult> {
  if (!circleId || !viewerProfileId) return { ok: false, reason: NOT_SIGNED_IN, circleSlug: null }
  try {
    const admin = createAdminClient()
    const { circle, sourceSpaceId, sourceSpaceCanEdit, staff } = await sourceAuthority(
      circleId,
      viewerProfileId,
    )
    if (!circle) return { ok: false, reason: 'Circle not found.', circleSlug: null }

    // The tier lock's one fact; a read miss is fatal, never permissive (see transfer.ts).
    const links = await tierLinksForCircle(circleId)
    if (!links.ok) {
      return { ok: false, reason: 'Could not send that handoff. Please try again.', circleSlug: circle.slug }
    }

    const decision = canOfferCircle({
      viewerProfileId,
      sourceSpaceCanEdit,
      currentHostId: circle.host_id ?? null,
      toProfileId,
      staff,
      linkedTierCount: links.tiers.length,
    })
    if (!decision.allowed) return { ok: false, reason: decision.reason, circleSlug: circle.slug }

    const { data: recipient } = await admin
      .from('profiles')
      .select('id')
      .eq('id', toProfileId)
      .maybeSingle()
    if (!recipient) return { ok: false, reason: 'We could not find that person.', circleSlug: circle.slug }

    const { error } = await admin.from('circle_transfer_offers').insert({
      circle_id: circleId,
      from_profile_id: viewerProfileId,
      to_profile_id: toProfileId,
      from_space_id: sourceSpaceId,
      status: 'pending',
    })
    if (error) {
      if (error.code === '23505') {
        return {
          ok: false,
          reason: 'This circle is already offered to someone. Cancel that first.',
          circleSlug: circle.slug,
        }
      }
      console.error('[circle-handoff] offer insert failed', { code: error.code, circleId })
      return { ok: false, reason: 'Could not send that handoff. Please try again.', circleSlug: circle.slug }
    }
    return { ok: true, reason: '', circleSlug: circle.slug }
  } catch {
    return { ok: false, reason: 'Could not send that handoff. Please try again.', circleSlug: null }
  }
}

/** The pending offers waiting on this person, newest first. Their inbox. */
export async function listOffersForRecipient(profileId: string | null): Promise<CircleOffer[]> {
  if (!profileId) return []
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('circle_transfer_offers')
      .select('id, circle_id, from_profile_id, to_profile_id, status, created_at')
      .eq('to_profile_id', profileId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20)
    const rows = data ?? []
    if (!rows.length) return []

    // Two batched lookups rather than a join, matching the house pattern.
    const [{ data: circles }, { data: profiles }] = await Promise.all([
      admin.from('circles').select('id, slug, name').in('id', rows.map((r) => r.circle_id)),
      admin
        .from('profiles')
        .select('id, display_name')
        .in('id', [...new Set(rows.map((r) => r.from_profile_id))]),
    ])
    const circleById = new Map((circles ?? []).map((c) => [c.id, c]))
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]))

    return rows.flatMap((r) => {
      const c = circleById.get(r.circle_id)
      if (!c) return []
      return [
        {
          id: r.id,
          circleId: r.circle_id,
          circleName: c.name,
          circleSlug: c.slug,
          fromProfileId: r.from_profile_id,
          fromName: nameById.get(r.from_profile_id) ?? 'Someone',
          toProfileId: r.to_profile_id,
          status: r.status,
          createdAt: r.created_at,
        },
      ]
    })
  } catch {
    return []
  }
}

/** The pending offer on a Circle, if one is open. Lets a surface show "offered to X, waiting". */
export async function pendingOfferForCircle(circleId: string): Promise<CircleOffer | null> {
  const offers = await listOffersForCircle(circleId)
  return offers[0] ?? null
}

async function listOffersForCircle(circleId: string): Promise<CircleOffer[]> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('circle_transfer_offers')
      .select('id, circle_id, from_profile_id, to_profile_id, status, created_at')
      .eq('circle_id', circleId)
      .eq('status', 'pending')
      .limit(1)
    const rows = data ?? []
    if (!rows.length) return []
    const { data: circle } = await admin
      .from('circles')
      .select('id, slug, name')
      .eq('id', circleId)
      .maybeSingle()
    if (!circle) return []
    const { data: to } = await admin
      .from('profiles')
      .select('id, display_name')
      .eq('id', rows[0].to_profile_id)
      .maybeSingle()
    return [
      {
        id: rows[0].id,
        circleId,
        circleName: circle.name,
        circleSlug: circle.slug,
        fromProfileId: rows[0].from_profile_id,
        // For the sender's view the useful name is the RECIPIENT's, so surface it here.
        fromName: to?.display_name ?? 'someone',
        toProfileId: rows[0].to_profile_id,
        status: rows[0].status,
        createdAt: rows[0].created_at,
      },
    ]
  } catch {
    return []
  }
}

/**
 * Accept an offer: ONLY the recipient may, and the move then runs through the same ownership write
 * the immediate transfer uses (root space + the new host), so there is one definition of what
 * "belongs to a person" means.
 *
 * The status update is CLAIMED first, filtered on `status = 'pending'`, so two clicks or two tabs
 * cannot both proceed to the ownership write. Only the click that actually moved the row continues.
 */
export async function respondToCircleOffer(
  offerId: string,
  action: 'accept' | 'decline',
  viewerProfileId: string | null,
): Promise<OfferResult> {
  if (!offerId || !viewerProfileId) return { ok: false, reason: NOT_SIGNED_IN, circleSlug: null }
  try {
    const admin = createAdminClient()
    const { data: offer } = await admin
      .from('circle_transfer_offers')
      .select('id, circle_id, to_profile_id, status')
      .eq('id', offerId)
      .maybeSingle()
    if (!offer) return { ok: false, reason: 'That handoff is no longer available.', circleSlug: null }
    if (offer.to_profile_id !== viewerProfileId) {
      return { ok: false, reason: 'That handoff was offered to someone else.', circleSlug: null }
    }

    // THE TIER LOCK, re-checked at the moment of the write. canOfferCircle refused a linked circle
    // when the offer was made, but an offer SITS: the sending Space can link the circle to a
    // membership tier in the meantime, and accepting would then hand a live paid-member pipeline to
    // a personal owner. Re-read the fact instead of trusting the one the offer was born with.
    // Checked BEFORE the claim below, so a refusal leaves the offer pending rather than burning it,
    // and only on ACCEPT: declining a locked circle must always work.
    if (action === 'accept') {
      const links = await tierLinksForCircle(offer.circle_id)
      if (!links.ok) {
        return { ok: false, reason: 'Could not finish that handoff. Please try again.', circleSlug: null }
      }
      if (links.tiers.length > 0) {
        return { ok: false, reason: TIER_LINKED, circleSlug: null }
      }
    }

    // Claim it. Zero rows back means someone already answered it.
    const { data: claimed, error: claimErr } = await admin
      .from('circle_transfer_offers')
      .update({
        status: action === 'accept' ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', offerId)
      .eq('status', 'pending')
      .select('id')
    if (claimErr || !(claimed ?? []).length) {
      return { ok: false, reason: 'That handoff has already been answered.', circleSlug: null }
    }

    const { data: circle } = await admin
      .from('circles')
      .select('slug')
      .eq('id', offer.circle_id)
      .maybeSingle()
    if (action === 'decline') return { ok: true, reason: '', circleSlug: circle?.slug ?? null }

    // The ownership write: a personal circle is root-owned with the new person hosting. Same shape
    // as transferCircle's person branch, so the two paths cannot drift on what ownership means.
    const root = await loadRootSpaceId()
    const { error } = await admin
      .from('circles')
      .update({ space_id: root, host_id: viewerProfileId })
      .eq('id', offer.circle_id)
    if (error) {
      console.error('[circle-handoff] accept write failed', { code: error.code, offerId })
      return { ok: false, reason: 'Could not finish that handoff. Please try again.', circleSlug: circle?.slug ?? null }
    }

    // The circle's events travel with it (ADR-857): restamp their placement to root so the old
    // Space's calendar stops carrying a circle it no longer owns. Same shape as transferCircle's
    // restamp; best-effort after the authoritative ownership write.
    if (root) {
      const { error: restampErr } = await admin
        .from('events')
        .update({ space_id: root } as never)
        .eq('scope_type', 'circle')
        .eq('scope_id', offer.circle_id)
      if (restampErr) {
        console.error('[circle-handoff] event restamp failed', { code: restampErr.code, offerId })
      }
    }
    return { ok: true, reason: '', circleSlug: circle?.slug ?? null }
  } catch {
    return { ok: false, reason: 'Could not finish that handoff. Please try again.', circleSlug: null }
  }
}

/** Cancel a pending offer. Only the source side may, resolved the same way offering is. */
export async function cancelCircleOffer(
  offerId: string,
  viewerProfileId: string | null,
): Promise<OfferResult> {
  if (!offerId || !viewerProfileId) return { ok: false, reason: NOT_SIGNED_IN, circleSlug: null }
  try {
    const admin = createAdminClient()
    const { data: offer } = await admin
      .from('circle_transfer_offers')
      .select('id, circle_id, status')
      .eq('id', offerId)
      .maybeSingle()
    if (!offer) return { ok: false, reason: 'That handoff is no longer available.', circleSlug: null }

    const { circle, sourceSpaceCanEdit, staff } = await sourceAuthority(offer.circle_id, viewerProfileId)
    if (!circle) return { ok: false, reason: 'Circle not found.', circleSlug: null }
    const owns =
      staff || sourceSpaceCanEdit || (!!circle.host_id && circle.host_id === viewerProfileId)
    if (!owns) return { ok: false, reason: NOT_YOURS, circleSlug: circle.slug }

    const { data: claimed } = await admin
      .from('circle_transfer_offers')
      .update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('id', offerId)
      .eq('status', 'pending')
      .select('id')
    if (!(claimed ?? []).length) {
      return { ok: false, reason: 'That handoff has already been answered.', circleSlug: circle.slug }
    }
    return { ok: true, reason: '', circleSlug: circle.slug }
  } catch {
    return { ok: false, reason: 'Could not cancel that handoff. Please try again.', circleSlug: null }
  }
}

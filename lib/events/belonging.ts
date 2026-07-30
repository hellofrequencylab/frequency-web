// "Where does this Event belong" — the rules, decided without a database.
//
// An Event carries TWO different kinds of tie, and confusing them is what ADR-883 was about:
//
//   • PLACEMENT — the bare pair `events.scope_type` + `events.scope_id`. This is the event's ONE
//     home, and `scope_id` only names an entity for ONE value of `scope_type`:
//       - 'circle' (and the pre-rename 'group') → scope_id IS a circle id. Linkable.
//       - 'public'                              → scope_id is a shared SENTINEL region uuid that
//                                                 every standalone local event carries. It names
//                                                 no entity a member can open. NEVER a link.
//       - 'standalone'                          → one legacy importer row whose scope_id is a
//                                                 PROFILE id. Also never a link, and never a
//                                                 "belongs to" claim.
//   • ASSOCIATIONS — typed columns: `events.space_id` (the Space it lives under) and
//     `events.journey_id` (the Journey it is part of). Each is either a real id or null.
//
// The edit page shipped the sentinel bug live (it looked up `circles` on scope_id whatever the
// scope_type was, so every public and Space event read as a Circle). This module exists so the
// rule is stated once, tested, and reused rather than re-derived in JSX.

import { CIRCLE_SCOPE_TYPES } from './circle-upcoming'

/** True when `events.scope_type` means "this event's placement names a Circle". */
export function isCircleScope(scopeType: string | null | undefined): boolean {
  return (CIRCLE_SCOPE_TYPES as readonly string[]).includes(scopeType ?? '')
}

/**
 * The Circle id an event's PLACEMENT names, or null when the placement names no entity.
 * A 'public' event's sentinel region and the legacy 'standalone' row's profile id both
 * return null, so neither can ever be resolved as a Circle or rendered as a link.
 */
export function circleScopeId(row: {
  scopeType: string | null | undefined
  scopeId: string | null | undefined
}): string | null {
  if (!isCircleScope(row.scopeType)) return null
  const id = row.scopeId?.trim()
  return id ? id : null
}

/**
 * The Space that HOSTS an event, or null — the billed, displayed, accountable party.
 *
 * `hostSpaceId` (ADR-819, the explicit hosting axis) wins when set. When it is null this falls back
 * to the placement column, which is the PRE-ADR-819 behaviour and must stay: an event created inside
 * a Space's calendar before that migration carries only `space_id`, and its tickets already pay that
 * Space's owner. Changing the fallback would silently re-route money on every legacy row.
 *
 * The root Space is excluded. Every event inherits it (a personal Circle derives it,
 * lib/circles/store.ts spaceIdForCircle), so treating it as a real host labels every event
 * "Frequency" and points the membership-tier + payout lookups at the platform tenant.
 *
 * ⚠️ THIS IS THE HOST, NOT THE VENUE, and it was called `associatedSpaceId` — a name vague enough
 * that the two genuinely different ideas were read as one. Use `venueSpaceId` for placement.
 */
export function hostingSpaceId(
  row: { spaceId: string | null | undefined; hostSpaceId?: string | null | undefined },
  rootSpaceId: string | null,
): string | null {
  const id = (row.hostSpaceId ?? row.spaceId)?.trim()
  if (!id) return null
  if (rootSpaceId && id === rootSpaceId) return null
  return id
}

/**
 * The Space an event LIVES IN when that is a different Space from the one hosting it, else null.
 *
 * 🔴 WHY THIS EXISTS. `events` has carried two distinct axes since ADR-819 — `space_id` is pure
 * tenancy ("lives under") and `host_space_id` is "hosted by, billed, paid" — and nothing surfaced
 * the difference. Both the read path (`hostSpaceId ?? spaceId`) and the write path
 * (`setEventHostEntity` updating both columns) forced them equal, so an event at a venue hosted by
 * a different business could not be expressed at all: naming the host moved the event out of the
 * venue. Owner report: "hosted by Audrey DeWitt, at Royal Temple. I want it to say Part of Royal
 * Temple but list Audrey as the host."
 *
 * Returns null when the venue IS the host, so the caller never renders the same Space twice. That
 * makes the duplicate structurally impossible rather than a conditional someone can forget: on
 * every event where the two axes agree (which is all of them today) there is exactly one Space to
 * name, and the host line names it.
 */
export function venueSpaceId(
  row: { spaceId: string | null | undefined; hostSpaceId?: string | null | undefined },
  rootSpaceId: string | null,
): string | null {
  const venue = row.spaceId?.trim()
  if (!venue) return null
  // The root Space names nothing worth showing, exactly as for the host.
  if (rootSpaceId && venue === rootSpaceId) return null
  // Same Space on both axes: the host line already names it.
  return venue === hostingSpaceId(row, rootSpaceId) ? null : venue
}

/** The three things an Event can belong to. */
export type BelongingKind = 'circle' | 'space' | 'journey'

/** One resolved, navigable tie, ready to render. */
export interface BelongingLink {
  kind: BelongingKind
  /** The proper noun for the kind: 'Circle' / 'Space' / 'Journey'. */
  label: string
  /** The entity's own name. */
  name: string
  /** Where the link goes. */
  href: string
}

/** Already-resolved entity refs. A null ref means "this Event has no such tie". */
export interface BelongingRefs {
  circle: { name: string | null; slug: string | null } | null
  space: { name: string | null; slug: string | null } | null
  journey: { title: string | null; slug: string | null; visibility: string | null } | null
}

const LABEL: Record<BelongingKind, string> = {
  circle: 'Circle',
  space: 'Space',
  journey: 'Journey',
}

const HREF_BASE: Record<BelongingKind, string> = {
  circle: '/circles',
  space: '/spaces',
  journey: '/journeys',
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? v : null
}

/**
 * A Journey may be linked from a public Event page only when the Journey itself is public.
 *
 * This is the re-application of `journey_plans` RLS that the admin client bypasses. The
 * `events.journey_id` migration says it plainly: the bare uuid on the event is not the leak, the
 * JOIN is, and a service-role join has to carry the governance itself. `unlisted` means "anyone
 * with the link" and `private` means invite only, so publishing either on an indexed Event page
 * would hand out a link its author never gave.
 *
 * The one deliberate widening: someone who can MANAGE the Event sees the tie whatever the
 * Journey's visibility, so a host who just linked a draft is never left thinking it failed to
 * save. That exposes a non-public Journey's title to the Event's managers (its host, its Circle's
 * manager, an operator) and to nobody else. If that ever needs to be exact, the fix is to resolve
 * the viewer's Journey capability, not to widen this.
 */
export function journeyIsLinkable(
  visibility: string | null | undefined,
  viewerCanManage: boolean,
): boolean {
  return visibility === 'public' || viewerCanManage
}

/**
 * The ordered set of ties to render: Circle, then Space, then Journey. A ref with no slug is
 * dropped (there is nowhere to navigate to, and a dead label is worse than no label). A ref with
 * a slug but no name falls back to the proper noun, so the link still reads honestly.
 */
export function resolveEventBelonging(
  refs: BelongingRefs,
  opts?: { viewerCanManage?: boolean },
): BelongingLink[] {
  const canManage = opts?.viewerCanManage === true
  const out: BelongingLink[] = []

  const push = (kind: BelongingKind, name: string | null, slug: string | null) => {
    const s = clean(slug)
    if (!s) return
    out.push({
      kind,
      label: LABEL[kind],
      name: clean(name) ?? LABEL[kind],
      href: `${HREF_BASE[kind]}/${s}`,
    })
  }

  if (refs.circle) push('circle', refs.circle.name, refs.circle.slug)
  if (refs.space) push('space', refs.space.name, refs.space.slug)
  if (refs.journey && journeyIsLinkable(refs.journey.visibility, canManage)) {
    push('journey', refs.journey.title, refs.journey.slug)
  }

  return out
}

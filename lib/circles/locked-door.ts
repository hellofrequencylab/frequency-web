import type { CircleJoinReason } from '@/lib/circles/visibility'

// ─────────────────────────────────────────────────────────────────────────────
// WHAT A VIEWER WHO MAY SEE A CIRCLE BUT NOT ENTER IT IS TOLD (LIVE-519).
//
// `CircleShell.canEnter` has always carried this instruction in its own doc
// comment: "A surface that renders content MUST branch on this and offer the
// join / buy call to action instead." Nothing did. `loadCircleShell` computed
// the verdict, used it to blank the roster, and every consumer dropped it — so
// a Circle you may not enter rendered as a Circle with ZERO MEMBERS and empty
// tabs. Indistinguishable from a dead room.
//
// The card already promised better. `components/circles/circle-card.tsx` shows
// a closed Circle a "See what's inside" link instead of a Join button, and its
// comment says the honest action is "the circle's own page, WHICH STATES THE
// DOOR". This is the door being stated.
//
// It is a separate pure module rather than JSX in the layout for the reason the
// repo keeps giving: the refusal REASON is policy (canJoinCircle), and the
// sentence a reader gets is a product decision. Both are testable here without
// rendering anything, and `circleDoor` is exhaustive over CircleJoinReason, so
// a new access mode cannot ship without someone writing its sentence.
//
// VOICE (docs/CONTENT-VOICE.md): plain sentences, no em dashes, and never tell
// the reader how to feel about a room they are standing outside of.
// ─────────────────────────────────────────────────────────────────────────────

export interface CircleDoor {
  /** The heading. Says what the wall IS, never "Access denied". */
  title: string
  /** One or two plain sentences: who is inside, and what would put the reader there. */
  body: string
  /** Somewhere real to go, or null when this Circle genuinely has no self-serve door. */
  action: { href: string; label: string } | null
}

export interface CircleDoorInput {
  reason: CircleJoinReason
  /** The Circle's own slug, so a sign-in can come back to it. */
  circleSlug: string
  /** The owning Space, when there is a real one. Null on a personal Circle (root sentinel). */
  spaceSlug: string | null
  /** The Space's brand name, for a sentence that names the place rather than "this space". */
  spaceName: string | null
}

/** The place a paid door sends someone: the Space's own Memberships tab, which is the surface
 *  that lists the tiers and takes the money. Built here so the two paid reasons cannot drift
 *  apart, and null when there is no Space to send them to. */
function membershipsHref(spaceSlug: string | null): string | null {
  return spaceSlug ? `/spaces/${spaceSlug}/memberships` : null
}

/**
 * The door for a viewer who may see this Circle and may not enter it.
 *
 * EXHAUSTIVE over CircleJoinReason by the return type, not by a default arm. A `default:` here
 * would silently hand a new access mode the closed-Circle sentence, which is how a paid door
 * would end up telling someone the host adds people by hand.
 */
export function circleDoor(input: CircleDoorInput): CircleDoor {
  const { reason, circleSlug, spaceSlug, spaceName } = input
  const place = spaceName?.trim() || 'this Space'
  const plans = membershipsHref(spaceSlug)

  switch (reason) {
    case 'signed-out':
      return {
        title: 'Sign in to see inside',
        body: 'This circle keeps its posts and its people for the members. Sign in and you will see whether you are already one of them.',
        action: { href: `/join?next=/circles/${circleSlug}`, label: 'Sign in' },
      }
    case 'membership-only':
      // THE ONE THAT EARNS ITS KEEP. A `space_paid_members` Circle is the exact moment someone
      // wants to know what a membership buys, and until now it showed them an empty room.
      return {
        title: `Inside is for ${place} members`,
        body: `${place} keeps this circle for the people who have joined it. A membership opens this circle and everything else behind the same door.`,
        action: plans ? { href: plans, label: 'See what membership includes' } : null,
      }
    case 'paid':
      return {
        title: 'This circle comes with a membership tier',
        body: `Joining ${place} at the tier this circle belongs to puts you straight in. Nobody has to add you.`,
        action: plans ? { href: plans, label: 'See the tiers' } : null,
      }
    case 'space-members-only':
      // The TEAM, not the paying members. Conflating these two was the bug ADR-1015 and OWN-034
      // were written about, so the copy keeps them apart too: there is no self-serve door here.
      return {
        title: `Inside is for the ${place} team`,
        body: 'This circle is where the people who run this place work. Someone on the team can add you if you should be here.',
        action: spaceSlug ? { href: `/spaces/${spaceSlug}`, label: `Go to ${place}` } : null,
      }
    case 'invite-only':
      return {
        title: 'By invite only',
        body: 'An invite link or a QR code from the host is the only way into this circle.',
        action: null,
      }
    case 'closed':
      return {
        title: 'The host adds people here',
        body: 'This circle has no public door. The host brings people in themselves.',
        action: null,
      }
  }
}

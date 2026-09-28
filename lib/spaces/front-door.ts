// ─────────────────────────────────────────────────────────────────────────────
// WHAT A SPACE'S HOME SAYS TO THE PERSON READING IT (LIVE-524).
//
// A Space's Home said the same thing to everybody. The (public) tree closed with
// a generic "Sign in free to follow this Space" card that named nothing the
// Space actually sells, and the member tree (`(profile)/full`) closed with
// NOTHING AT ALL: a signed-in non-member and a paying member got byte-identical
// bodies, because the only role axis either tree reads is owner/staff.
//
// So the two things the owner asked for were both missing. A visitor got no
// pitch, and a member got no sense that this was their place.
//
// THIS MODULE IS THE SENTENCE, NOT THE GATE. Which viewer someone is gets
// decided by the tree that mounts it, because the two trees can see different
// things and that asymmetry is load-bearing:
//
//   • `(public)` is ISR (ADR-1465, ADR-1526). It calls `markAnonymousRender()`
//     first and CANNOT read the caller at all, so it can only ever pass
//     `anonymous`. It may still read the Space's own published tiers, because
//     those are Space data, not viewer data.
//   • `(profile)/full` is dynamic and reads `getMyMembership`, so it resolves
//     `member` / `waitlist` / `visitor` for real.
//
// Same reason `circleDoor` (lib/circles/locked-door.ts) is its own pure module:
// the policy is one thing and the sentence is another, both are testable here
// without rendering, and the switch is EXHAUSTIVE over SpaceViewer by the return
// type with NO `default:` arm, so a new viewer state cannot ship without someone
// writing its copy.
//
// VOICE (docs/CONTENT-VOICE.md): plain sentences, no em dashes, and never tell
// someone they are missing out.
// ─────────────────────────────────────────────────────────────────────────────

/** Who is reading a Space's Home. `anonymous` is a viewer the render genuinely cannot see (the ISR
 *  tree), which is NOT the same claim as "signed out": it is "this render has no viewer" (ADR-1526).
 *  `visitor` is a signed-in reader with no membership, the state that previously got nothing. */
export type SpaceViewer = 'anonymous' | 'visitor' | 'waitlist' | 'member'

export interface SpaceFrontDoorCopy {
  /** The heading. Names the place or the reader's standing in it, never a demand. */
  title: string
  /** One or two plain sentences. */
  body: string
  /** Somewhere real to go, or null when the honest answer is to say nothing at all. */
  action: { href: string; label: string } | null
}

export interface SpaceFrontDoorInput {
  viewer: SpaceViewer
  /** The Space's brand name, so the copy names the place rather than "this space". */
  brandName: string | null
  spaceSlug: string
  /** How many ACTIVE tiers the Space publishes. Zero means it sells nothing, and a sales pitch over
   *  nothing is the "heading over nothing" defect, so the join arms return null. */
  tierCount: number
}

/**
 * The card at the foot of a Space's Home, or null when there is nothing honest to say.
 *
 * Returning null is a real answer here and the callers rely on it: the (public) tree falls back to
 * its existing sign-in card, and the member tree renders nothing rather than a heading over air.
 */
export function spaceFrontDoor(input: SpaceFrontDoorInput): SpaceFrontDoorCopy | null {
  const { viewer, spaceSlug, tierCount } = input
  const place = input.brandName?.trim() || 'this Space'
  const plans = `/spaces/${spaceSlug}/memberships`

  switch (viewer) {
    case 'member':
      // THE HALF THE OWNER ASKED FOR AND THE CODE NEVER HAD. A member who lands on Home was shown
      // the same brochure as a stranger. Their place is the conversation, so this points at it.
      // `#discussion` is the band the Space Circle feed mounts under on the Circles page
      // (LIVE-523, ADR-1534), which is where a Space's life actually happens.
      return {
        title: `You are a member of ${place}`,
        body: 'The conversation and the circles are where the people are. Home is the shop window, so here is the door through to the rest.',
        action: { href: `/spaces/${spaceSlug}/circles#discussion`, label: 'Open the conversation' },
      }

    case 'waitlist':
      // Never re-pitch a membership to someone already queuing for one. They asked; the answer is
      // pending; saying "become a member" here would read as though nothing had been registered.
      return {
        title: 'You are on the list',
        body: `${place} will let you know when a spot opens. Nothing else to do for now.`,
        action: null,
      }

    case 'visitor':
      // Signed in, not a member. No sign-in framing, because they are already signed in: the only
      // thing left between them and the place is the membership itself.
      if (tierCount === 0) return null
      return {
        title: `Become a member of ${place}`,
        body: 'A membership opens the conversation, the circles behind it, and whatever else this Space keeps for its people.',
        action: { href: plans, label: 'See what membership includes' },
      }

    case 'anonymous':
      // The ISR render, which has no viewer by construction. It cannot know whether this person is
      // already a member, so the copy must be true either way: it describes the Space, and lets the
      // Memberships tab (which reads the caller) tell them where they stand.
      if (tierCount === 0) return null
      return {
        title: `${place} has memberships`,
        body: 'See the tiers, what each one opens, and how to join.',
        action: { href: plans, label: 'See what membership includes' },
      }
  }
}

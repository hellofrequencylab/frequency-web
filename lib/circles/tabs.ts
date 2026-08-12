// THE CIRCLE DETAIL TAB STRIP — pure, so the rules that decide which tabs a Circle gets are
// unit-testable without a database or a render (the lib/circles/*-gate idiom, ADR-841/843).
//
// FIVE TABS, and each one hides when it has nothing to say (owner ruling, 2026-08-12):
//
//   Feed · Events · Journey · Practice · Members
//
// FEED IS THE DEFAULT and it carries the reason people came, so it is the bare `/circles/<slug>`
// route and it leads the strip whenever a strip renders at all.
//
// THE LEADERBOARD IS GONE AS A TAB. It measures effort relative to YOURSELF (lib/quest/effort.ts),
// so it is a view of your practice, not a peer entity of it: it folded into Practice, and
// /circles/<slug>/leaderboard now redirects there. A Circle never had two boards; it had one board
// filed under the wrong noun.
//
// EACH TAB HIDES WHEN IT HAS NOTHING. A Circle with no Journey running shows no Journey tab, a
// Circle with nothing booked shows no Events tab. A tab pointing at an empty room is worse than no
// tab: it spends a click to say "nothing here", and it makes a small Circle read emptier than it is.
// The facts that answer "has it got anything" are read once in the shell
// (app/(main)/circles/[slug]/(circle)/tab-facts.ts) and handed here as plain booleans.
//
// ADR-089's EMPTY-CIRCLE GUARDRAIL still holds underneath all of it. The ADR mitigates the
// thin-circle risk by DEFERRING a Circle's heavier surfaces until it has something to defer TO. A
// tab strip is one of those surfaces. A Circle of one with nothing on and nothing running renders
// as ONE page, exactly as it did before the shell existed, because splitting a room of one into
// Feed and Members organizes nothing. It grows a strip the moment it grows content or a second
// person.
//
// A MANAGER always gets the strip. A host setting up a brand-new Circle needs to see where the
// roster lives before anyone arrives, and they are the one viewer for whom an empty state is a
// to-do rather than a disappointment.
//
// Production's largest circle today holds 2 members. That is the size this is designed for.

import type { UnderlineTabLink } from '@/components/ui/underline-tabs'

export interface CircleTabFacts {
  slug: string
  /** ACTIVE members on the roster (the host counts as one). */
  memberCount: number
  /** Holds circle.editSettings — host, scope leader, or admin of THIS circle. */
  canManage: boolean
  /** The viewer is on this Circle's roster. */
  isMember: boolean
  /** Upcoming events this viewer may see, with a repeating series counted ONCE (ADR-897). */
  upcomingEventCount: number
  /** The Circle is part-way through a Journey together: an active Run (ADR-252). */
  hasActiveJourney: boolean
  /** The host has assigned this Circle a practice. */
  hasAssignedPractice: boolean
}

/**
 * The tabs a Circle offers, in order. EMPTY means "render no strip": the Circle has nothing to
 * split and reads as a single page.
 */
export function circleTabs(facts: CircleTabFacts): UnderlineTabLink[] {
  // Fail closed. A bad route renders no broken links.
  if (!facts.slug) return []

  const base = `/circles/${facts.slug}`
  const tabs: UnderlineTabLink[] = []

  // EVENTS — the next gatherings. The count IS the affordance: it tells a visitor whether the
  // calendar is worth a click before they spend one.
  if (facts.upcomingEventCount > 0) {
    tabs.push({ href: `${base}/events`, label: 'Events', count: facts.upcomingEventCount })
  }

  // JOURNEY — this Circle moving through one Journey together, a Run. No count: a Run is one
  // thing, and a number beside it would be read as a score.
  if (facts.hasActiveJourney) {
    tabs.push({ href: `${base}/journey`, label: 'Journey' })
  }

  // PRACTICE — this week's practice, and the effort board underneath it. A visitor gets the tab
  // only once the Circle has a practice to show; for someone ON the roster their own week is real
  // content at any Circle size, which is the whole design of the board (effort against your own
  // usual week, never against the person beside you), so a member always gets it. A manager gets
  // it because setting the practice is their job and this is where it lands.
  if (facts.hasAssignedPractice || facts.isMember || facts.canManage) {
    tabs.push({ href: `${base}/practice`, label: 'Practice' })
  }

  // MEMBERS — the roster. A Circle of one is just its host, so there is no roster to browse yet;
  // its manager still gets the tab, because they need to see where the roster lives before anyone
  // arrives. No count on an empty-ish list would read as a bug, so the count rides along.
  const showsRoster = facts.memberCount > 1 || facts.canManage
  if (showsRoster) {
    tabs.push({ href: `${base}/members`, label: 'Members', count: facts.memberCount })
  }

  // Nothing to split. Render no strip at all rather than a lone "Feed" tab, which is chrome that
  // says only "you are where you already are" (ADR-089).
  if (tabs.length === 0) return []

  return [{ href: base, label: 'Feed' }, ...tabs]
}

// THE CIRCLE DETAIL TAB STRIP — pure, so the rules that decide which tabs a Circle gets are
// unit-testable without a database or a render (the lib/circles/*-gate idiom, ADR-841/843).
//
// FOUR TABS, and each one hides when it has nothing to say (owner ruling, 2026-08-13):
//
//   Feed · Program · Members · Circle Stats
//
// FEED IS THE DEFAULT and it carries the reason people came, so it is the bare `/circles/<slug>`
// route and it leads the strip whenever a strip renders at all.
//
// ⚠️ THIS REPLACES THE FIVE-TAB STRIP OF 2026-08-12 (Feed · Events · Journey · Practice · Members),
// on the owner's instruction: *"Change Practice tab to Program. All events, practices and journeys
// go there"* and *"Change leaderboard to Circle Stats"*.
//
// WHY IT IS BETTER AND NOT JUST DIFFERENT. Events, the Journey Run and the weekly practice are all
// answers to ONE member question — *what is this Circle actually doing, and when do I show up?* —
// so three tabs made a member check three rooms to assemble one answer, and made a Circle running
// only a Journey look like a Circle with two empty tabs. One **Program** tab answers it in one
// scroll: this week's practice, what is booked, and where the Run has got to.
//
// **Circle Stats** is the board plus the Momentum tiles. The board measures effort relative to
// YOURSELF (lib/quest/effort.ts) and the tiles are the Circle's weekly vital signs; both are
// STATUS, which is a different question from "what are we doing", and status is the thing that
// belongs behind its own tab rather than in a rail box nobody's eye reaches.
//
// ROUTE ≠ LABEL, and that is allowed (the ADR-1020 precedent, set by /nearby → "Around You"; this
// strip is ADR-1023). The
// old `/practice`, `/events`, `/journey` and `/leaderboard` URLs all still resolve: each is a
// permanent redirect to whichever of the two new tabs absorbed it, so every link anyone has ever
// sent still lands somewhere true.
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

  // PROGRAM — what this Circle is doing: this week's practice, what is booked, and the Journey Run
  // it is part-way through. A visitor gets it as soon as the Circle has ANY of the three to show;
  // a member and a manager always get it, because for someone on the roster an empty Program is a
  // to-do ("nothing booked, add something") rather than a dead end, and setting the practice is the
  // manager's job and this is where it lands.
  //
  // The COUNT is the upcoming events, and only when there are some. It is the one number on this
  // tab that tells a visitor whether the click is worth it before they spend it; a practice and a
  // Run are each one thing, and adding them into the count would make "3" mean nothing.
  const hasProgram =
    facts.upcomingEventCount > 0 || facts.hasActiveJourney || facts.hasAssignedPractice
  if (hasProgram || facts.isMember || facts.canManage) {
    tabs.push({
      href: `${base}/program`,
      label: 'Program',
      ...(facts.upcomingEventCount > 0 ? { count: facts.upcomingEventCount } : {}),
    })
  }

  // MEMBERS — the roster. A Circle of one is just its host, so there is no roster to browse yet;
  // its manager still gets the tab, because they need to see where the roster lives before anyone
  // arrives. No count on an empty-ish list would read as a bug, so the count rides along.
  const showsRoster = facts.memberCount > 1 || facts.canManage
  if (showsRoster) {
    tabs.push({ href: `${base}/members`, label: 'Members', count: facts.memberCount })
  }

  // CIRCLE STATS — the Momentum tiles and the effort board. Status, so it is the last tab, and it
  // is for the people IN the room: a visitor reading a Circle's weekly vital signs before they have
  // joined it learns nothing they can act on, and a thin week reads to a stranger as a dead Circle
  // when it is a new one. No count: every number on this tab is a number, and one more in the strip
  // would be read as a rank.
  if (facts.isMember || facts.canManage) {
    tabs.push({ href: `${base}/stats`, label: 'Circle Stats' })
  }

  // Nothing to split. Render no strip at all rather than a lone "Feed" tab, which is chrome that
  // says only "you are where you already are" (ADR-089).
  if (tabs.length === 0) return []

  return [{ href: base, label: 'Feed' }, ...tabs]
}

// THE CIRCLE DETAIL TAB STRIP — pure, so the one rule that decides whether a Circle gets tabs at
// all is unit-testable without a database or a render (the lib/circles/*-gate idiom, ADR-841/843).
//
// ADR-089's EMPTY-CIRCLE GUARDRAIL is the whole reason this is a function rather than a constant.
// The ADR mitigates the thin-circle risk by DEFERRING a Circle's heavier surfaces until it crosses
// a small size threshold: founding stays easy, ghost circles stay lightweight. A tab strip is one
// of those heavier surfaces. Splitting a circle of one into Home and Members does not organize
// anything; it just adds chrome to an empty room and makes it read emptier. So a circle nobody has
// joined yet renders as ONE page, exactly as it did before the shell existed, and grows tabs the
// moment a second person is in it.
//
// A MANAGER always gets the strip, whatever the size. A host setting up a brand-new circle needs
// to see where the roster lives before anyone arrives, and they are the one viewer for whom the
// empty state is a to-do rather than a disappointment.
//
// Production's largest circle today holds 2 members. That is the size this is designed for.

import type { UnderlineTabLink } from '@/components/ui/underline-tabs'

export interface CircleTabFacts {
  slug: string
  /** ACTIVE members on the roster (the host counts as one). */
  memberCount: number
  /** Holds circle.editSettings — host, scope leader, or admin of THIS circle. */
  canManage: boolean
}

/**
 * The tabs a Circle offers, in order. EMPTY means "render no strip": the circle has not crossed
 * ADR-089's threshold and reads as a single page.
 *
 * Home, Members and Leaderboard are the three tabs with real content today. Chat is a later phase
 * and is deliberately absent — a tab pointing at a surface that does not exist is worse than no tab.
 *
 * THE LEADERBOARD TAB RIDES THE SAME THRESHOLD as the strip itself, and does not get a higher one
 * of its own. It leads with the circle's SHARED total, which is real content at any size, and its
 * own ~6-contributor gate (lib/quest/effort.ts) decides whether a list of individuals appears
 * beneath that. So the small circle this guardrail is about gets the shared bar and a straight
 * answer about why there is no list yet, rather than a tab that vanishes and leaves the question
 * unasked. One rule at the strip, one rule inside the page.
 */
export function circleTabs(facts: CircleTabFacts): UnderlineTabLink[] {
  if (!facts.slug) return []
  if (facts.memberCount <= 1 && !facts.canManage) return []
  const base = `/circles/${facts.slug}`
  return [
    { href: base, label: 'Home' },
    // The count IS the affordance: it tells a visitor whether the roster is worth a click before
    // they spend one, which matters most on exactly the small circles this guardrail is about.
    { href: `${base}/members`, label: 'Members', count: facts.memberCount },
    // No count here on purpose. A number beside "Leaderboard" would be read as a score or a
    // standing before the page had a chance to explain that there is neither.
    { href: `${base}/leaderboard`, label: 'Leaderboard' },
  ]
}

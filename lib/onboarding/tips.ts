// Deterministic onboarding tips (ADR-047 Phase 1, ONBOARDING.md). The always-on,
// no-AI baseline that the Vera concierge (Phase 2) will later deliver in voice and
// fall back to whenever AI is off. Declarative + pure data so selection is testable.
//
// Copy is in Vera's voice (cool register) but rendered deterministically: one
// center coachmark at a time, paced, each shown once. See lib/onboarding/select.

export interface Tip {
  /** Stable id; persisted in profiles.meta.tour.seen. */
  id: string
  /** Route (prefix) that makes this tip eligible. */
  trigger: string
  title: string
  body: string
  /** Optional nudge to a different surface. */
  cta?: { label: string; href: string }
  /** Higher shows first when several are eligible. */
  priority: number
  /** Tip ids that must have been seen before this one is eligible. */
  prerequisite?: string[]
}

export const TIPS: Tip[] = [
  {
    id: 'feed_home',
    trigger: '/feed',
    priority: 100,
    title: 'This is home.',
    body: "What's happening in your circles lands here. It's quiet until you join a few — so let's fix that.",
  },
  {
    id: 'profile_face',
    trigger: '/feed',
    priority: 90,
    prerequisite: ['feed_home'],
    title: 'Put a face to the name?',
    body: 'Ten seconds, and people actually recognize you when you show up.',
    cta: { label: 'Add a photo', href: '/settings/profile' },
  },
  {
    id: 'circles_find',
    trigger: '/circles',
    priority: 100,
    title: 'This is where you find your people.',
    body: "Pick one that doesn't scare you. Showing up is the whole thing — the rest sorts itself out.",
  },
  {
    id: 'practice_adopt',
    trigger: '/practices',
    priority: 100,
    title: 'Want a small weekly thing to show up for?',
    body: "Adopt a practice — a recurring ritual you do with your circle. That's the point of all of this.",
  },
  {
    id: 'events_show',
    trigger: '/events',
    priority: 90,
    title: 'Gatherings live here.',
    body: 'RSVP to one. The easiest way into a circle is to just turn up in person.',
  },
]

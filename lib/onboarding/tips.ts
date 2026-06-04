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
  /** Optional second action link — e.g. "Ask Vera" for a deeper hand. */
  cta2?: { label: string; href: string }
  /** Higher shows first when several are eligible. */
  priority: number
  /** Tip ids that must have been seen before this one is eligible. */
  prerequisite?: string[]
  /** The activation step this tip nudges. When that step is already DONE we never
   *  show the tip — so we don't prompt "add a photo" to someone who has one. Maps
   *  to OnboardingStepKey (lib/onboarding/status.ts). */
  satisfiedKey?: 'avatar' | 'circle' | 'practice' | 'log'
  /** `data-tour-anchor` value of the element this cue points at, so the popup
   *  positions itself next to the content in question (falls back to a corner). */
  anchor?: string
}

export const TIPS: Tip[] = [
  {
    id: 'feed_home',
    trigger: '/feed',
    priority: 100,
    anchor: 'content',
    title: 'This is home.',
    body: "What's happening in your circles shows up here — posts, events, the practices people are keeping. It stays quiet until you join a few, so that's the first move.",
    cta: { label: 'Find your circles', href: '/circles' },
    cta2: { label: 'Ask Vera', href: '/feed?welcome=vera&v=chat' },
  },
  {
    id: 'profile_face',
    trigger: '/feed',
    priority: 90,
    prerequisite: ['feed_home'],
    satisfiedKey: 'avatar',
    anchor: 'avatar',
    title: 'Put a face to the name?',
    body: 'Ten seconds now, and people actually recognize you when you walk into a gathering — a photo makes every intro warmer.',
    cta: { label: 'Add a photo', href: '/settings/profile' },
  },
  {
    id: 'circles_find',
    trigger: '/circles',
    priority: 100,
    satisfiedKey: 'circle',
    anchor: 'content',
    title: 'This is where you find your people.',
    body: "Each circle is a small group around one shared thing. Pick one that doesn't scare you — showing up is the whole game, and the rest sorts itself out.",
    cta: { label: 'Explore by interest', href: '/channels' },
    cta2: { label: 'Ask Vera', href: '/feed?welcome=vera&v=chat' },
  },
  {
    id: 'practice_adopt',
    trigger: '/practices',
    priority: 100,
    satisfiedKey: 'practice',
    anchor: 'content',
    title: 'Want a small weekly thing to show up for?',
    body: 'A practice is a recurring ritual you do with your circle — a walk, a sit, a check-in. Adopt one and it becomes your reason to keep coming back.',
    cta: { label: 'Find a circle to practice with', href: '/circles' },
  },
  {
    id: 'events_show',
    trigger: '/events',
    priority: 90,
    anchor: 'content',
    title: 'Gatherings live here.',
    body: "RSVP to one near you this week — the easiest way into a circle is to just turn up in person. No one expects you to know anyone yet.",
    cta: { label: 'See your circles too', href: '/circles' },
    cta2: { label: 'Ask Vera', href: '/feed?welcome=vera&v=chat' },
  },
]

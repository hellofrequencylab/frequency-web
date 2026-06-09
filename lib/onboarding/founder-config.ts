// =============================================================================
// Founder's First Week — THE SINGLE EDIT POINT
//
// Everything that defines the "Founder" milestone lives here: the reward (gems +
// badge), the copy Vera coaches with, the persistent /founder page copy, and the
// six tasks' labels / nudges / links. Edit this file to retune any of it.
//
// What stays elsewhere (and READS from here):
//   • lib/onboarding/founder-tasks.ts  — wires each task key to the DB signal that
//     proves it done (the source-of-truth query); copy comes from FOUNDER_TASKS.
//   • app/(main)/founder/founder-actions.ts — pays the reward defined in
//     FOUNDER_REWARD and grants FOUNDER_REWARD.badgeSlug.
//   • app/(main)/layout.tsx — shows FOUNDER_COACH as Vera's "next move" card.
//   • app/(main)/founder/page.tsx — renders FOUNDER_PAGE + the tasks.
//
// The badge row itself is seeded by supabase/migrations/*_founders_first_week_badge
// (slug must match FOUNDER_REWARD.badgeSlug).
// =============================================================================

export type FounderTaskKey = 'post' | 'react' | 'friend' | 'second_circle' | 'rsvp' | 'streak3'

/** Copy + destination for one task. The `done` signal is computed in founder-tasks.ts. */
export interface FounderTaskCopy {
  key: FounderTaskKey
  label: string
  nudge: string
  href: string
}

// ── The reward ───────────────────────────────────────────────────────────────
// What a member earns. `perTaskGems` drops the first time each task is seen done;
// `completionBonus` pays once when the whole set is finished, which also grants the
// badge. Rides the existing gem ledger + achievements catalog — no new engine.
export const FOUNDER_REWARD = {
  /** Gems paid the first time a single task flips to done. */
  perTaskGems: 5,
  /** One-time bonus paid when all tasks are complete (also grants the badge). */
  completionBonus: 25,
  /** Achievements catalog slug — must match the seeded badge row. */
  badgeSlug: 'founders-first-week',
  /** Human label for the badge (used in copy / explanations). */
  badgeName: "Founder's First Week",
} as const

// ── Vera's coach card ─────────────────────────────────────────────────────────
// Shown in the Next Steps overlay once a member is fully activated but hasn't
// finished the set. This is the "Your Founder's First Week" popup.
export const FOUNDER_COACH = {
  eyebrow: 'Vera',
  headline: "Your Founder's First Week",
  blurb:
    "You're activated — now the fun part. Six moves to become a Founder, and a badge when you finish.",
  cta: 'See your tasks',
  href: '/founder',
} as const

// ── The persistent /founder page ──────────────────────────────────────────────
export const FOUNDER_PAGE = {
  title: "Founder's First Week",
  description:
    'Six moves that turn a sign-up into a Founder. Do them in any order — finish the set to earn the badge.',
} as const

// ── The six tasks ─────────────────────────────────────────────────────────────
export const FOUNDER_TASKS: readonly FounderTaskCopy[] = [
  {
    key: 'post',
    label: 'Say something',
    nudge: 'Your first post — a hello, a question, a photo from today.',
    href: '/feed',
  },
  {
    key: 'react',
    label: 'React to someone',
    nudge: 'A heart or a +1 on a post. Let someone know you saw them.',
    href: '/feed',
  },
  {
    key: 'friend',
    label: 'Make a friend',
    nudge: 'Connect with one person. The network starts with a single tie.',
    href: '/people',
  },
  {
    key: 'second_circle',
    label: 'Join a second circle',
    nudge: 'One circle is a foothold; two is a life. Find another room.',
    href: '/circles',
  },
  {
    key: 'rsvp',
    label: 'RSVP to something',
    nudge: 'Say you’ll be there. Showing up in person is the whole point.',
    href: '/events',
  },
  {
    key: 'streak3',
    label: 'Build a 3-day streak',
    nudge: 'Log your practice three days running. Momentum is the reward.',
    href: '/practices',
  },
] as const

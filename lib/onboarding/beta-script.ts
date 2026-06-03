// Beta induction — Vera's scripted copy + config (ADR-068, docs/BETA-INDUCTION.md).
//
// TEMPORARY by design: this whole module is deleted at public launch. Everything
// here is deterministic copy in Vera's HOT register (AI-VERA.md §2) — conviction,
// not confetti. No AI calls. When live Vera ships (ADR-066 Phase D) this becomes
// her fallback script. Client-safe (no server imports).

/** Master switch. While true, `/onboarding` redirects into `/onboarding/beta`. */
export const BETA_INDUCTION_ACTIVE = true

/** Bumped if the oath/flow materially changes, so we can tell cohorts apart. */
export const BETA_INDUCTION_VERSION = 1

export type OathId = 'unfinished' | 'report' | 'build'

/** The gate. All three must be checked to enter. Single source of truth. */
export const BETA_OATHS: { id: OathId; label: string }[] = [
  { id: 'unfinished', label: 'I know this is unfinished. Things will break.' },
  { id: 'report', label: "When it breaks, I'll tell you — not just leave." },
  { id: 'build', label: "I'm here to build this, not browse it." },
]

export type TourBeat = {
  key: 'feed' | 'circles' | 'events'
  title: string
  line: string
}

/** The core triad we show in the tour — Vera, hot but earned. */
export const TOUR: TourBeat[] = [
  {
    key: 'feed',
    title: 'The Feed',
    line: "The pulse — what's actually happening near you. No algorithm deciding what you'd rage at. Just your people, in motion.",
  },
  {
    key: 'circles',
    title: 'Circles',
    line: 'Small rooms around one thing you care about. This is where you stop lurking and start belonging.',
  },
  {
    key: 'events',
    title: 'Events',
    line: 'Then you close the laptop. Meeting in the real world is the whole point — the screen is just how we find each other.',
  },
]

/** All voiced copy, in one place. */
export const VERA = {
  oath: {
    eyebrow: 'Before you come in',
    heading: "This isn't a product yet. It's a bet.",
    body: "And you're early — earlier than almost anyone. Check these like you mean them. If you can't, close the tab; no hard feelings either way.",
    cta: "I'm in.",
  },
  intro: {
    eyebrow: 'Welcome, founder',
    heading: "You're not a user here. You're a founder.",
    body: "The feed hollowed everyone out. We're building the thing that takes the attention back — a real place, with real people, near you. You got here while the paint's still wet. Let's go.",
    cta: "Let's go",
  },
  identity: {
    heading: 'So — who are you?',
    body: 'Name and handle are how the community knows you. The photo is optional, but a face goes a long way in here.',
  },
  place: {
    heading: 'Where are you, and what are you after?',
    body: "Region connects you to the people nearest you. The second one's the real question — and there are no wrong answers.",
    intentLabel: 'What are you actually hoping for here?',
    intentPlaceholder: "Be honest — it helps me point you at the right people.",
  },
  tour: {
    eyebrow: "Here's the place",
    heading: 'Three rooms. That’s the whole thing.',
    body: "Everything else is detail. Get these and you get Frequency.",
    cta: 'I see it',
  },
  enter: {
    eyebrow: 'Last step',
    heading: 'Ready to build?',
    body: "That's everything. Step in — I'll drop you straight into Circles so you're not standing in an empty room.",
    cta: 'Enter Frequency',
  },
} as const

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
  { id: 'unfinished', label: 'I agree to break things' },
  { id: 'report', label: 'I agree to report bugs' },
  { id: 'build', label: 'I agree to be a Founder' },
]

/** "How did you hear about us?" — captured on the intake into meta.beta.heard_about. */
export const HEARD_ABOUT = [
  'A friend or member',
  'Instagram',
  'X / Twitter',
  'TikTok',
  'An event or meetup',
  'Search',
  'Somewhere else',
]

/**
 * The intro reel — a cinematic slideshow that crossfades between vector
 * "renders" of features and atmospheric imagery of the place. Data-driven so
 * real product screenshots can be slotted in later (just add `kind:'image'`
 * entries pointing at the screenshot files) without touching the component.
 */
export type ReelSlide =
  | { kind: 'render'; render: 'feed' | 'circles' | 'events'; title: string; line: string }
  | { kind: 'image'; src: string; title: string; line: string }

export const REEL: ReelSlide[] = [
  {
    kind: 'render',
    render: 'feed',
    title: 'The Feed',
    line: 'The pulse of your people. What’s happening near you, right now. No algorithm, no outrage, just real life.',
  },
  {
    kind: 'render',
    render: 'circles',
    title: 'Circles',
    line: 'Small rooms around the things you love. This is where strangers turn into your people.',
  },
  {
    kind: 'render',
    render: 'events',
    title: 'Events',
    line: 'Then you close the laptop and show up. The whole point is meeting for real.',
  },
]

/** All voiced copy, in one place. */
export const VERA = {
  oath: {
    eyebrow: 'Before you come in',
    heading: "This isn't a product. It's a promise.",
    body: 'A promise that the people near you are worth finding, and that gathering can feel good again. We’re building it in the open, and you’re one of the very first.',
    cta: "I'm in",
  },
  intro: {
    eyebrow: 'Welcome, Founder',
    heading: "You're not a user. You're a Founder.",
    body: 'Everyone else waits until it’s polished. You’re here while it’s raw, shaping the room they’ll all walk into. Let’s build something worth belonging to.',
    cta: "Let's go",
  },
  identity: {
    heading: 'So, who are you?',
    body: 'Put a name and a face to it. This is how your people will know you in here.',
  },
  place: {
    heading: 'Where are you?',
    body: 'We’ll connect you with the Founders closest to you, and learn what you’re hoping to find.',
    intentLabel: 'What are you hoping to find here?',
    intentPlaceholder: 'Say it plainly. It helps us point you at your people.',
  },
  tour: {
    eyebrow: "Here's the place",
    heading: 'Three rooms. One real community.',
    body: 'Everything else is detail. Get these and you get Frequency.',
    cta: 'Love it',
  },
  enter: {
    eyebrow: 'Last step',
    heading: 'Hey, Founder!',
    body: 'One thing before you explore: say hello. Your first post is how the community meets you. Let’s write it together, then the place is yours.',
    cta: 'Create your first post',
  },
} as const

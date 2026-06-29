// Beta induction — Vera's scripted copy + config (ADR-068, docs/BETA-INDUCTION.md).
//
// TEMPORARY by design: this whole module is deleted at public launch. Everything
// here is deterministic copy in Vera's HOT register (AI-VERA.md §2) — conviction,
// not confetti. No AI calls. When live Vera ships (ADR-066 Phase D) this becomes
// her fallback script. Client-safe (no server imports).

/** Master switch. While true, `/onboarding` redirects into `/onboarding/beta`. */
export const BETA_INDUCTION_ACTIVE = true

/** During the Beta, every member gets Crew (full gamification) for free — they
 *  rack up points in the game and can downgrade to Member anytime (/upgrade).
 *  Flip OFF at Launch: new members default to Member, and unpaid members lose
 *  the Crew surfaces + the ability to spend gems (see ADR-084). */
export const BETA_MEMBERS_GET_CREW = true

/** Bumped if the oath/flow materially changes, so we can tell cohorts apart. */
export const BETA_INDUCTION_VERSION = 1

export type OathId = 'unfinished' | 'report' | 'build'

/** The gate. All three must be checked to enter. Single source of truth.
 *  Three plain commitments a new member makes about how they'll show up. The
 *  ids are wired/registered, so only the labels change. */
export const BETA_OATHS: { id: OathId; label: string }[] = [
  { id: 'unfinished', label: "I'll show up in person" },
  { id: 'report', label: "I'll say hi to someone new" },
  { id: 'build', label: "I'm here to be part of it" },
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
    line: 'What’s happening near you, right now. No algorithm, no outrage, just real life.',
  },
  {
    kind: 'render',
    render: 'circles',
    title: 'Circles',
    line: 'Small rooms around the things you care about. This is where strangers turn into your people.',
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
    body: 'A promise that the people near you are worth finding, and that gathering can feel good again. Here’s how we ask you to show up.',
    cta: "I'm in",
  },
  intro: {
    eyebrow: 'Welcome in',
    // Headings support a light accent markup in the induction: a word wrapped in
    // *asterisks* renders in the brand accent (same convention as splash statements).
    heading: "You're not a user. You're a *member.*",
    body: 'Frequency is people meeting in person, near you. Show up, find a Circle, do the practice. That’s the whole thing.',
    cta: "Let's go",
  },
  identity: {
    heading: 'So, who are you?',
    body: 'Put a name and a face to it. This is how your people will know you in here.',
  },
  place: {
    heading: 'Where are you?',
    body: 'We’ll connect you with the people closest to you, and learn what you’re hoping to find.',
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
    heading: 'Welcome in!',
    body: 'One thing before you explore: let’s find your people. Vera, your guide, already knows what you’re into. She’ll point you to a Circle worth joining, then step aside.',
    cta: 'Meet Vera',
  },
} as const

/** Widened structural type of VERA — the same shape, but every leaf is a plain
 *  `string` so sequences (beta-sequences.ts) and operator overrides (/admin/vera)
 *  can supply their own copy. `typeof VERA` alone is all readonly string LITERALS,
 *  which would reject any different wording. */
export type VeraCopy = {
  [K in keyof typeof VERA]: { [F in keyof (typeof VERA)[K]]: string }
}

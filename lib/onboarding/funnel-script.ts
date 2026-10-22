// Funnel script — Vera's scripted copy + config for the Funnels induction
// (ADR-068 → ADR-1090, docs/FUNNELS.md). Was lib/onboarding/beta-script.ts.
//
// Everything here is deterministic copy in Vera's HOT register (AI-VERA.md §2) —
// conviction, not confetti. No AI calls. When live Vera ships (ADR-066 Phase D)
// this becomes her fallback script. Client-safe (no server imports).

/** Master switch. While true, `/onboarding` redirects into `/join`, so the Funnels
 *  induction is the mandatory opening sequence. Flipping it off falls back to the
 *  steady-state onboarding model (ADR-047). */
export const FUNNEL_INDUCTION_ACTIVE = true

/** BETA PROGRAM flag, not a Funnels one (the name keeps its beta_ because the
 *  program it describes is still called the Beta): during the Beta, every member
 *  gets Crew for free — they can downgrade to Member anytime (/upgrade).
 *  Flip OFF at Launch: new members default to Member, and unpaid members lose
 *  the Crew surfaces (see ADR-084). 🔴 They do NOT lose the game: spending Gems
 *  and the full rewards loop were opened to every signed-in member by ADR-1295
 *  (owner ruling 2026-09-09), so flipping this off no longer touches the Quest. */
export const BETA_MEMBERS_GET_CREW = true

/** Bumped if the flow materially changes, so we can tell cohorts apart. Written to
 *  the STORED `meta.beta.version` key — the key keeps its name so every cohort
 *  stamp ever written stays comparable. */
export const FUNNEL_INDUCTION_VERSION = 1

/** How many beats the cinematic induction has: 0 intro · 1 reel · 2 identity+place · 3 enter.
 *  Lives here rather than in induction.tsx because the RESUME clamp in the server action needs
 *  the same number, and a flow length written down twice is a flow length that drifts. */
export const INDUCTION_BEAT_COUNT = 4

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

/** All voiced copy, in one place.
 *
 *  Ships as WRITING PROMPTS, not finished copy: this is the default Funnel
 *  template every custom funnel clones, so each beat carries fill-in guidance the
 *  operator replaces in the Default Funnel + funnel editors.
 *  Keep the beat structure; the copy stays plain prompts, no em dashes. */
export const VERA = {
  intro: {
    eyebrow: 'Founding beta · Free',
    // Headings support a light accent markup in the induction: a word wrapped in
    // *asterisks* renders in the brand accent (same convention as splash statements).
    heading: "You're early. That makes you a *Founder.*",
    body: 'Frequency is where people near you gather on purpose: Circles, events and places worth coming back to. Free to join, and the first people in help shape it.',
    cta: 'Save my spot',
  },
  identity: {
    heading: 'Put a name and a face to it',
    body: 'Your people will know you by this. A real name and a photo make the first hello easy.',
  },
  place: {
    heading: 'Where are you?',
    body: 'We open in North County San Diego on December 1. Tell us your town and we will show you what is near you first.',
    intentLabel: 'What are you hoping to find here?',
    intentPlaceholder: 'A running group, a place to teach, people to hang with. Say it plainly.',
  },
  tour: {
    eyebrow: 'Three rooms',
    heading: 'Here is where *your people* live',
    body: 'The Feed shows what is happening near you. Circles are small rooms around what you care about. Events are where you show up.',
    cta: 'Next',
  },
  enter: {
    eyebrow: 'Last step',
    heading: 'Step in. We saved you a *seat.*',
    body: 'Confirm your email and you are in. Vera, your guide, will point you to a Circle worth joining, then step aside.',
    cta: 'Step in',
  },
} as const

/** Widened structural type of VERA — the same shape, but every leaf is a plain
 *  `string` so Funnels (lib/funnels/definitions.ts) and operator overrides (/admin/vera)
 *  can supply their own copy. `typeof VERA` alone is all readonly string LITERALS,
 *  which would reject any different wording. */
export type VeraCopy = {
  [K in keyof typeof VERA]: { [F in keyof (typeof VERA)[K]]: string }
}

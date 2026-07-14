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
 *  ids are wired/registered, so only the labels change.
 *
 *  These ship as WRITING PROMPTS, not finished copy. The default flow is the
 *  Splash Funnel template every custom funnel clones, so a fresh funnel opens with
 *  fill-in guidance the operator replaces in the editor. Plain, no em dashes. */
export const BETA_OATHS: { id: OathId; label: string }[] = [
  { id: 'unfinished', label: 'Write the first commitment you ask for' },
  { id: 'report', label: 'Write the second commitment you ask for' },
  { id: 'build', label: 'Write the third commitment you ask for' },
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

/** All voiced copy, in one place.
 *
 *  Ships as WRITING PROMPTS, not finished copy (see BETA_OATHS above): this is the
 *  default Splash Funnel template every custom funnel clones, so each beat carries
 *  fill-in guidance the operator replaces in the /pages/splash + funnel editors.
 *  Keep the beat structure; the copy stays plain prompts, no em dashes. */
export const VERA = {
  oath: {
    eyebrow: 'Write the kicker above the promise',
    heading: 'Write the promise new members make before entering',
    body: 'Write the short paragraph that explains the promise',
    cta: 'Write the button label that accepts the promise',
  },
  intro: {
    eyebrow: 'Write the welcome kicker',
    // Headings support a light accent markup in the induction: a word wrapped in
    // *asterisks* renders in the brand accent (same convention as splash statements).
    heading: 'Write the welcome line new members see first',
    body: 'Write the two lines that say what Frequency is',
    cta: 'Write the button label that moves them on',
  },
  identity: {
    heading: 'Write the prompt that asks for their name and face',
    body: 'Write the line that explains why you ask',
  },
  place: {
    heading: 'Write the prompt that asks where they are',
    body: 'Write the line that explains why location helps',
    intentLabel: 'Write the question that asks what they want here',
    intentPlaceholder: 'Write the hint text for their answer',
  },
  tour: {
    eyebrow: 'Write the tour kicker',
    heading: 'Write the headline for the three-room tour',
    body: 'Write the line under the tour headline',
    cta: 'Write the button label after the tour',
  },
  enter: {
    eyebrow: 'Write the final-step kicker',
    heading: 'Write the last line before the feed',
    body: 'Write the short send-off that points them to Vera',
    cta: 'Write the final button label',
  },
} as const

/** Widened structural type of VERA — the same shape, but every leaf is a plain
 *  `string` so sequences (beta-sequences.ts) and operator overrides (/admin/vera)
 *  can supply their own copy. `typeof VERA` alone is all readonly string LITERALS,
 *  which would reject any different wording. */
export type VeraCopy = {
  [K in keyof typeof VERA]: { [F in keyof (typeof VERA)[K]]: string }
}

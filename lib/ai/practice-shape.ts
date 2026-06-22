// The shape of a good Practice, distilled for models. This is what Vera DEFAULTS to when she
// drafts a Practice, so a fresh build lands on a proven shape instead of a blank guess. It is a
// strong default, not a cage: an explicit author request always wins, and the primer says so out
// loud. Prompt-only — it never makes AI a hard dependency. When AI is off, the builder's own
// hand-entry takes over and this string is never read.
//
// Mirrors lib/ai/journey-shape.ts: a lean, model-ready string plus a `withPracticeShape` wrapper
// that prepends it, exactly like JOURNEY_TEMPLATE_PRIMER / withJourneyShape. Keep this terse; the
// source of truth is docs/NAMING.md + docs/CONTENT-VOICE.md.

/** The recommended Practice shape, imperative and model-ready. Prepend it to any system prompt that
 *  drafts a Practice's content (the Spark identity, the "build with Vera" body, an edit), framed as
 *  a default the author can depart from on purpose. */
export const PRACTICE_SHAPE_PRIMER = `## What a good Practice is (default to this unless the author clearly asks for something else)

A Practice is the smallest real thing a member actually does: sit, breathe, walk, write a line, text one friend. One act, not a course. It is the atom a Journey is built from, and it pays Zaps when a member logs it.

Draft a Practice to this shape:
- A name: short, plain, concrete. The thing you do, not a vibe. "Morning two-minute sit", not "Awaken your inner calm".
- A card hook (the summary): 8 to 12 words, the problem it solves, pure outcome. Written for the skeptic ("You're always wired. This is for that.").
- A one-line description (~20 to 25 words): who it's for in plain language and what they'll notice after a week. No method, no philosophy.
- A full guide (the body): the depth. A few short, concrete steps in second person ("Sit down. Set a timer for two minutes."), then why it helps and any tips. Three to six steps is plenty.

The five-minute rule: the entry version of a Practice should be doable in under five minutes. State the time ask, state the concrete act, promise nothing mystical.

A Practice belongs to one of four Pillars: Mind, Body, Spirit, or Expression. Pick the one that fits the act (a sit is Mind or Spirit, a walk is Body, making or sharing something is Expression).

Cadence is how OFTEN it's done (Daily, A few times a week, Weekly). Time is roughly how LONG one session takes, in minutes. Honest, not aspirational.

Names, exact: Practice, Pillar, Zaps. Never use the word "Mission". Never narrate the reader's feelings. Never promise transformation.`

/** Prepend the Practice-shape primer to a system prompt. Additive only: it sets the default shape,
 *  but it sits BELOW any "follow the author's own request" instruction the prompt already carries,
 *  so an explicit author request keeps precedence. */
export function withPracticeShape(system: string): string {
  return `${PRACTICE_SHAPE_PRIMER}\n\n---\n\n${system}`
}

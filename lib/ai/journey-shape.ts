// The Master Journey Template, distilled for models. This is the shape Vera DEFAULTS to when she
// drafts a Journey, so a fresh build lands on a proven structure instead of a blank guess. It is a
// strong default, not a cage: an uploaded outline or an explicit author request always wins, and
// the primer says so out loud. Prompt-only — it never makes AI a hard dependency. When AI is off,
// the deterministic scaffold (owned elsewhere) takes over and this string is never read.
//
// Mirrors lib/ai/voice.ts: a lean, model-ready string plus a `withJourneyShape` wrapper that
// prepends it, exactly like VOICE_PRIMER / withVoice. Keep this terse; the source of truth is
// content/leader-training/authoring/how-to-create-a-journey.md and docs/NAMING.md.

/** The recommended Journey shape, imperative and model-ready. Prepend it to any system prompt
 *  that drafts a Journey's structure (the Spark arc, the outline skeleton, the weekly composer),
 *  framed as a default the author can depart from on purpose. */
export const JOURNEY_TEMPLATE_PRIMER = `## The Master Journey Template (default to this unless the author's outline or description clearly asks for something else)

This is the shape that works. Draft to it by default. If the author pasted an outline, or their description clearly asks for a different length or structure, follow THEM instead. The template is the strong default, not a rule.

The default Run is one month: four week-Phases, wrapped by an Onboarding phase before week 1 and a Close phase at the end. Build it backward: name the outcome first, then the evidence that the outcome landed, then the activities that get there.

Each of the four weeks is one Phase with:
- A lesson / focus: a hook, ONE open question, a short teaching, and a line that reaches back to the prior week so the weeks connect.
- An ANCHOR practice: a single small daily through-line for the week (recommended). The Anchor is the spine; everything else complements it.
- Three weekly practices, one each for Mind, Body, and Spirit, that complement the Anchor rather than repeat it.
- A weekly EXPRESSION CHALLENGE: the Expression Pillar's active, social doing. Keep the weekly one LIGHT and tangible (make something small, share it, or connect with one person).
- A Reflection that closes the week.

Two weekly touchpoints hold the Run together: a Circle Meetup mid-week and a Weekend Gathering on the weekend.

The Close phase is the capstone Expression Challenge: the heavy one, the proof the month took.

Names, exact: Host (not facilitator), Run (not cohort), Phase, Pillar, Anchor practice, Expression Challenge. Never use the word "Mission".`

/** Prepend the Master Journey Template primer to a system prompt. Additive only: it sets the
 *  default shape, but it sits BELOW any "follow the author's own outline" instruction the prompt
 *  already carries, so an uploaded outline or explicit request keeps precedence. */
export function withJourneyShape(system: string): string {
  return `${JOURNEY_TEMPLATE_PRIMER}\n\n---\n\n${system}`
}

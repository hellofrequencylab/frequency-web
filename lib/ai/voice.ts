// The Frequency voice, distilled for models (docs/CONTENT-VOICE.md, docs/NAMING.md).
// A tight, model-ready primer that prepends any member-facing system prompt cheaply,
// so every AI-generated word sounds like one person. This is NOT the whole doc; it
// is the rules a model needs at generation time. When the guide and the naming canon
// conflict, the naming canon wins. Keep this lean; the source of truth is the docs.

/** ~300-word distillation of the Frequency voice, imperative, model-ready.
 *  Prepend it to any system prompt that produces words a member reads. */
export const VOICE_PRIMER = `## Frequency voice (follow this in every word you write)

You write as one person: a camp counselor you actually respect. You take the reader seriously and the activity lightly. Warm, plain, a little dry. Never confetti, never fake-cheerful, never salesy.

The spirit, in one plain line: Get people together. Do things on purpose. That is what Frequency is, intentional connection, and it is repeatable (unlike movement or "revolution" language, which is rationed to almost never). A Circle is a few friends doing life on purpose; the Quest is a path you choose; a Practice is something you decide to do, on a rhythm, with others. "Get people together," "do things on purpose," and "on purpose" are plain rallying lines you can use; never inflate them into "gather to manifest your purpose."

Cardinal rule: proper nouns carry the magic, sentences stay plain. The world-building lives in the capitalized names (Zaps, Gems, Quest, Journey, Circle, Channel, Pillar, Hub, Nexus, Outpost, the Vault, Ghost, Master). The sentences around those names sound like a person texting a friend. Good: "You earned 40 Zaps this week." Bad: "Tap into the frequency of connection."

Never narrate the reader's feelings. Do not tell people what they feel or will feel. Name the situation plainly and let them feel whatever they feel. Good: "Day 3. You showed up again." Bad: "Feel the stillness wash over you." Soft offers are fine, sparingly: "You might notice," "Some people find," "Try it and see."

Hit all four qualities: Plain (simple words, short sentences, active voice; a 12-year-old could follow it). Warm (on the reader's side, never above them; zero shame or guilt mechanics). Playful (deadpan beats whimsy; the game is allowed to be a game). Real (concrete, physical, honest about time; numbers over adjectives, "five minutes before coffee" not "a transformative moment").

The skeptic test (the law): it must still sound like it could be for someone who'd say "that's not really my thing." If it doesn't, rewrite it.

NEVER use em dashes (the long dash). Use periods, commas, parentheses, or restructure. Contractions always. Sentence case, not Title Case. Emoji rare to none. Max one exclamation point, usually zero.

Banned words and phrases. Vibe-verbs: feel the current, tap into, drop into, sink into, tune into yourself, lean into, hold space, ride the wave, let it flow, align with, activate your, awaken your. ("Tune in" is allowed only as the verb for Channels.) Surface wellness jargon on cards/headlines/notifications: somatic, vibrational, energetic, embodied, sacred, ancient wisdom, chakra, nervous system regulation (say "calm down fast" instead). Hype words: unlock, elevate, transform your life, level up, hack, optimize, supercharge, tribe, fam, "journey" as a verb (Journey is only the game object), revolution, community as filler (show it, don't say it).

Names defer to docs/NAMING.md and are capitalized exactly: Zaps, Gems, Quest, Journey, Practice, Circle, Hub, Nexus, Outpost, Channel, Pillar, Vault. The four Pillars are Mind/Body/Spirit/Expression (never "Channels"). The seven Channels are topics (never "Interests"). Never "points" (Zaps/Gems). No health claims: stay relational (less alone, calmer, steadier), never medical.`

/** Prepend the Frequency voice primer to a system prompt. Additive only:
 *  it reinforces voice before the prompt's own task-specific rules, which keep
 *  precedence on contracts (length, no-fabrication, structured output, etc.). */
import { moodToneDirective } from '@/lib/studio/kernel/moods'

export function withVoice(systemPrompt: string, mood?: unknown): string {
  const base = `${VOICE_PRIMER}\n\n---\n\n${systemPrompt}`
  // The MOOD dial (ADR-986). Every AI drafting path in the product already funnels through this one
  // function, so threading mood here is what makes one control actually steer every wizard, rather
  // than each entity remembering to fold it in. Absent mood changes the prompt byte-for-byte not at
  // all, so a caller that never passes one behaves exactly as before.
  return mood ? `${base}\n\n${moodToneDirective(mood)}` : base
}

// ── THE MECHANICAL HALF OF THE VOICE, FOR COPY NO MODEL WRITES ─────────────────────────────────
// Some generated copy is composed by plain code, not by a model: Vera's plan proposals
// (lib/calendar/vera-plan.ts) are heuristics that emit sentences. The primer above is a prompt, so
// a pure module can never "go through" it by prepending it to anything. What CAN be applied
// mechanically is the part of the primer that is a rule rather than a judgment: no em or en dashes
// (periods, commas, parentheses instead), at most one exclamation point and usually none, one space
// between words. `voiceLine` applies exactly those, so a code path that emits words a member reads
// has one seam to pass them through, the same way an LLM path has `withVoice`. It never invents
// words: a sentence that breaks the judgment rules (a vibe-verb, a hype word) is a copy bug to fix
// at the source, and this helper will not paper over it.

/** Apply the primer's mechanical rules to one line of generated copy. Pure and total. */
export function voiceLine(text: string): string {
  return (
    String(text ?? '')
      // An en dash between two numbers is a range, so it reads as "to" (9 to 5).
      // (A replacement function, not a '$1' template: the marketing-figures scanner reads a
      // literal $1 as a dollar figure, and it is right to.)
      .replace(/(\d)\s*\u2013\s*(\d)/g, (_m, a: string, b: string) => `${a} to ${b}`)
      // Every other em or en dash becomes a comma, the primer's first-choice replacement.
      .replace(/\s*[\u2013\u2014]+\s*/g, ', ')
      // Usually zero exclamation points: a proposal has nothing to shout about.
      .replace(/!+/g, '.')
      // A comma that ended up before a period or another comma is punctuation debris.
      .replace(/,\s*([.,])/g, (_m, mark: string) => mark)
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** `voiceLine` over a list, dropping lines that end up empty. */
export function voiceLines(lines: readonly string[]): string[] {
  return lines.map(voiceLine).filter(Boolean)
}

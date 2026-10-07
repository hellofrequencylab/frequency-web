// ─────────────────────────────────────────────────────────────────────────────
// THE STUDIO KERNEL — fidelity (docs/STUDIO.md).
//
// ONE choice, asked before a Spark drafts: what should Vera do with the author's own words?
//
//   EXACT    keep the text as written. Vera only sorts it into fields and fills what is missing.
//   EDIT     light cleanup: spelling, grammar, punctuation. Wording, length and detail stay.
//   REWRITE  Vera drafts fresh copy in the house voice (the behaviour every Spark always had).
//
// Why it exists (owner request 2026-10-07): a pasted write-up lost most of its content on the way
// into a Circle, Journey or Event. Every Spark told the model to rewrite into short, fixed-length
// fields ("1 to 2 sentences", "about 25 words"), capped the source it read, capped the output, and
// clamped each field on the way back. Rewrite keeps all of that. Exact and Edit lift it.
//
// PURE metadata: no IO, no AI, no React, no entity types. lib/ai/spark.ts turns the choice into a
// prompt directive and an output ceiling; each entity's draft function widens its source cap.
//
// Voice canon (docs/CONTENT-VOICE.md): operator-facing copy here stays plain, no em dashes.
// ─────────────────────────────────────────────────────────────────────────────

/** The three choices (owner pick, 2026-10-07: "Exact | Edit | Re Write"). */
export type SeedFidelity = 'exact' | 'edit' | 'rewrite'

/** Rewrite is what every Spark did before this choice existed. */
const LEGACY_SEED_FIDELITY: SeedFidelity = 'rewrite'

interface SeedFidelitySpec {
  key: SeedFidelity
  /** The button label. */
  label: string
  /** One line under the buttons saying what this choice does. */
  hint: string
}

export const SEED_FIDELITIES: readonly SeedFidelitySpec[] = [
  {
    key: 'exact',
    label: 'Exact',
    hint: 'Keep my words as written. Vera only sorts them into fields and fills in what is missing.',
  },
  {
    key: 'edit',
    label: 'Edit',
    hint: 'Light cleanup only. Vera fixes spelling, grammar and punctuation and keeps every detail.',
  },
  {
    key: 'rewrite',
    label: 'Rewrite',
    hint: 'Vera writes fresh, shorter copy in the Frequency voice from what you gave her.',
  },
]

const KEYS = new Set<SeedFidelity>(SEED_FIDELITIES.map((f) => f.key))

/** Whether a value is a known fidelity key. */
function isSeedFidelity(value: unknown): value is SeedFidelity {
  return typeof value === 'string' && KEYS.has(value as SeedFidelity)
}

/** Coerce any value (a server action argument, a stored draft) to a valid choice. Unknown or
 *  absent falls back to Rewrite, so a caller that never passes one behaves exactly as before. */
export function normalizeSeedFidelity(value: unknown): SeedFidelity {
  return isSeedFidelity(value) ? value : LEGACY_SEED_FIDELITY
}

/** The choice a Spark pre-selects: keep the author's words when they brought some, draft fresh
 *  from a few short answers when they did not. */
export function defaultSeedFidelity(hasSource: boolean): SeedFidelity {
  return hasSource ? 'edit' : 'rewrite'
}

/** Whether the author's words are kept (Exact or Edit) rather than re-drafted. */
export function keepsAuthorWords(value: unknown): boolean {
  return normalizeSeedFidelity(value) !== 'rewrite'
}

/** How much pasted source a draft reads. Rewrite keeps each entity's own cap; Exact and Edit read
 *  up to the 20,000 characters the shared upload reader already returns, so nothing is cut. */
const KEEP_SOURCE_CHARS = 20_000

export function fidelitySourceCap(value: unknown, rewriteCap: number): number {
  return keepsAuthorWords(value) ? Math.max(rewriteCap, KEEP_SOURCE_CHARS) : rewriteCap
}

/** The output ceiling a kept-words draft needs: the author's full text has to fit back out. */
export const KEEP_MAX_TOKENS = 6000

/**
 * The directive appended LAST to the system prompt, so it outranks the task prompt's length
 * guides. Rewrite returns '' (the prompt is byte for byte what it was). `proseField` names the
 * tool field the author's main description lands in, so nothing they wrote is left without a home.
 */
export function fidelityDirective(value: unknown, proseField?: string): string {
  const fidelity = normalizeSeedFidelity(value)
  if (fidelity === 'rewrite') return ''

  const home = proseField
    ? `Put the author's main description, in full, into the "${proseField}" field. Anything that does not fit a more specific field also goes there, so nothing they wrote is dropped.`
    : 'Anything that does not fit a specific field goes into the longest prose field, so nothing they wrote is dropped.'

  const shared = [
    'This choice outranks every length guide above and in the tool schema ("1 to 2 sentences", "about 25 words", "a short paragraph"). Those guides apply only to fields the author gave you nothing for.',
    home,
    'Keep every detail they gave: names, dates, times, places, prices, links, list items, quotes and numbers. Do not summarize, condense, reorder or drop anything.',
    'Only write new words for a field the author said nothing about, and keep those short.',
    'Never invent a fact.',
  ]

  if (fidelity === 'exact') {
    return [
      "AUTHOR'S CHOICE: EXACT. Use the author's own words verbatim.",
      'Copy their sentences into the matching fields exactly as written, including their wording, punctuation, capitalization and paragraph breaks. Do not reword, correct or improve anything.',
      'The voice rules above govern only the words you write yourself, never theirs.',
      ...shared,
    ].join('\n')
  }

  return [
    "AUTHOR'S CHOICE: EDIT. Lightly clean up the author's own words.",
    'Fix spelling, grammar, punctuation and obvious typos, and replace em dashes per the voice rules. Keep their wording, sentence order, length, tone and paragraph breaks.',
    'Do not rewrite their sentences into the house voice, and do not shorten them.',
    ...shared,
  ].join('\n')
}

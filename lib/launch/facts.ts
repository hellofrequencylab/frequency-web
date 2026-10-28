// THE SOURCE SHELF, FACTS (VLS-12). A fact is something Vera arranged from a source, always with the person's own
// words as the snippet and a line saying where in the source it came from. No snippet and origin, no fact: the
// shelf quotes, it never writes. Each fact is filed under the content slot it could fill (name, tagline, intro ...)
// and stays "suggested" until the person accepts it. PURE, no imports from the app.

export const FACT_SLOTS = ['name', 'tagline', 'intro', 'story', 'contact', 'hours', 'offers', 'events', 'people', 'links'] as const
export type FactSlot = (typeof FACT_SLOTS)[number]

export const FACT_STATES = ['suggested', 'accepted', 'dismissed'] as const
export type FactState = (typeof FACT_STATES)[number]

export const FACT_LIMITS = { valueMax: 2000, snippetMax: 1000, originMax: 500 } as const

export interface FactInput {
  slot: string
  value: string
  snippet: string
  origin: string
}

export type FactCheck = { ok: true; fact: { slot: FactSlot; value: string; snippet: string; origin: string } } | { ok: false; reason: 'slot' | 'value' | 'snippet' | 'origin' | 'not_quoted' }

export function isFactSlot(v: unknown): v is FactSlot {
  return typeof v === 'string' && (FACT_SLOTS as readonly string[]).includes(v)
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** True when the snippet is the person's own words: it appears in the source text, whitespace and case aside. */
export function snippetIsQuoted(sourceText: string, snippet: string): boolean {
  const s = squash(snippet)
  return s.length > 0 && squash(sourceText).includes(s)
}

/** A fact is refused unless it has a slot, a value, a snippet and an origin; with `sourceText` it is also refused
 *  when the snippet is not found in the source (a paraphrase is not a citation). */
export function checkFact(input: FactInput, sourceText?: string): FactCheck {
  if (!isFactSlot(input.slot)) return { ok: false, reason: 'slot' }
  const value = input.value.trim()
  if (value.length < 1 || value.length > FACT_LIMITS.valueMax) return { ok: false, reason: 'value' }
  const snippet = input.snippet.trim()
  if (snippet.length < 1 || snippet.length > FACT_LIMITS.snippetMax) return { ok: false, reason: 'snippet' }
  const origin = input.origin.trim()
  if (origin.length < 1 || origin.length > FACT_LIMITS.originMax) return { ok: false, reason: 'origin' }
  if (sourceText !== undefined && !snippetIsQuoted(sourceText, snippet)) return { ok: false, reason: 'not_quoted' }
  return { ok: true, fact: { slot: input.slot, value, snippet, origin } }
}

export interface ShelfFact {
  id: string
  slot: FactSlot
  value: string
  snippet: string
  origin: string
  state: FactState
}

/** The facts grouped by the slot they could fill, dismissed ones left out, in slot order. */
export function groupBySlot(facts: readonly ShelfFact[]): { slot: FactSlot; facts: ShelfFact[] }[] {
  return FACT_SLOTS.map((slot) => ({ slot, facts: facts.filter((f) => f.slot === slot && f.state !== 'dismissed') })).filter((g) => g.facts.length > 0)
}

/** The accepted fact for a slot (the newest accepted wins), or null: what a step seeds its field from. */
export function acceptedFor(facts: readonly ShelfFact[], slot: FactSlot): ShelfFact | null {
  const accepted = facts.filter((f) => f.slot === slot && f.state === 'accepted')
  return accepted.length ? accepted[accepted.length - 1] : null
}

// The validator for Vera's voiced Dispatch line (ADR-229 P2), in a leaf module with no imports so
// it is unit-testable and loadable on its own; lib/vera-dispatch.ts (which carries the AI and
// database dependencies) calls it and re-exports it. Pure.

const MAX_COPY = 180

/** Words that name a KIND of practice (a sit, a walk, yoga, breathing...). The daily Dispatch is
 *  minted once per member per day and replayed after EVERY session that day, so a line that names
 *  an activity the fact did not give reads wrong the moment the member does something else (a
 *  voiced "Good sit, same time tomorrow." replayed after a walk). The session's own activity is
 *  named live by the reveal (fallbackSessionDispatch in lib/on-air.ts), never cached. LIVE-674. */
const ACTIVITY_WORD =
  /\b(sit|sits|sitting|sat|meditat\w*|breath\w*|journal\w*|stillness|ritual\w*|walk\w*|run|runs|running|ran|jog\w*|yoga|flow\w*|stretch\w*|strength|workout\w*|movement|hike\w*|swim\w*)\b/gi

/** The activity words `copy` names that `fact` does not (lower-cased, de-duplicated). Empty when
 *  every activity word in the line came from the fact, so a Journey titled "Morning Walk" can
 *  still be named. Pure. */
export function unstatedActivityWords(copy: string, fact: string): string[] {
  const inFact = new Set(((fact ?? '').match(ACTIVITY_WORD) ?? []).map((w) => w.toLowerCase()))
  const out = new Set<string>()
  for (const w of (copy ?? '').match(ACTIVITY_WORD) ?? []) {
    const k = w.toLowerCase()
    if (!inFact.has(k)) out.add(k)
  }
  return [...out]
}

/** Validate + tidy a voiced line so a model hiccup can never reach a member:
 *  strip wrapping quotes / "Vera:" prefixes, collapse whitespace, swap em dashes
 *  for commas (voice canon), cap length. With the `fact` the model was handed, a line
 *  that names an activity the fact did not (unstatedActivityWords) is rejected too, so
 *  the template stands. Returns null when unusable. Pure. */
export function cleanDispatchCopy(raw: string, fact?: string): string | null {
  let s = (raw ?? '').trim()
  s = s.replace(/^(vera|dispatch)\s*[:\-]\s*/i, '')
  s = s.replace(/^["'“‘]+|["'”’]+$/g, '')
  s = s.replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim()
  if (!s || s.length < 12 || s.length > MAX_COPY) return null
  if (/[\u{1F300}-\u{1FAFF}]/u.test(s)) return null // no emojis in Vera's line
  if (fact !== undefined && unstatedActivityWords(s, fact).length > 0) return null
  return s
}

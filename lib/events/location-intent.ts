// WHEN A HOST HIDES THEIR ADDRESS IN A TEXT FIELD INSTEAD OF THE CHECKBOX (ADR-1028).
//
// ── THE ROW THAT FOUND THIS ────────────────────────────────────────────────────────────────────
//
// Production, 2026-08-13. Event "Breath Is Life":
//
//     hide_address : false
//     street/city/region/postal : all NULL
//     location : "The Royal Temple (RSVP to see location)"
//
// The host said, in the only field they were looking at, that the address is shared on RSVP. The
// FLAG that actually controls that says the opposite. Two things follow, and the second one is the
// reason this module exists rather than a comment on a ticket:
//
//   1. IT NEVER GEOCODED, so it has no pin. The free-text line is handed to the geocoder verbatim,
//      parenthetical and all, and "The Royal Temple (RSVP to see location)" is not an address any
//      provider will resolve. That is the visible symptom and the smaller half.
//
//   2. 🔴 IF IT HAD GEOCODED, THE MAP WOULD HAVE PUBLISHED THE EXACT ADDRESS. `hide_address` is
//      false, so lib/nearby/map-pins.ts would have drawn a precise pin at Royal Temple's door —
//      the very address three sibling events at that venue deliberately coarsen. The missing
//      geocode is the ONLY reason this has not already leaked. A bug that is prevented by a second
//      bug is not prevented.
//
// So the fix is a pair, and shipping either half alone makes things worse:
//
//   • `stripWithholdingNote` cleans the query so the geocode can succeed.
//   • `withholdsAddress` makes that success SAFE, by treating the sentence as what it plainly is:
//     an instruction to withhold. The read path coarsens on either signal.
//
// ── WHY THE READ PATH AND NOT A DATA FIX ───────────────────────────────────────────────────────
//
// The obvious alternative is to flip `hide_address` to true on the row and move on. That is one
// host's setting, changed by us, based on our reading of their prose — and it would silently rewrite
// a privacy choice on their behalf. This module never mutates anything. It lets the READ path fail
// safe on what the host actually wrote, which needs no permission and covers every row at once,
// including the ones written tomorrow.
//
// PURE, ZERO IMPORTS. Tested as strings, importable from a server loader and a client editor alike.

/**
 * Phrases that mean "the address is not public".
 *
 * Deliberately narrow. This predicate makes a pin LESS precise, so a false positive costs a member
 * some precision on a map, while a false negative publishes an address a host meant to keep. Those
 * are not symmetric, which argues for a generous list — but every entry still has to be a phrase
 * that cannot plausibly appear in an ordinary venue name, or ordinary events start getting fuzzed
 * for no reason. "Address" alone would match "123 Address Lane"; "on request" would not match a
 * venue. Each of these names an ACT the member has to perform to receive the location.
 */
const WITHHOLDING_PATTERNS: readonly RegExp[] = [
  /\brsvp\s+(?:to|for|and|then)?\s*(?:see|get|receive|reveal|unlock)?\s*(?:the\s+)?(?:address|location|venue|details)\b/i,
  /\b(?:address|location|venue)\s+(?:is\s+)?(?:shared|sent|revealed|provided|given|disclosed|released)\s+(?:up)?on\s+(?:rsvp|signup|sign-up|registration|booking|request)\b/i,
  /\b(?:address|location|venue)\s+(?:up)?on\s+(?:rsvp|request|registration|booking|signup|sign-up)\b/i,
  /\b(?:exact|full|precise)\s+(?:address|location)\s+(?:shared|sent|given|provided|revealed)\b/i,
  /\b(?:secret|hidden|private|undisclosed)\s+location\b/i,
  /\blocation\s+(?:shared|sent|revealed)\s+after\b/i,
  /\bdetails?\s+(?:to\s+)?follow\s+(?:up)?on\s+rsvp\b/i,
]

/**
 * Does this free text say the address is withheld?
 *
 * Answers on the HOST'S OWN WORDS, whatever the `hide_address` flag happens to hold. A caller that
 * publishes a coordinate should treat `true` here exactly as it treats the flag.
 */
export function withholdsAddress(text: string | null | undefined): boolean {
  if (typeof text !== 'string') return false
  const t = text.trim()
  if (!t) return false
  return WITHHOLDING_PATTERNS.some((re) => re.test(t))
}

/**
 * The same text with the withholding note removed, for handing to a geocoder.
 *
 * "The Royal Temple (RSVP to see location)" → "The Royal Temple", which resolves. The parenthetical
 * is stripped first (that is how hosts overwhelmingly write it), then any bare trailing clause after
 * a dash, comma or bullet. Returns null when nothing usable survives, because a query of "" is worse
 * than no query: it wastes a provider round-trip on a guaranteed miss.
 *
 * ⚠️ This is for the GEOCODER ONLY. Never render the stripped string to a member: the note is the
 * host telling them how to get the address, which is exactly what they need to read.
 */
export function stripWithholdingNote(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null
  let out = text

  // Bracketed asides first: (…), […], {…} that contain a withholding phrase.
  out = out.replace(/[([{][^)\]}]*[)\]}]/g, (chunk) => (withholdsAddress(chunk) ? ' ' : chunk))

  // Then a trailing clause introduced by a separator, e.g. "Royal Temple - RSVP for Address".
  const separated = out.split(/\s+[-–—·|,]\s+/)
  if (separated.length > 1) {
    const kept = separated.filter((part, i) => i === 0 || !withholdsAddress(part))
    out = kept.join(', ')
  }

  // Finally a whole-string match with nothing else in it. EVERY pattern is tried, not just the
  // first: an earlier version reached only for the RSVP one, so "Secret location" survived intact
  // and went to the geocoder as if it were a venue name.
  if (withholdsAddress(out)) {
    for (const re of WITHHOLDING_PATTERNS) out = out.replace(re, ' ')
    out = out.replace(/\s+/g, ' ').trim()
  }

  out = out.replace(/\s+/g, ' ').replace(/^[\s,;:.\-–—]+|[\s,;:.\-–—]+$/g, '').trim()
  return out.length > 0 ? out : null
}

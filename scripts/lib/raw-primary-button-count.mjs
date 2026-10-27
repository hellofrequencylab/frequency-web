/** The unchanged source counter from the SCAN-1133 probe. It is a residue budget,
 * not evidence that every action has adopted the kit or renders accessibly.
 * @param {string[]} sources
 */
export function countRawPrimaryButtons(sources) {
  return sources.reduce((count, source) => count + (source.match(/<button[^>]*?bg-primary/gs) || []).length, 0)
}

/** Preserve the original strict <30 boundary, including its source-only limitations.
 * @param {string[]} sources
 */
export function withinRawPrimaryButtonBudget(sources) {
  return countRawPrimaryButtons(sources) < 30
}

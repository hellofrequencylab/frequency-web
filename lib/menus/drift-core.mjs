// The ONE menu-drift comparison (ADR-1134). Two instruments read it and they must never
// disagree, which is why the function lives here and nowhere else:
//
//   • scripts/maintenance/menu-drift.mjs — the weekly sweep, comparing the live `header`
//     menu against the code registry for a maintainer. Plain `node` runs it, no bundler
//     and no loader, which is why this file is a dependency-free .mjs rather than a .ts
//     module: Node 22 cannot import TypeScript, but the TypeScript side (lib/menus/drift.ts,
//     the Menu manager's per-item drift derivation) imports THIS file without ceremony.
//   • lib/menus/drift.ts — the operator-facing derivation. Its RETIRED / MISSING split for
//     absent defaults is exactly `unreachable` / `pending` below, consumed rather than
//     re-implemented, so the badge an operator reads and the finding the weekly job prints
//     come from one comparison.
//
// PURE and dependency-free on purpose: a function of two plain values, testable without a
// database, a browser, or the TypeScript parser the weekly script also carries.

/** @typedef {{ label: string, href: string }} MenuLeaf */
/** @typedef {{ items: MenuLeaf[], syncedDefaultKeys: string[] }} LiveMenu */
/** @typedef {{ label: string, expected: string, actual: string }} MislabelledFinding */
/**
 * @typedef {{
 *   mislabelled: MislabelledFinding[],
 *   unreachable: MenuLeaf[],
 *   pending: MenuLeaf[],
 *   staleBaseline: string[],
 *   ok: boolean,
 *   counts: { code: number, live: number },
 * }} MenuComparison
 */

/**
 * Compare the code-default leaves with the live rows. Four findings, in descending severity:
 *
 *   mislabelled  — a DB row whose LABEL matches a code default but whose HREF differs. The link
 *                  says one thing and lands somewhere else. Member-facing; nothing else sees it.
 *   unreachable  — a code default absent from the DB **and** already in `synced_default_keys`, so
 *                  the inserts-only sync will never bring it back. Silent, permanent.
 *   pending      — a code default absent from the DB and NOT in the baseline: the next sync adds
 *                  it. Informational, and the one finding that resolves itself.
 *   staleBaseline— a baseline key naming a default that no longer exists. Harmless to a renderer,
 *                  and it makes every future audit of this table misread.
 *
 * A DB row with no code counterpart is NOT a finding: operators are allowed to add links, and
 * calling that drift would train people to ignore this report.
 *
 * @param {MenuLeaf[]} code
 * @param {LiveMenu} live
 * @returns {MenuComparison}
 */
export function compare(code, live) {
  const byHref = new Map(live.items.map((i) => [i.href, i]))
  const byLabel = new Map()
  for (const i of live.items) if (!byLabel.has(i.label)) byLabel.set(i.label, i)
  const baseline = new Set(live.syncedDefaultKeys)
  const codeHrefs = new Set(code.map((l) => l.href))

  const mislabelled = []
  const unreachable = []
  const pending = []

  for (const leaf of code) {
    // The destination is live: nothing to say, whatever else carries this label.
    if (byHref.has(leaf.href)) continue
    // The destination is NOT live but its label is, on some other href. That row is the defect:
    // it wears the name of a page it does not go to.
    //
    // ⚠️ The `actual` href is deliberately NOT excused for being a real code default elsewhere.
    // The live 2026-08-24 row was exactly that — "Spaces directory" pointing at `/spaces`, which
    // IS the Spaces trigger's own landing — and an earlier draft of this function skipped it for
    // that reason and reported a clean sweep. Whether the wrong destination happens to be a page
    // we also link somewhere else has nothing to do with whether this link lies.
    const sameLabel = byLabel.get(leaf.label)
    if (sameLabel) {
      mislabelled.push({ label: leaf.label, expected: leaf.href, actual: sameLabel.href })
      continue
    }
    ;(baseline.has(leaf.href) ? unreachable : pending).push(leaf)
  }

  const staleBaseline = live.syncedDefaultKeys.filter((k) => !codeHrefs.has(k))

  // ⚠️ `ok` deliberately IGNORES staleBaseline and pending. Only `mislabelled` and `unreachable`
  // are member-facing: one sends a visitor to the wrong page, the other means a destination has
  // no path at all. A stale key names a default that no longer exists — it changes nothing a
  // renderer does, and it resolves itself the moment the surface is re-synced. Failing on it
  // would have made this instrument RED on the day it shipped, for five keys nobody can act on
  // usefully, and a report that is red for a harmless reason is a report people stop reading.
  const ok = mislabelled.length === 0 && unreachable.length === 0
  return { mislabelled, unreachable, pending, staleBaseline, ok, counts: { code: code.length, live: live.items.length } }
}

// Coverage and the hole baseline for the theme audit (LIVE-1850, docs/THEME-COHESION.md).
//
// Coverage is mechanical. Of the classes a block renders that some theme sheet themes, what share has a rule in
// this theme's sheet. A block with structure and no styling scores near zero. A "hole" is a block on a theme at
// or under HOLE_BELOW. The baseline lists today's holes and can only shrink: a new hole fails the audit, a fixed
// one is dropped by `--update-baseline`, and the update refuses to add anything.

/** A block on a theme scoring under this share of its themed classes is a hole (the 0.9 bar in THEME-COHESION). */
export const HOLE_BELOW = 0.9

/** Every class a stylesheet has a selector for. Strings and url() are dropped so file names do not count. */
export function selectorClasses(css: string): Set<string> {
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/url\([^)]*\)/g, '')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '')
  const out = new Set<string>()
  for (const m of clean.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(m[1])
  return out
}

export function classesOf(html: string): string[] {
  const set = new Set<string>()
  for (const m of html.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) set.add(c)
  return [...set]
}

/** Share of the block's themed classes this theme styles. Null when the block has none to measure. */
export function coverageOf(blockClasses: string[], themed: Set<string>, own: Set<string>): number | null {
  const mine = blockClasses.filter((c) => themed.has(c))
  if (!mine.length) return null
  return Number((mine.filter((c) => own.has(c)).length / mine.length).toFixed(2))
}

export const holeId = (block: string, theme: string) => `${block}@${theme}`

export function compareToBaseline(baseline: readonly string[], holes: readonly string[]) {
  const had = new Set(baseline)
  const now = new Set(holes)
  return {
    added: [...now].filter((h) => !had.has(h)).sort(),
    fixed: [...had].filter((h) => !now.has(h)).sort(),
  }
}

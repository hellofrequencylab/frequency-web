// WHICH THEME-NAMED FAMILY A BLOCK BELONGS TO (docs/THEME-COHESION.md, LIVE-1853). PURE.
//
// Seven families of blocks are named for the theme that drew them. Each family's sheet is scoped to its own theme,
// so on any other theme the blocks rendered bare. The contract skin (components/sites/contract-skin-css.ts) styles a
// family's blocks on a foreign theme, in the host's palette and faces. This module is the one place that says which
// block type belongs to which family; the site renderer marks a block's wrapper with it and the page decides which
// family sheets to send. Network is not here: its sections carry their own island (components/sites/network-css.ts).

/** The family ids are the website theme ids that own each family (the site's `data-house-theme`). */
export const SKIN_FAMILIES = ['wildheart', 'network-kit', 'temple-kit', 'temple', 'midnight', 'designer'] as const
export type SkinFamily = (typeof SKIN_FAMILIES)[number]

/** Longest prefix first: NetworkKit and TempleKit are named inside Network and Temple. */
const PREFIXES: readonly (readonly [string, SkinFamily])[] = [
  ['NetworkKit', 'network-kit'],
  ['TempleKit', 'temple-kit'],
  ['Temple', 'temple'],
  ['Midnight', 'midnight'],
  ['Designer', 'designer'],
  ['Wildheart', 'wildheart'],
]

/** The family a block type belongs to, or null for a shared block (and for Network, which is its own island). */
export function skinFamilyOf(type: string): SkinFamily | null {
  for (const [prefix, family] of PREFIXES) if (type.startsWith(prefix)) return family
  return null
}

/** Every family a page document carries a block of (nested slots included). */
export function skinFamiliesIn(doc: unknown): ReadonlySet<SkinFamily> {
  const found = new Set<SkinFamily>()
  const json = JSON.stringify(doc ?? null)
  for (const m of json.matchAll(/"type":"([A-Z][A-Za-z]+)"/g)) {
    const family = skinFamilyOf(m[1])
    if (family) found.add(family)
  }
  return found
}

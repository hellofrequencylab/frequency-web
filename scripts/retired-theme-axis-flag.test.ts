import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { retiredThemeAxisFlag, legacyThemeResourcesRetired } from './probes/retired-theme-axis-flag.mjs'
const source = readFileSync('lib/theme/design.ts', 'utf8')
it('holds the actual flag retirement and canonical selection', () => {
  expect(retiredThemeAxisFlag(source)).toBe(true)
})
it.each([
  source + '\nexport const LEGACY_THEME_AXES = false',
  source.replace('interface DesignDef {', 'interface DesignDef { legacyAxes: boolean'),
  source.replace("DEFAULT_DESIGN: DesignId = 'frequency'", "DEFAULT_DESIGN: DesignId = 'dawn'"),
  source.replace('resolveDesign(process.env.NEXT_PUBLIC_SITE_DESIGN)', "'dawn'"),
])('rejects flag or design-selection regression', (changed) => {
  expect(() => retiredThemeAxisFlag(changed)).toThrow()
})
it.each(['[data-generation="bold"] { color: red }', '.dark [data-occasion="solstice"] { color: red }'])('does not equate flag deletion with completed CSS retirement', (css) => {
  expect(legacyThemeResourcesRetired(css, false)).toBe(false)
})
it('does not equate flag deletion with the registered DAWN font retirement', () => {
  expect(legacyThemeResourcesRetired(':root { color: red }', true)).toBe(false)
})
it('accepts retired legacy resources while preserving active member skin selectors', () => {
  expect(legacyThemeResourcesRetired('[data-skin="midnight"] { color: red }', false)).toBe(true)
})

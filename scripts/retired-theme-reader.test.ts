import { existsSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { retiredThemeReader } from './probes/retired-theme-reader.mjs'

const read = (p: string) => readFileSync(p, 'utf8')
it('holds the actual reader retirement and remaining saved-data boundaries', () => {
  expect(retiredThemeReader()).toBe(true)
})
it.each([
  ['retired reader restored', 'lib/theme/server/themes.ts', 'restored'],
  ['privileged baseline entry restored', 'scripts/admin-client-baseline.txt', read('scripts/admin-client-baseline.txt') + '\nlib/theme/server/themes.ts\n'],
  ['runtime CSS reader restored', 'app/(main)/layout.tsx', read('app/(main)/layout.tsx') + '\nloadActiveThemeCss()'],
  ['runtime occasion reader restored', 'app/(main)/layout.tsx', read('app/(main)/layout.tsx') + '\nresolveActiveOccasionSlug()'],
  ['janitor gate relaxed', 'app/(main)/admin/appearance/actions.ts', read('app/(main)/admin/appearance/actions.ts').replace("await requireAdmin('janitor')", "await requireAdmin('admin')")],
  ['saved-token validation removed', 'app/(main)/admin/appearance/actions.ts', read('app/(main)/admin/appearance/actions.ts').replace('validateThemeTokens(input.tokens)', 'input.tokens')],
  ['janitor cleanup action removed', 'app/(main)/admin/appearance/actions.ts', read('app/(main)/admin/appearance/actions.ts').replace('export async function deleteTheme(', 'async function oldDeleteTheme(')],
])('rejects %s', (_, file, replacement) => {
  expect(() => retiredThemeReader({
    exists: (p: string) => p === file && file === 'lib/theme/server/themes.ts' ? true : existsSync(p),
    read: (p: string) => p === file ? replacement : read(p),
  })).toThrow()
})

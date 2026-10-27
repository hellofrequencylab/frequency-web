// HYG-185: remove only the unused DB style reader; retain janitor saved-data controls.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

/** @param {{ exists?: (path: string) => boolean, read?: (path: string) => string }} [options] */
export function retiredThemeReader({ exists = existsSync, read = (p) => readFileSync(p, 'utf8') } = {}) {
  assert.equal(exists('lib/theme/server/themes.ts'), false, 'retired privileged reader returned')
  assert(!read('scripts/admin-client-baseline.txt').split(/\r?\n/).includes('lib/theme/server/themes.ts'), 'retired privileged baseline entry returned')
  assert.doesNotMatch(read('app/(main)/layout.tsx'), /loadActiveThemeCss|resolveActiveOccasionSlug/, 'member layout restored retired DB CSS/occasion reads')
  assert.match(read('lib/theme/server/resolve.ts'), /occasion: 'none'/, 'Frequency occasion remains disabled')
  const actions = read('app/(main)/admin/appearance/actions.ts')
  assert.match(actions, /await requireAdmin\('janitor'\)/, 'saved theme actions retain the janitor gate')
  assert.match(actions, /validateThemeTokens\(input\.tokens/, 'saved token writes remain validated')
  assert.match(actions, /export async function deleteTheme\(/, 'saved-data cleanup remains available')
  assert.match(actions, /\.from\('themes'\)\.delete\(\)/, 'saved-data delete still targets themes')
  assert(exists('lib/theme/css.ts') && exists('lib/theme/validate.ts'), 'CSS formatting and saved-data validation contracts remain')
  return true
}
if (invokedDirectly(import.meta.url)) {
  retiredThemeReader()
  console.log('Unused DB theme reader retired; Frequency rendering and janitor saved-data controls retained')
}

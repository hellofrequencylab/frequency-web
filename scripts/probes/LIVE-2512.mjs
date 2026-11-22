// LIVE-2512: private themes. A theme can be private, offered only to the Spaces it is assigned to, refused on save for any
// other Space, and guarded off every public list by lib/theme/private-themes.test.ts. Reads the sources (no build).
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const style = read('lib/theme/site-style.ts')
if (!/export const PRIVATE_THEME_SITES/.test(style)) bad.push('no PRIVATE_THEME_SITES catalog in lib/theme/site-style.ts')
if (!/export function themesForSpace/.test(style)) bad.push('no themesForSpace in lib/theme/site-style.ts')
if (!/export function mayWearTheme/.test(style)) bad.push('no mayWearTheme in lib/theme/site-style.ts')
for (const file of ['lib/theme/apply-mega-theme.ts', 'lib/spaces/profile-settings.ts', 'lib/sites/editor/actions.ts']) {
  if (!/mayWearTheme\(/.test(read(file))) bad.push(`${file} saves a theme without checking mayWearTheme`)
}
for (const file of ['components/sites/editor/shell.tsx', 'components/spaces/space-branding-form.tsx']) {
  if (!/themesForSpace\(/.test(read(file))) bad.push(`${file} does not offer the Space its own private themes`)
}
if (!/spaceSlug=\{space\.slug\}/.test(read('components/sites/editor/editor-page.tsx'))) bad.push('the website editor is not told which Space it edits')
const guard = read('lib/theme/private-themes.test.ts')
if (!/never reach a public list/.test(guard)) bad.push('missing the private theme leak test')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('private themes: catalog, editor offer, save check and leak test in place')

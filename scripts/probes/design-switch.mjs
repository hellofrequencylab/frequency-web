// LIVE-908 (ADR-1737): the platform wears one design system, chosen by one setting, and every value a
// design owns can be replaced. The consequence is held at the four places it could quietly break.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (f) => readFileSync(f, 'utf8')
const css = read('app/globals.css')
const at = css.search(/^@theme inline/m)
const theme = css.slice(at, css.indexOf('\n}\n', at))

// 1. The switch is stamped on <html> statically and the design sheets load.
const layout = read('app/layout.tsx')
assert.match(layout, /data-design=\{SITE_DESIGN\}/, 'root layout stamps data-design')
assert.match(layout, /import "\.\/themes\/frequency\.css"/, 'root layout loads the Frequency sheet')
assert.match(read('lib/theme/design.ts'), /resolveDesign\(process\.env\.NEXT_PUBLIC_SITE_DESIGN\)/, 'one env setting')

// 2. Nothing a design owns is compiled into a utility as a literal.
for (const step of ['sm', 'md', 'lg', 'xl', '2xl']) {
  assert.match(theme, new RegExp(`--radius-${step}:\\s*var\\(--design-radius-${step}\\)`), `rounded-${step} reads the design layer`)
}
for (const s of ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', 'pop', 'pop-lg', 'menu']) {
  assert.match(theme, new RegExp(`--shadow-${s}:\\s*var\\(--design-shadow-${s}\\)`), `shadow-${s} reads the design layer`)
}
assert.match(theme, /--font-sans:\s*var\(--design-font-body\)/, 'font-sans reads the design layer')

// 3. A design that overrides everything switches the older layers off at every place they apply.
assert.match(read('lib/theme/server/resolve.ts'), /if \(!LEGACY_THEME_AXES\)/, 'resolver')
assert.match(read('app/(main)/layout.tsx'), /LEGACY_THEME_AXES \? await loadActiveThemeCss/, 'Theme Studio <style>')
assert.match(read('components/spaces/accent-scope.tsx'), /data-space-theme=\{LEGACY_THEME_AXES \? theme : undefined\}/, 'Space font set')

// 4. Midnight is a member theme, scoped to the design it is authored for.
assert.match(read('lib/theme/skins.ts'), /id: 'midnight'[\s\S]*?selectable: true,\s*designs: \['dawn'\]/, 'Midnight offered under DAWN')

console.log('One setting picks the design; every design-owned value is replaceable; Frequency switches the older layers off.')

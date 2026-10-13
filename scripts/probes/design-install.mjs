// LIVE-909 (ADR-1740): the Frequency design system installs from its export in one command, lives in its
// own --fq- namespace scoped to the switch, and one more command turns it on locally.
import { existsSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (f) => readFileSync(f, 'utf8')
assert.ok(existsSync('scripts/install-frequency-design.mjs'), 'the installer exists')
assert.ok(existsSync('scripts/use-design.mjs'), 'the local switch exists')
const pkg = JSON.parse(read('package.json')).scripts
assert.ok(pkg['design:install'] && pkg['design:use'], 'pnpm design:install and design:use are wired')

const core = read('app/themes/frequency/core.css')
assert.ok((core.match(/--fq-[\w-]+\s*:/g) ?? []).length > 100, 'the core carries the export vocabulary')
assert.doesNotMatch(core.replace(/\/\*[\s\S]*?\*\//g, ''), /@import|(^|[;{\s])--(?!fq-)[a-z][\w-]*\s*:/m, 'only --fq- names, no @import')
assert.ok(existsSync('design_handoff/frequency/tokens/themes.css'), 'the export is vendored')

const layout = read('app/layout.tsx')
assert.ok(layout.indexOf('import "./themes/frequency/core.css"') < layout.indexOf('import "./themes/frequency.css"'), 'core loads before aliases')
const alias = read('app/themes/frequency.css')
for (const n of ['--color-canvas', '--color-primary', '--design-font-body', '--design-radius-lg', '--design-shadow-md'])
  assert.match(alias, new RegExp(`${n}:\\s*var\\(--fq-`), `${n} points at a Frequency token`)
assert.match(read('lib/theme/design-fonts/frequency.ts'), /Unbounded[\s\S]*Instrument_Serif[\s\S]*Hanken_Grotesk|Hanken_Grotesk, Instrument_Serif, Unbounded/, 'the three faces are registered')
for (const f of ['app/(marketing)/layout.tsx', 'app/page.tsx']) assert.match(read(f), /data-surface="stage"/, `${f} is a Stage surface`)
console.log('Frequency installs from its export, stays in --fq- behind the switch, and pnpm design:use turns it on.')

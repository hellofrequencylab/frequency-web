#!/usr/bin/env node
// THEME COHESION (docs/THEME-COHESION.md): one probe, one named check per ledger row. Each reads the wiring that
// row ships, so it fails on main until the row is done. The behaviour is pinned by the row's own tests; this only
// proves the wiring exists and stays. Usage: node scripts/probes/theme-cohesion.mjs <check>
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const count = (dir, re) => (existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).length : 0)

const CHECKS = {
  audit: () => (/"audit:themes"/.test(read('package.json')) && existsSync('docs/theme-cohesion-baseline.json') ? [] : ['no audit:themes command or hole baseline']),
  defects: () => (existsSync('test/theme-cohesion-defects.render.test.tsx') ? [] : ['the three audit defects have no render test']),
  copy: () => (/live blocks stay as they are/.test(read('components/sites/editor/theme-changer.tsx')) ? ['the Theme tab still promises live blocks stay as they are'] : []),
  fallback: () => (existsSync('components/sites/contract-skin-css.ts') && /contract-skin-css/.test(read('components/sites/site-page.tsx')) ? [] : ['foreign family blocks have no contract skin on the site render']),
  palette: () => (/export function categoriesForTheme/.test(read('lib/page-editor/palette-scope.ts')) ? [] : ['the palette offers every family on every theme']),
  switchdialog: () => (/foreignBlocksFor/.test(read('components/sites/editor/theme-changer.tsx')) ? [] : ['a theme switch does not list the blocks that will change']),
  tokens: () => (existsSync('lib/theme/block-contract-tokens.ts') ? [] : ['no core token contract']),
  manifest: () => (count('lib/themes/manifests', /\.manifest\.json$/) >= 9 ? [] : ['fewer than nine theme manifests']),
  roles8: () => (count('lib/blocks/roles', /\.role\.json$/) >= 8 ? [] : ['fewer than eight role definitions']),
  roles17: () => (count('lib/blocks/roles', /\.role\.json$/) >= 17 ? [] : ['fewer than seventeen role definitions']),
  legacy: () => (existsSync('lib/blocks/roles/legacy-map.ts') && existsSync('components/sites/editor/update-layouts.tsx') ? [] : ['no legacy block to role map or no Update to new layouts action']),
  presentation: () => (count('components/sites/presentation', /\.ts$/) >= 9 ? [] : ['fewer than nine theme presentation layers']),
  staticcss: () => (existsSync('scripts/build-theme-css.mjs') ? [] : ['theme CSS is not built as static versioned files']),
  tryiton: () => (existsSync('components/sites/theme-preview-swap.tsx') ? [] : ['no instant stylesheet swap preview']),
  revalidate: () => (/export async function saveWebsiteStyle[\s\S]*?refreshSite\(auth\.space\.slug\)/.test(read('lib/sites/editor/actions.ts')) && existsSync('lib/sites/site-cache-theme.test.ts') ? [] : ['a theme change does not revalidate one Space']),
  conformance: () => (existsSync('scripts/theme-conformance.test.ts') ? [] : ['no theme conformance check']),
  catalog: () => (/manifests/.test(read('lib/themes/library.ts')) ? [] : ['the catalog is not read from the manifests']),
  intake: () => (/theme\.manifest\.json|\.manifest\.json/.test(read('scripts/ds-intake.mjs')) ? [] : ['the design-system intake does not write a manifest']),
}

const name = process.argv[2]
if (!CHECKS[name]) { console.error(`unknown check "${name}"; one of ${Object.keys(CHECKS).join(', ')}`); process.exit(2) }
const bad = CHECKS[name]()
if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log(`✓ theme cohesion: ${name}`)

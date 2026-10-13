// THE BUILD-TIME HALF OF THE DESIGN SWITCH (ADR-1737). Runs in `prebuild` and `predev`.
//
// Two things cannot read a CSS variable or a runtime constant, so they are written to disk for the
// design this build wears (NEXT_PUBLIC_SITE_DESIGN, resolved by lib/theme/design.ts itself):
//
//   1. public/manifest.json  theme_color + background_color = designDef(SITE_DESIGN).chrome.light.
//      The PWA manifest is fetched by the browser as a static file, before any CSS applies. Only the
//      two colour values are rewritten, in place, so every other byte of the file is the author's.
//   2. lib/theme/design-fonts/active.ts  one static re-export of ./<design>. app/layout.tsx imports
//      ./active, so the build graph contains ONLY the active design's next/font registrations: a DAWN
//      deploy never imports lib/theme/design-fonts/frequency.ts, and so never ships its faces.
//
// IDEMPOTENT: a file is written only when its content would change, so a DAWN build on a clean tree
// leaves the tree clean. The committed copies are DAWN's (lib/theme/design-fonts/active.test.ts).
//
// The env is read the way Next reads it (process.env first, then .env.<mode>.local, .env.local,
// .env.<mode>, .env), so a local `.env.local` with the variable set gets the same answer here as in
// the Next build that follows. Run with --experimental-strip-types (Node 22) to import design.ts.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const KEY = 'NEXT_PUBLIC_SITE_DESIGN'
const mode = process.argv.includes('--dev') ? 'development' : 'production'

function fromEnvFiles() {
  for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
    if (!existsSync(file)) continue
    const m = readFileSync(file, 'utf8').match(new RegExp(`^\\s*(?:export\\s+)?${KEY}\\s*=\\s*["']?([^"'\\s#]*)`, 'm'))
    if (m) return m[1]
  }
  return undefined
}
if (process.env[KEY] === undefined) {
  const v = fromEnvFiles()
  if (v !== undefined) process.env[KEY] = v
}

const { SITE_DESIGN, designDef } = await import('../lib/theme/design.ts')
const { light } = designDef(SITE_DESIGN).chrome

function writeIfChanged(path, next) {
  const prev = readFileSync(path, 'utf8')
  if (prev === next) return false
  writeFileSync(path, next)
  return true
}

// 1. Manifest colours.
const MANIFEST = 'public/manifest.json'
let manifest = readFileSync(MANIFEST, 'utf8')
for (const field of ['theme_color', 'background_color']) {
  const re = new RegExp(`("${field}":\\s*)"#[0-9A-Fa-f]{6}"`)
  if (!re.test(manifest)) throw new Error(`${MANIFEST}: no hex "${field}" to set`)
  manifest = manifest.replace(re, `$1"${light}"`)
}
const wroteManifest = writeIfChanged(MANIFEST, manifest)

// 2. The active font module.
const ACTIVE = 'lib/theme/design-fonts/active.ts'
if (!existsSync(`lib/theme/design-fonts/${SITE_DESIGN}.ts`)) throw new Error(`no lib/theme/design-fonts/${SITE_DESIGN}.ts`)
const active = readFileSync(ACTIVE, 'utf8').replace(/from '\.\/[a-z0-9-]+'/, `from './${SITE_DESIGN}'`)
const wroteFonts = writeIfChanged(ACTIVE, active)

console.log(
  `design assets: ${SITE_DESIGN} (manifest ${wroteManifest ? 'written' : 'unchanged'}, fonts ${wroteFonts ? 'written' : 'unchanged'})`,
)

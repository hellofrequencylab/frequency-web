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
//   3. app/themes/active/<sheet>.ts  one stub per design stylesheet (scripts/lib/design-styles.mjs).
//      Code imports the stub, never app/themes/<id>/*.css: under the active design the stub imports its
//      sheet, under any other it is empty. So a DAWN deploy's graph holds NO Frequency CSS (the root
//      layout's core + alias + members-ui, the site kit every public layout's SiteShell pulled in, the
//      members kits, the page sheets), and a Frequency deploy loads each sheet where it always did.
//
// IDEMPOTENT: a file is written only when its content would change, so a DAWN build on a clean tree
// leaves the tree clean. The committed copies are DAWN's (lib/theme/design-fonts/active.test.ts).
//
// The env is read the way Next reads it (process.env first, then .env.<mode>.local, .env.local,
// .env.<mode>, .env), so a local `.env.local` with the variable set gets the same answer here as in
// the Next build that follows. Run with --experimental-strip-types (Node 22) to import design.ts.
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync } from 'node:fs'
import { STUB_DIR, STUB_HEADER, renderStubs } from './lib/design-styles.mjs'

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

const { SITE_DESIGN, DESIGNS, designDef } = await import('../lib/theme/design.ts')
const { light } = designDef(SITE_DESIGN).chrome

function writeIfChanged(path, next) {
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : null
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

// 3. The stylesheet stubs. A stub this generator wrote whose sheet is gone is removed, so a stale import
// can never reach a build.
mkdirSync(STUB_DIR, { recursive: true })
const stubs = renderStubs(SITE_DESIGN, DESIGNS.map((d) => d.id))
let wroteStyles = 0
for (const [name, src] of Object.entries(stubs)) if (writeIfChanged(`${STUB_DIR}/${name}.ts`, src)) wroteStyles++
for (const f of readdirSync(STUB_DIR)) {
  const path = `${STUB_DIR}/${f}`
  if (f.endsWith('.ts') && !(f.slice(0, -3) in stubs) && readFileSync(path, 'utf8').startsWith(STUB_HEADER)) {
    rmSync(path)
    wroteStyles++
  }
}

console.log(
  `design assets: ${SITE_DESIGN} (manifest ${wroteManifest ? 'written' : 'unchanged'}, fonts ${wroteFonts ? 'written' : 'unchanged'}, styles ${wroteStyles ? `${wroteStyles} written` : 'unchanged'})`,
)

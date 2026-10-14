#!/usr/bin/env node
// THE LOCAL SWITCH (ADR-1737, ADR-1740): `pnpm design:use frequency` or `pnpm design:use dawn`.
// Writes NEXT_PUBLIC_SITE_DESIGN into .env.local (the one line it owns; everything else in the file is
// left as it is), then runs scripts/write-design-assets.mjs so the font module, the manifest colours and
// the stylesheet stubs follow. Restart `pnpm dev` afterwards: NEXT_PUBLIC_ values are read when the
// server starts.
//
// LOAD PER DESIGN. A design's CSS reaches the build only through app/themes/active/<sheet>.ts, one stub
// per sheet (scripts/lib/design-styles.mjs): `frequency` writes each stub as `import '../frequency/<sheet>.css'`,
// `dawn` writes every stub empty, so a DAWN build bundles no Frequency CSS at all (and no Frequency faces,
// lib/theme/design-fonts/active.ts). Switch back with `pnpm design:use dawn` before committing: the
// committed stubs are DAWN's (lib/theme/design.test.ts).
// Production is the same switch as a Vercel environment variable plus a redeploy.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const IDS = ['dawn', 'frequency']
const id = process.argv[2]
if (!IDS.includes(id)) {
  console.error(`usage: pnpm design:use <${IDS.join('|')}>`)
  process.exit(2)
}
if (id === 'frequency' && !existsSync('app/themes/frequency/core.css')) {
  console.error('The Frequency design system is not installed yet: pnpm design:install <export.zip>')
  process.exit(1)
}

const FILE = '.env.local'
const LINE = `NEXT_PUBLIC_SITE_DESIGN=${id}`
// One read, ENOENT as empty: an existsSync() check first is a check-then-use race (CodeQL js/file-system-race).
let before = ''
try {
  before = readFileSync(FILE, 'utf8')
} catch (e) {
  if (e?.code !== 'ENOENT') throw e
}
const re = /^\s*(?:export\s+)?NEXT_PUBLIC_SITE_DESIGN\s*=.*$/m
const after = re.test(before) ? before.replace(re, LINE) : `${before.replace(/\n*$/, '\n')}${LINE}\n`
if (after !== before) writeFileSync(FILE, after)

execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/write-design-assets.mjs', '--dev'], {
  stdio: 'inherit',
})
console.log(`✓ design set to ${id} in ${FILE}. Restart \`pnpm dev\` to see it.`)

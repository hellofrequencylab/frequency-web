#!/usr/bin/env node
// THE LOCAL SWITCH (ADR-1737, ADR-1740): `pnpm design:use frequency` or `pnpm design:use dawn`.
// Writes NEXT_PUBLIC_SITE_DESIGN into .env.local (the one line it owns; everything else in the file is
// left as it is), then runs scripts/write-design-assets.mjs so the font module and the manifest colours
// follow. Restart `pnpm dev` afterwards: NEXT_PUBLIC_ values are read when the server starts.
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
const before = existsSync(FILE) ? readFileSync(FILE, 'utf8') : ''
const re = /^\s*(?:export\s+)?NEXT_PUBLIC_SITE_DESIGN\s*=.*$/m
const after = re.test(before) ? before.replace(re, LINE) : `${before.replace(/\n*$/, '\n')}${LINE}\n`
if (after !== before) writeFileSync(FILE, after)

execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/write-design-assets.mjs', '--dev'], {
  stdio: 'inherit',
})
console.log(`✓ design set to ${id} in ${FILE}. Restart \`pnpm dev\` to see it.`)

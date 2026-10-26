#!/usr/bin/env node
// Frequency is the platform design. This command writes only its owned env line
// and regenerates matching assets. Retired DAWN selection is rejected before any
// filesystem read/write; historical fixtures remain independent of site activation.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const IDS = ['frequency']
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

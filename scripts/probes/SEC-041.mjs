#!/usr/bin/env node
// SEC-041: the in-app scanner and the membership join card follow only a same-origin path, by the
// one rule in lib/auth/safe-next.ts. Their own checks ("starts with one slash") let `/\evil.com`
// through, and a browser reads that as `//evil.com`.
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
const scan = read('lib/scan/resolve.ts')
const join = read('components/spaces/membership-join-card.tsx')
const fails = []
if (!/safeNextPath\(text\)/.test(scan)) fails.push('lib/scan/resolve.ts does not run a bare path through safeNextPath')
if (/text\.startsWith\('\/'\) && !text\.startsWith\('\/\/'\)\) \{\s*return \{ ok: true, path: text \}/.test(scan)) fails.push('lib/scan/resolve.ts still returns a bare path unchecked')
if (!/const returnTo = safeNextPath\(rawReturn\)/.test(join)) fails.push('membership-join-card return_to is not checked by safeNextPath')
if (fails.length) {
  console.error(`SEC-041 FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log('SEC-041 ok: scanner and join-card return path use the one same-origin rule')

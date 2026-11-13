// LIVE-2270: a member who owns a Space but has no launch row still gets the Finish setup pill while its Spotlight is
// unpublished, so closing the wizard never drops the thread. Exits 1 when the wiring is gone.
import { readFileSync } from 'node:fs'
const box = readFileSync('lib/launch/box.ts', 'utf8')
const setup = readFileSync('lib/launch/setup-box.ts', 'utf8')
const checks = [
  ['box.ts reads the space-only box when no launch is running', /if \(!active\) return await loadSpaceOnlyBox\(profileId\)/.test(box)],
  ['setup-box.ts builds it over the Space inventory', /export function spaceOnlySetupBoxView/.test(setup)],
  ['the plain checklist stays for the space-only pill', /space-only pill/.test(box)],
]
let bad = 0
for (const [l, ok] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}`); if (!ok) bad++ }
process.exit(bad ? 1 : 0)

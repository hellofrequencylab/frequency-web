import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = path => readFileSync(path, 'utf8')
const page = read('app/spaces/claim/[token]/page.tsx')
const claim = read('app/spaces/claim/[token]/claim-layout.module.css')
const shell = read('app/themes/frequency/members-shell.css')
assert(page.includes("import styles from './claim-layout.module.css'"))
assert(!page.includes('px-safe'))
assert.equal(page.match(/className=\{CLAIM_ROW\}/g)?.length, 4)
for (const value of ['--fqm-l:248px', '--fqm-r:288px', 'gap:56px', 'max-width:860px', 'max-width:1239px', 'max-width:959px', 'max-width:767px']) assert(shell.includes(value), value)
for (const [bp, reserve] of [[768,264],[960,436],[1240,648]]) {
 assert(claim.includes(`min-width: ${bp}px`))
 assert(claim.includes(`calc(100% - ${reserve}px)`))
}
assert(claim.includes('max-width: 860px'))
assert(shell.includes('.fqm-center { max-width: 1040px }'))
assert(claim.includes('min-width: 1001px'))
assert(claim.includes('min(1040px, calc(100% - 648px))'))
console.log('Claim preview uses active Frequency automatic-rail geometry')

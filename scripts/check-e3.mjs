// Editor E3 gate (PROG-E3, EDITOR-ARCHITECTURE E3). Two halves:
//   instrument  the visual suite declares a /spotlight and a /sites/ surface (§7.1, §8.1 item 2), without which
//               "zero visual diff" cannot be measured. Same read the PROG-E3 probe made before this file existed.
//   axis        defineBlock declares density as a block property. E3 widens kinds and declares density.
// `--instrument` runs the first half only (LIVE-1157); the default runs both (PROG-E3).
import { readFileSync } from 'node:fs'

const instrument = process.argv.includes('--instrument')
const problems = []

const surfaces = readFileSync('test/e2e/surfaces.ts', 'utf8')
const paths = [...surfaces.matchAll(/path:\s*[`'"]([^`'"]+)[`'"]/g)].map((m) => m[1])
const need = [
  ['Spotlight', /^\/spotlight/],
  ['Site', /^\/sites\//],
]
const missing = need.filter(([, re]) => !paths.some((p) => re.test(p))).map(([n]) => n)
if (missing.length) {
  problems.push(`the visual suite declares no baseline surface for ${missing.join(' or ')}, so a zero-visual-diff gate for E3 cannot be measured`)
}

if (!instrument) {
  const define = readFileSync('lib/entity-blocks/define-block.ts', 'utf8')
  if (!/^\s*density\??:/m.test(define)) problems.push('defineBlock declares no density property, so density is not yet a declared block property')
}

if (problems.length) {
  console.error('check:e3 — ' + problems.join('; '))
  process.exit(1)
}
console.log(`check:e3 — ${instrument ? 'the instrument is declared' : 'the instrument is declared and density is a declared block property'}.`)

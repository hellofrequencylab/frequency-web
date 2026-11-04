#!/usr/bin/env node
// LIVE-1620: a Space's own built-in Circle (its member wall) is listed on its own shelf on /circles, never
// mixed with the Circles people started on purpose. Fails when the kind goes missing, the index stops
// reading `is_space_primary`, or the body stops drawing the Space Circles shelf apart from the rest.
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')
const bad = []
if (!/'space'/.test(read('lib/circles/kind.ts')) || !/isSpacePrimary/.test(read('lib/circles/kind.ts')))
  bad.push('circleKind has no space kind keyed on isSpacePrimary')
if (!/is_space_primary/.test(read('lib/circles/index-data.ts')) || !/isSpacePrimary: c\.is_space_primary/.test(read('lib/circles/index-data.ts')))
  bad.push('the Circles index does not read is_space_primary into the card kind')
const body = read('components/frequency/members/circles/circles-body.tsx')
if (!/const near = nearAll\.filter\(\(c\) => c\.kind !== 'space'\)/.test(body)) bad.push('Space Circles are mixed into the regular Circles')
if ((body.match(/id="space-circles"/g) ?? []).length < 2) bad.push('the Space Circles shelf is missing from the default or the filtered view')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('circles space shelf: ok')

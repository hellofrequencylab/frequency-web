#!/usr/bin/env node
// LIVE-1620: a Space's member wall is never mixed in with the Circles people started on purpose on /circles.
// It used to be a Space Circle listed on its own shelf; since ADR-1938 (LIVE-2081) a Space's wall is its
// Community page and is not a Circle at all. Fails if a "space" card kind, the is_space_primary read, or a
// Space Circles shelf comes back to the Circles index.
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')
const bad = []
if (/'space'/.test(read('lib/circles/kind.ts')) || /isSpacePrimary/.test(read('lib/circles/kind.ts')))
  bad.push('circleKind has a space kind again')
if (/is_space_primary|isSpacePrimary/.test(read('lib/circles/index-data.ts')))
  bad.push('the Circles index reads a Space Circle flag again')
const body = read('components/frequency/members/circles/circles-body.tsx')
if (/space-circles|Space Circles/.test(body)) bad.push('the Circles index draws a Space Circles shelf again')
if (/is_space_primary/.test(read('lib/database.types.ts'))) bad.push('circles.is_space_primary is back in the schema')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('circles space shelf: ok')

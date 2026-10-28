#!/usr/bin/env node
// LIVE-1625 (replaces the SCAN-881 pin): a Circle that belongs to a Space keeps its own design cover, its
// own h1 and its tabs. The owning Space shows as a "Part of <Space>" pill that links to it, not as the
// Space's full header stacked above the Circle. Fails when the Space header returns to the Circle layout,
// when the shell strips the cover again under a Space, or when the owning Space is no longer resolved.
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const layout = read('app/(main)/circles/[slug]/(circle)/layout.tsx')
const shell = read('components/frequency/members/circle/circle-shell.tsx')
const bad = []
if (existsSync('components/frequency/members/space/circle-space-header.tsx') || /FqCircleSpaceHeader/.test(layout)) bad.push('the Space header is stacked above the Circle again')
if (!layout.includes('owningSpaceSlug(circle, rootSpaceId)')) bad.push('owning Space not resolved from space_id with the root excluded')
if (!/spaceLink=\{owner \?/.test(layout)) bad.push('the Circle layout does not pass the Part of Space pill')
if (/inSpace/.test(shell) || /is-plain/.test(shell)) bad.push('the shell strips the Circle cover under a Space again')
if (!shell.includes('Part of {spaceLink.name}')) bad.push('the shell lost the Part of Space pill')
if (!/className="fqc-space-pill"/.test(shell)) bad.push('the Part of Space pill is not its own kit class')
if (!/className="fqm-cl-hero fqc-cover"/.test(shell)) bad.push('the Circle cover is no longer always drawn')

if (bad.length) {
  console.error('LIVE-1625: ' + bad.join('; '))
  process.exit(1)
}
console.log('circle own cover: ok')

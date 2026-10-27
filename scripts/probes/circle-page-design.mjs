#!/usr/bin/env node
// LIVE-1510: the Circle page wears the Circles design (cover with meetups, sticky tab pill, two-column
// body with the About / How we do it / How we meet / Who's here / Channels side column).
//
// Fails when the shell stops mounting the meetups slot, the tab pill or the side column, when the layout
// stops feeding them real data, when the member-area stylesheet stops loading, or when the sheet reaches
// for a raw colour instead of a --fq-* token.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const shell = read('components/frequency/members/circle/circle-shell.tsx')
for (const needle of ['fqc-cover', 'FqCircleTabs', 'fqc-cols', 'fqc-side', 'How we do it', 'How we meet', 'Channels'])
  if (!shell.includes(needle)) bad.push(`circle-shell.tsx no longer renders ${needle}`)

const layout = read('app/(main)/circles/[slug]/(circle)/layout.tsx')
for (const needle of ['loadCirclePageFacts', 'loadMeetupPicks', 'meetups='])
  if (!layout.includes(needle)) bad.push(`the Circle layout no longer wires ${needle}`)

if (!read('components/frequency/members/circle/circle-meetups.tsx').includes('setRsvpStatus'))
  bad.push('the meetup picker no longer RSVPs through setRsvpStatus')

if (!read('app/themes/active/members-circle.ts').includes('members-circle.css'))
  bad.push('the members-circle sheet stub no longer loads the Frequency sheet')

const css = read('app/themes/frequency/members-circle.css')
if (!css.includes('.fqc-cover')) bad.push('members-circle.css lost the cover styles')
const raw = css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/g)
if (raw) bad.push(`members-circle.css uses raw colours: ${[...new Set(raw)].join(', ')}`)

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('circle page design: ok')

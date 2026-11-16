#!/usr/bin/env node
// LIVE-2315: saving an audience segment says it worked and where to find it.
//
// Fails when components/spaces/email/audience-picker.tsx saves a segment with no confirmation line
// naming it, or stops selecting the new segment from the id the create action returns.
import { readFileSync } from 'node:fs'

const bad = []
const src = readFileSync('components/spaces/email/audience-picker.tsx', 'utf8')
const save = src.split('function handleSaveSegment')[1]?.split('\n  function ')[0] ?? ''

if (!save) bad.push('handleSaveSegment is gone from the audience picker')
if (!/setSavedName\(name\)/.test(save)) bad.push('a successful save does not record the saved name')
if (!/onFilterChange\(\{ segmentId: res\.data\.id \}\)/.test(save)) bad.push('a successful save does not select the new segment')
if (!src.includes('Saved. Find &ldquo;{savedName}&rdquo; under Send to, Saved segments.'))
  bad.push('no confirmation line tells the owner where the saved segment is')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('LIVE-2315 ok: a saved segment is confirmed by name and selected')

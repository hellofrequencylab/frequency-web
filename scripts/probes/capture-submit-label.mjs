#!/usr/bin/env node
// LIVE-2317: the capture box's submit button is labelled by what it does in each mode.
//
// Fails when components/feed/capture-box.tsx labels the submit "Capture" again, or stops labelling
// Note as "Save note", Dispatch as "Send Dispatch", and every other mode as "Post".
import { readFileSync } from 'node:fs'

const bad = []
const src = readFileSync('components/feed/capture-box.tsx', 'utf8')
const line = src.match(/submitLabel=\{([^\n]*)\}\n/)?.[1] ?? ''

if (!line) bad.push('capture-box no longer passes a submitLabel to the composer')
if (/'Capture'/.test(line)) bad.push('the submit button still says "Capture"')
if (!/mode === 'dispatch' \? 'Send Dispatch'/.test(line)) bad.push('Dispatch mode is not labelled "Send Dispatch"')
if (!/mode === 'note' \? 'Save note'/.test(line)) bad.push('Note mode is not labelled "Save note"')
if (!/: 'Post'$/.test(line.trim())) bad.push('Post, Poll, Ask, Share and Photo are not labelled "Post"')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('LIVE-2317 ok: the capture submit is labelled by mode')

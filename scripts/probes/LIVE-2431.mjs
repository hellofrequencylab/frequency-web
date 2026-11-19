#!/usr/bin/env node
// A short bottom sheet sits at the bottom of a phone screen inside the member kit.
// Fails while: the shared Dialog's `bottom` panel relies on the overlay's `items-end` alone (which the
// member kit's `[data-kit="members"]` flex column turns sideways, floating the sheet mid-screen), or
// a `sheet` panel relies on `items-stretch` alone to fill the phone.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../components/ui/dialog.tsx', import.meta.url), 'utf8')
const fails = []
if (!/align === 'bottom'\s*\?\s*'mt-auto sm:my-auto'/.test(src)) fails.push('a bottom sheet is not pinned to the bottom edge with mt-auto')
if (!/align === 'sheet'\s*\?\s*'flex-1 sm:flex-none sm:my-auto'/.test(src)) fails.push('a sheet does not fill the phone in a column overlay')
if (fails.length) {
  console.log(`FAIL LIVE-2431\n- ${fails.join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2431')

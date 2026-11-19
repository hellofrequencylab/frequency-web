#!/usr/bin/env node
// Top pop-ups open near the top and side drawers open on the right at their own width in the member app.
// Fails while: the shared Dialog's `top` panel relies on the overlay's `items-start` alone (the member
// kit's `[data-kit="members"]` flex column centres it mid-screen), the `drawer` panel relies on
// `justify-end` alone (it opens full width), or the `overlay` panel does not fill its frame.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../components/ui/dialog.tsx', import.meta.url), 'utf8')
const fails = []
if (!/'mx-auto mb-auto mt-\[6vh\]'/.test(src)) fails.push('a top pop-up is not held to the top with mb-auto and centred with mx-auto')
if (!/align === 'drawer'\s*\?\s*'h-full min-h-0 self-end'/.test(src)) fails.push('a drawer does not keep to the right edge with self-end')
if (!/align === 'overlay'\s*\?\s*'min-h-0 flex-1'/.test(src)) fails.push('an overlay panel does not fill its frame')
if (fails.length) {
  console.log(`FAIL ${'LIVE-2439'}\n- ${fails.join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2439')

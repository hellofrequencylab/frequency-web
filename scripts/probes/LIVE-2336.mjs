#!/usr/bin/env node
// LIVE-2336: clicking a field in the email pop-up (CRM Marketing "New email", Space Marketing, Message
// Member) must not make the email canvas jump. Selecting a block swaps which settings tile is open in the
// left block list; with scroll anchoring on, the scroll container anchored inside that list and moved
// scrollTop by the tile's height change. The list opts out of anchor selection so the anchor is the canvas.
// Reproduced in a real browser on 2026-11-17 (canvas moved 75px on a click; 0px with the opt-out).
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const src = readFileSync(new URL('components/admin/email-studio/email-canvas-editor.tsx', root), 'utf8')
const fails = []
const aside = src.match(/<aside className="([^"]*)" aria-label="Blocks and settings">/)
if (!aside) fails.push('the left block list (aside "Blocks and settings") is missing from the email canvas editor')
else if (!/\[overflow-anchor:none\]/.test(aside[1])) fails.push('the left block list still takes part in scroll anchoring, so a field click shifts the canvas')
if (!/onMouseDown=\{\(\) => setSelectedId\(block\.key\)\}/.test(src)) fails.push('canvas click-to-select changed shape (re-check this probe)')

if (fails.length) {
  console.error(`LIVE-2336 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2336 ok: the block list opts out of scroll anchoring, so selecting a field never moves the canvas')

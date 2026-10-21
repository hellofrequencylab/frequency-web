#!/usr/bin/env node
// LIVE-1265 probe: a USB connect that the page itself abandoned (the updater took the port, or Disconnect was
// pressed) ends quietly. Before, its boot wait ran out with no answer and painted "printing but not answering"
// under a firmware update that then finished (owner, 2026-10-21). Fails on main before LIVE-1265.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const c = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/setBootStarted\(null\)\s*\n(?:\s*\/\/[^\n]*\n)*\s*if \(clientRef\.current !== next\) return(?: false)?\s*\n\s*if \(!s\)/.test(c)) {
  console.error('LIVE-1265 probe failed:\n- an abandoned connect can still report the board as not answering')
  process.exit(1)
}
console.log('LIVE-1265: an abandoned connect ends quietly')

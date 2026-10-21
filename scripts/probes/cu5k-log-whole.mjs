#!/usr/bin/env node
// LIVE-1257 probe: the CyberUnicorn device log reaches support whole. The console keeps the last 150 lines,
// the report accepts 150, and each device line is its own runtime-log line (one long line was cut off when read
// back, which hid the end of the log: the write result). Fails on main before LIVE-1257.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const a = r('lib/devices/log-actions.ts')
const c = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/const LINES_MAX = 150/.test(a)) bad.push('the report no longer takes 150 lines')
if (!/lines\.forEach\(\(line, i\) => console\.info\(`\[cu5k-log\] \$\{run\} /.test(a)) bad.push('the report no longer writes one runtime-log line per device line')
if (!/setLog\(\(prev\) => \[\.\.\.prev\.slice\(-149\)/.test(c)) bad.push('the console no longer keeps the last 150 lines')
if (bad.length) { console.error('LIVE-1257 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1257: the device log reaches support whole')

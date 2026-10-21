#!/usr/bin/env node
// LIVE-1202 probe: the CyberUnicorn console keeps waiting while the board is still printing its boot, and holds
// its own boot animation back to start with the board's. Fails on main before LIVE-1202 (a hard 40 s cut-off
// reported "printing but not answering" on a board that was merely slow to boot).
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const c = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/const BOOT_WAIT_MAX_MS = \d+/.test(c)) bad.push('the boot wait lost its cap')
if (!/t - heardAt < BOOT_QUIET_MS/.test(c)) bad.push('the boot wait no longer extends while the board prints')
if (!/setTimeout\(begin, BOOT_SYNC_DELAY_MS\)/.test(c)) bad.push('the boot animation no longer waits for the board')
if (!/until the light flashes/.test(c)) bad.push('the tap copy still promises a beep the board cannot make')
if (!/i2c_stuck\?: boolean/.test(r('lib/device/types.ts'))) bad.push('HatProbe lost i2c_stuck')
if (bad.length) { console.error('LIVE-1202 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1202: the console waits out a slow boot and starts its boot scene with the board')

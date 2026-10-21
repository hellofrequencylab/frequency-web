#!/usr/bin/env node
// LIVE-1198 probe: the CyberUnicorn live screen keeps the frame drawn since the last clear and replays it to a
// canvas that mounts after `display start`. Fails on main before LIVE-1198 (the canvas only heard new packets,
// so a still menu stayed black).
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const client = r('lib/device/client.ts')
if (!/watchScreen\(listener/.test(client)) bad.push('RpcClient has no watchScreen replay')
if (!/if \(p\[2\] === 0\) this\.screenBacklog = \[\]/.test(client)) bad.push('the backlog does not restart at fillScreen')
if (!/client\.watchScreen\(/.test(r('components/spaces/loyalty/cyberunicorn-console.tsx'))) bad.push('the mirror canvas does not replay the backlog')
if (!/screen backlog/.test(r('lib/device/protocol.test.ts'))) bad.push('the replay has no test')
if (bad.length) { console.error('LIVE-1198 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1198: the live screen replays the current frame to a late canvas')

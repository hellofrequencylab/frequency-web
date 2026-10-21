#!/usr/bin/env node
// LIVE-1263 probe: a tag command that fails on the CyberUnicorn says what the board said. DeviceError keeps the
// board's own message apart from the generic text, and the console reads that: a tap that timed out on the board
// ("No card (43 polls: ...)") read "The CyberUnicorn stopped answering" before, and a reader that took no command
// at all has its own instruction. Fails on main before LIVE-1263.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const client = r('lib/device/client.ts')
const c = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/this\.detail = message \?\? ''/.test(client)) bad.push("DeviceError no longer keeps the board's own message")
if (!/const raw = e\.detail/.test(c)) bad.push("tagProblem() no longer reads the board's own message")
if (!/case 'reader_stuck':\s*return READER_SILENT/.test(c)) bad.push('reader_stuck has no instruction')
if (!/no ack/.test(c)) bad.push('an all "no ack" timeout no longer reads as a silent reader')
if (bad.length) { console.error('LIVE-1263 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1263: a failed tap says what the board said')

#!/usr/bin/env node
// LIVE-1225 probe: the CyberUnicorn console keeps the screen stream and the RPC replies apart when bytes go
// missing. The serial port opens with a large buffer, a read error starts the demux clean, and the demux only
// takes a packet whose size fits its draw function. Fails on main before LIVE-1225 (Chrome's 255-byte default
// buffer dropped stream bytes, a stray 0xAA then swallowed RPC replies: "stopped answering", scrambled mirror).
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const w = r('lib/device/web-serial.ts')
const m = r('lib/device/screen-mirror.ts')
if (!/bufferSize: 1 << 20/.test(w)) bad.push('the serial port no longer opens with a large read buffer')
if (!/if \(demux\) demux = new ScreenDemux\(\)/.test(w)) bad.push('a read error no longer starts the demux clean')
if (!/function validPacket\(fn: number, size: number\)/.test(m) || !/if \(!validPacket\(fn, size\)\)/.test(m)) bad.push('the demux no longer checks packet sizes')
if (!/1: 13, 2: 13/.test(m)) bad.push('the fixed packet sizes are gone')
if (bad.length) { console.error('LIVE-1225 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1225: the console resyncs the screen stream instead of losing RPC replies')

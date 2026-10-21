#!/usr/bin/env node
// LIVE-1223 probe: the CyberUnicorn console's Device log has a Copy button that copies the same redacted text it
// shows, with a fallback when the Clipboard API is refused. Fails on main before LIVE-1223 (the log could only be
// selected by hand, and the owner could not copy it out of the portal).
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const c = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/function DeviceLog\(/.test(c)) bad.push('the Device log lost its component')
if (!/navigator\.clipboard\.writeText\(text\)/.test(c)) bad.push('the Copy button no longer uses the clipboard')
if (!/document\.execCommand\('copy'\)/.test(c)) bad.push('the Copy button lost its fallback')
if (!/<DeviceLog text=\{redactLog\(log\)\} \/>/.test(c)) bad.push('the copied log is no longer the redacted one')
if (!/'\/c\/\.\.\.'/.test(c)) bad.push('the log no longer cuts signed check-in links')
if (bad.length) { console.error('LIVE-1223 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1223: the Device log copies its redacted text in one tap')

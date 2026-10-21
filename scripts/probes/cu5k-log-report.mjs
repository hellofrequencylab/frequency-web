#!/usr/bin/env node
// LIVE-1224 probe: when the CyberUnicorn console shows a problem (or Copy log is pressed) it sends the device
// log to the server's runtime log, staff only and redacted, so support reads it without the owner copying text.
// Fails on main before LIVE-1224 (the log only lived in the browser tab).
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const a = r('lib/devices/log-actions.ts')
const c = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/export async function reportConsoleLog\(/.test(a)) bad.push('the log report action is gone')
if (!/await consoleStaffGate\(\)/.test(a) || !/if \(!gate\) return fail/.test(a)) bad.push('the log report is no longer staff only')
if (!/'\/c\/\.\.\.'/.test(a) || !/'\?s=\.\.\.'/.test(a)) bad.push('the server no longer cuts signed links from the log')
if (!/console\.info\(`\[cu5k-log\] \$\{run\} start/.test(a) || !/lines\.forEach\(\(line, i\) => console\.info\(`\[cu5k-log\]/.test(a)) bad.push('the log no longer lands in the runtime log under [cu5k-log], one line per device line')
if (!/if \(!problem\) return[\s\S]{0,200}reportConsoleLog\(problem, logRef\.current\)/.test(c)) bad.push('a console problem no longer sends the log')
if (!/onCopy=\{\(\) => void reportConsoleLog\(/.test(c)) bad.push('Copy log no longer sends the log')
if (bad.length) { console.error('LIVE-1224 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1224: console problems send the redacted device log to support')

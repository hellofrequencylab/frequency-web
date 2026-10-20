#!/usr/bin/env node
// LIVE-1181 probe: the CyberUnicorn console sets the plugged-in board up as a Space's counter scanner over
// USB, and forwards the scans a board with no Wi-Fi signs and sends up the cable (build plan phases 3 and
// 5; cyberpunkunicorn-os/apps/remote/PROTOCOL.md "Setup over the cable" and "Scans through the cable").
// Fails on main before LIVE-1181: the scan route took only the X-Frequency-Device secret header and the
// console spoke none of frequency.provision, system.time or frequency.relay_reply.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const cred = r('lib/devices/credentials.ts')
if (!/export function signatureMatches/.test(cred) || !/scan:v1:\$\{deviceId\}:\$\{body\}/.test(cred) || !/Buffer\.from\(storedHash, 'hex'\)/.test(cred))
  bad.push('signatureMatches does not key HMAC on the stored sha256 over "scan:v1:<id>:<body>"')
if (!/timingSafeEqual\(got, want\)/.test(cred)) bad.push('the signature compare is not constant-time')

const http = r('lib/devices/http.ts')
if (!/authenticateSignedDevice\(/.test(http) || !/signedBody/.test(http)) bad.push('admitDevice has no signed path')

const route = r('app/api/v1/devices/scan/route.ts')
if (!/request\.text\(\)/.test(route) || !/signedBody: raw/.test(route)) bad.push('the scan route does not verify the exact bytes posted')
if (!/stale_scan/.test(route) || !/RELAY_WINDOW_S/.test(route)) bad.push('a relayed scan has no clock window')
if (!/claimOnce\(/.test(route) || !/'replayed'/.test(route)) bad.push('a relayed scan has no replay guard')
for (const other of ['app/api/v1/devices/cards/route.ts', 'app/api/v1/devices/realtime-token/route.ts']) {
  if (/signedBody/.test(r(other))) bad.push(other + ' accepts a relayed signature; only scans may')
}

const store = r('lib/devices/store.ts')
for (const f of ['registerScannerFromConsole', 'describeScannerForConsole', 'revokeScannerFromConsole']) {
  const i = store.indexOf('export async function ' + f)
  if (i < 0 || !/consoleStaffGate\(\)/.test(store.slice(i, i + 400))) bad.push(f + ' is not staff-gated')
}

const ui = r('components/spaces/loyalty/cyberunicorn-console.tsx')
for (const cmd of ['frequency.provision', 'frequency.unprovision', 'frequency.relay_reply', 'system.time', 'wifi.join', 'frequency.scan']) {
  if (!ui.includes(`'${cmd}'`)) bad.push('the console never sends ' + cmd)
}
if (!/frequency\.scan_relay/.test(ui) || !/forwardScan\(/.test(ui)) bad.push('the console does not forward frequency.scan_relay')
if (!/KEEPALIVE_MS = 10000/.test(ui)) bad.push('no 10 s keepalive, so the board never sees the cable as live')

if (!/export function redactLine/.test(r('lib/device/protocol.ts')) || !/redactLine\(line\.trimEnd\(\)\)/.test(r('lib/device/client.ts')))
  bad.push('the device log can show the provision secret or a Wi-Fi password')

const fwd = r('lib/device/cable-scan.ts')
if (!/body: relay\.body/.test(fwd) || !/x-frequency-signature/.test(fwd)) bad.push('forwardScan does not post the board bytes with its signature')

if (bad.length) {
  console.error('LIVE-1181 FAIL:\n  ' + bad.join('\n  '))
  process.exit(1)
}
console.log('LIVE-1181 ok: USB scanner setup and cable scans are wired, signed, windowed and redacted.')

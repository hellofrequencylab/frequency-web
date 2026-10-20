#!/usr/bin/env node
// LIVE-1186 probe: the CyberUnicorn portal drives a board over Wi-Fi (the internet relay) and installs
// firmware over USB. Fails on main before LIVE-1186: staff could not join a relay channel, and the
// portal had neither feature.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const mig = r('supabase/migrations/20270346020000_relay_staff_join.sql')
if (!/create or replace function private\.relay_member_may_join/.test(mig)) bad.push('the staff relay join migration is missing')
else {
  if (!/get_my_web_role\(\) in \('admin', 'janitor'\)/.test(mig)) bad.push('the relay join has no staff branch')
  if (!/r\.relay_enabled/.test(mig)) bad.push('the staff branch does not require the relay to be on')
  if (!/relay_manageable_devices/.test(mig)) bad.push('the staff branch replaced the manager rule instead of adding to it')
}

const store = r('lib/devices/relay-store.ts')
for (const f of ['listRelayDevicesForStaff', 'setRelayEnabledForStaff']) {
  const i = store.indexOf('export async function ' + f)
  if (i < 0 || !/consoleStaffGate\(\)/.test(store.slice(i, i + 400))) bad.push(f + ' is not staff-gated')
}
const actions = r('lib/devices/relay-actions.ts')
if (!/^'use server'/.test(actions)) bad.push('relay-actions.ts is not a server action module')
for (const f of ['listRelayDevicesForConsole', 'setConsoleRelay']) if (!actions.includes('export async function ' + f)) bad.push(f + ' is missing')

const fw = r('lib/devices/firmware.ts')
if (!/export async function latestFirmware/.test(fw) || !/export async function fetchFirmwareApp/.test(fw)) bad.push('the firmware release reader is missing')
if (!/sha256/.test(fw)) bad.push('the firmware reader does not check sha256')
for (const p of ['app/api/devices/firmware/route.ts', 'app/api/devices/firmware/app/route.ts']) {
  const route = r(p)
  if (!route) bad.push(p + ' is missing')
  else if (!/consoleStaffGate\(\)/.test(route) || !/scannerDevicesEnabled\(\)/.test(route)) bad.push(p + ' is not staff-gated behind SCANNER_DEVICES_ENABLED')
}
const flasher = r('lib/device/flasher.ts')
if (!/export async function flashApp/.test(flasher)) bad.push('flashApp is missing')
if (!/0x10000/.test(flasher)) bad.push('the flasher does not write the app partition at 0x10000')
if (/^import [^\n]*esptool-js/m.test(flasher)) bad.push('esptool-js is imported statically (it must load only on the button)')

const ui = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/openRelayTransport\(/.test(ui)) bad.push('the portal does not open the relay transport')
if (!/setConsoleRelay\(/.test(ui)) bad.push('the portal cannot switch a relay on')
if (!/flashApp\(/.test(ui)) bad.push('the portal does not install firmware')
if (!/\/api\/devices\/firmware/.test(ui)) bad.push('the portal does not read the firmware release')

if (bad.length) {
  console.error('LIVE-1186 probe failed:\n  - ' + bad.join('\n  - '))
  process.exit(1)
}
console.log('LIVE-1186 probe: Wi-Fi remote and firmware updater are wired and staff-gated.')

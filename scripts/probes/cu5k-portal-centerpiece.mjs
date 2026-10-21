#!/usr/bin/env node
// LIVE-1193 probe: the CyberUnicorn portal puts the Unicorn's screen first (live mirror with its buttons on
// it, one progress bar), the operator console's job groups sit under their section in the sidebar, and the
// updater lets go of the USB port. Fails on main before LIVE-1193.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const nav = r('components/frequency/admin/admin-nav.tsx')
if (!/className="ad-sub ad-sub-groups"/.test(nav)) bad.push('the sidebar does not draw the active section\'s job groups')
if (!/ad-tm-row ad-tm-groups/.test(nav)) bad.push('the groups row is not marked phone-only')
const css = r('app/themes/frequency/admin-shell.css')
if (!/\.ad-tm-groups\{display:none\}/.test(css)) bad.push('the groups row still shows on a wide screen')
if (!/\.ad-topmenu\{[^}]*surface-card\) 9[5-9]%/.test(css)) bad.push('the top menu is see-through again (ghost text)')
if (!/<Link href="\/feed" className="ad-logo"/.test(r('components/frequency/admin/admin-shell.tsx'))) bad.push('the console wordmark does not go to the Feed')

const ui = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/function ScreenControls/.test(ui) || !/<ScreenControls/.test(ui)) bad.push('the live screen has no on-screen buttons')
if (!/const \[wantMirror, setWantMirror\] = useState\(true\)/.test(ui)) bad.push('the live screen is not on by default once linked')
if (!/progress=\{screenProgress\}/.test(ui)) bad.push('the boot screen does not carry the real progress')
if (/<RainbowBar value=\{flash\./.test(ui) || /<RainbowBar value=\{bootStarted/.test(ui)) bad.push('a second progress bar is back beside the screen')
if (!/headless/.test(r('app/(main)/admin/cyberunicorn/page.tsx'))) bad.push('the portal page head takes room above the Unicorn')
if (!/progress\?: \(\) =>/.test(r('lib/theme/cu-boot-scene.ts'))) bad.push('the boot scene cannot show real progress')

const serial = r('lib/device/web-serial.ts')
if (!/export async function releasePort/.test(serial) || !/await releasePort\(port\)\n  try \{/.test(serial)) bad.push('connecting does not release a port this page left open')
if ((r('lib/device/flasher.ts').match(/await releasePort\(port\)/g) ?? []).length < 2) bad.push('the updater does not release the port before and after writing')

if (bad.length) { console.error('LIVE-1193 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1193: the Unicorn leads the portal, groups sit in the sidebar, and the updater lets go of the port')

#!/usr/bin/env node
// LIVE-1187 probe: the operator console draws the active section's pages as a menu across the top of every
// page. Fails on main before LIVE-1187: the pages sat only in the sidebar on a wide screen.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []

const nav = r('components/frequency/admin/admin-nav.tsx')
if (!/export function AdminTopMenu/.test(nav)) bad.push('AdminTopMenu is missing')
if (!/menuGroups\(item\)/.test(nav)) bad.push('the top menu no longer groups pages by their job heading')
if (!/!topMenu && !!item\.children/.test(nav)) bad.push('the sidebar no longer yields the pages to the top menu')
if (!/export function menuGroups/.test(r('components/frequency/admin/nav-model.ts'))) bad.push('menuGroups is missing')
if (!/<AdminTopMenu items=\{items\} \/>/.test(r('components/frequency/admin/admin-shell.tsx'))) bad.push('the shell does not mount the top menu')
if (!/^\s+topMenu$/m.test(r('components/frequency/admin/admin-console.tsx'))) bad.push('the operator console does not turn the top menu on')
if (!/\.ad-topmenu\{position:sticky/.test(r('app/themes/frequency/admin-shell.css'))) bad.push('the top menu has no sticky style')

if (bad.length) { console.error('LIVE-1187 probe failed:\n- ' + bad.join('\n- ')); process.exit(1) }
console.log('LIVE-1187: the operator top menu is wired')

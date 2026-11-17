#!/usr/bin/env node
// LIVE-2343: Your Space (owners) and Create sit at the top of the member left menu, on the desktop rail
// and the phone drawer (owner, 2026-11-17, picked on a card: "Your Space and Create at the top").
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const fails = []
const nav = read('components/frequency/members/shell/nav.ts')
if (!/export function liftTopGroups/.test(nav)) fails.push('nav.ts has no liftTopGroups')
const shell = read('components/frequency/members/shell/members-shell.tsx')
const full = shell.indexOf('className="fqm-create"')
const sc = shell.indexOf('className="fqm-sc"')
const door = shell.indexOf('className="fqm-door"')
const circles = shell.indexOf('Your Circles')
if (full < 0 || sc < 0 || full > sc) fails.push('the desktop rail does not open with Create')
if (door < 0 || door < sc || door > circles) fails.push('Your Space is not the first row of the rail shortcuts')
const header = read('components/frequency/members/shell/header.tsx')
const top = header.indexOf("spaceDoor && row(spaceDoor.href")
const firstGroup = header.indexOf("first.label === 'Home' && row(")
if (top < 0 || firstGroup < 0 || top > firstGroup) fails.push('the phone drawer does not open with Your Space and Create')

if (fails.length) {
  console.error(`LIVE-2343 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2343 ok: Your Space and Create lead the rail and the phone drawer')

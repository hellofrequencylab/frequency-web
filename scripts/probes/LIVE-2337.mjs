#!/usr/bin/env node
// LIVE-2337: a member or Space team member finds their own events from their console. Checks the
// consequence in source:
//   1. /events/mine exists and lists Going, Hosting and each operated Space's events.
//   2. The Events page links to it (header for signed-in members, and the host box), and the host box no
//      longer sends members to the host-gated /admin/events.
//   3. The Events hub row, the site map and the Space console link to it.
//   4. /events/mine is never rewritten to the member event page as if "mine" were an event slug.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []

const page = 'app/(main)/events/mine/page.tsx'
if (!existsSync(new URL(page, root))) fails.push(`${page} is missing`)
else {
  const src = read(page)
  for (const t of ['title="Going"', 'title="Hosting"', 'loadMyEvents(', 'listOperatedSpaces(']) {
    if (!src.includes(t)) fails.push(`My events page lacks ${t}`)
  }
}
const body = read('components/frequency/members/events/events-body.tsx')
if (!/myProfileId && \([\s\S]{0,80}href="\/events\/mine"/.test(body)) fails.push('the Events header has no My events link for members')
const box = read('components/frequency/members/events/events-add-box.tsx')
if (!box.includes('href="/events/mine"')) fails.push('the Events host box has no My events link')
if (box.includes('href="/admin/events"')) fails.push('the Events host box still sends members to the host-gated /admin/events')
if (!/'\/events': \[[\s\S]{0,200}href: '\/events\/mine'/.test(read('components/frequency/members/shell/nav.ts'))) fails.push('the Events hub row has no My events link')
if (!read('components/frequency/members/site-map/site-map-body.tsx').includes("href: '/events/mine'")) fails.push('the site map has no My events link')
if (!read('components/frequency/admin/space-console.tsx').includes("href: '/events/mine'")) fails.push('the Space console has no My events link')
if (!/RESERVED = new Set\(\[[^\]]*'mine'/.test(read('lib/nav/member-event-rewrite.ts'))) fails.push('/events/mine would be rewritten as an event slug')

if (fails.length) {
  console.error(`LIVE-2337 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2337 ok: My events is a page and every console reaches it')

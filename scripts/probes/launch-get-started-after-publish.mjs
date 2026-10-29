#!/usr/bin/env node
// LIVE-1879: after Publish, Get Started is the launch overview's own to-do, not a second list.
//
// Runs lib/launch/overview.ts and get-started.ts under node and reads the inventory, rail and Feed sources.
// Fails when the post-publish list draws different numbers than the launch overview, when a done item loses its
// found evidence, when an open item has no way in, when the rail or the Feed stop reading the one list, or when the
// box reaches for a raw colour or an inline font size.
import { readFileSync } from 'node:fs'
import { overviewProgress } from '../../lib/launch/overview.ts'
import { getStartedView, isPublished } from '../../lib/launch/get-started.ts'

const bad = []
// inventory.ts reaches for the app's path aliases, so node cannot load it: the sections are written out here in the
// same shape (ids included) and the source is read for the ones that matter.
const item = (id, state, found) => ({ id, label: id, state, found })
const sec = (id, ...items) => ({ id, title: id, items })
const build = (done) => [
  sec('spotlight', item('sp-live', 'done', 'Daniel Tyack is live.'), item('sp-words', done ? 'done' : 'todo', done ? '"words"' : undefined)),
  sec('space', item('sc-name', 'done', 'Daniel Tyack'), { ...item('sc-logo', done ? 'done' : 'todo'), photo: true }),
  sec('website', item('w-site', done ? 'done' : 'todo')),
  sec('email', item('e-people', done ? 'done' : 'todo')),
  sec('schedule', item('c-first', done ? 'done' : 'todo')),
  sec('circle', item('ci-first', done ? 'done' : 'todo')),
  sec('journey', item('j-first', done ? 'done' : 'todo')),
  sec('paid', item('p-ready', done ? 'done' : 'todo')),
]
const inv = readFileSync('lib/launch/inventory.ts', 'utf8')
for (const id of ["id: 'circle'", "id: 'journey'", "id: 'paid'", "id: 'schedule'", "id: 'email'", "id: 'website'"]) if (!inv.includes(id)) bad.push(`inventory.ts has no ${id} section`)
if (!/rows\.circleCount > 0/.test(inv) || !/rows\.journeyCount > 0/.test(inv) || !/rows\.payoutsReady/.test(inv)) bad.push('the Circle, Journey and Get paid items do not read real rows')

const sections = build(false)
const p = overviewProgress(sections)
const v = getStartedView(sections)
if (!isPublished(sections)) bad.push('a published Spotlight does not hand over the list')
if (isPublished([sec('spotlight', item('sp-live', 'todo'))])) bad.push('an unpublished Spotlight hands over the list')
if (v.done !== p.done || v.total !== p.total || v.ratio !== p.ratio) bad.push('Get Started counts differ from the launch overview (two sets of numbers)')
for (const id of ['circle', 'journey', 'paid', 'schedule', 'email', 'website']) if (!v.sections.some((x) => x.id === id)) bad.push(`the ${id} section is missing from the list`)
if (v.todo.some((i) => !i.href.startsWith('/launch/step/'))) bad.push('an open item has no way in')
if (!v.found.some((i) => i.id === 'sp-live' && i.found)) bad.push('a done item lost its found evidence')
if (!v.todo.some((i) => i.id === 'c-first')) bad.push('the first event is not a check-off item')
if (!getStartedView(build(true)).complete) bad.push('everything done does not read as complete')

const rail = readFileSync('components/frequency/members/shell/right-rail.tsx', 'utf8')
const feed = readFileSync('components/frequency/members/feed/feed-body.tsx', 'utf8')
if (!/loadPostPublishList\(profileId\)/.test(rail) || !/LaunchGetStartedBox/.test(rail)) bad.push('the rail does not read the one list after Publish')
if (!/launchGetStartedCounts/.test(rail)) bad.push('the micro rail draws its own numbers')
if (!/loadPostPublishList\(profileId\)/.test(feed) || !/LaunchGetStartedBox/.test(feed)) bad.push('the Feed inline copy does not read the one list after Publish')
const box = readFileSync('components/launch/launch-get-started.tsx', 'utf8')
if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(box)) bad.push('the box uses a raw colour')
if (/fontSize/.test(box)) bad.push('the box sets an inline font size')
if (!/EmptyState/.test(box)) bad.push('there is no empty state for everything done')

if (bad.length) { console.error(bad.map((b) => `✗ ${b}`).join('\n')); process.exit(1) }
console.log('✓ Get Started after Publish is the launch overview list: one set of numbers, real rows, found evidence, tokened')

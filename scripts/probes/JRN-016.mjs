#!/usr/bin/env node
// JRN-016: taking a Journey reads clean. Checks the consequence in source:
//   1. Journey mode (learn, play, guide, welcome) folds the right rail on arrival.
//   2. A heading's action buttons stay one row (`.head>div.row`), not a stacked column.
//   3. A phase titled "Week 1 · The Engine" is not rendered "Week 1 · Week 1 · The Engine".
//   4. The course page draws the Journey's cover photo.
import { readFileSync } from 'node:fs'
const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []
if (!/export function isJourneyMode/.test(read('lib/layout/page-chrome.ts'))) fails.push('no Journey mode rule')
const rails = read('components/frequency/members/shell/rail-layout.tsx')
if (!/isJourneyMode\(pathname\)/.test(rails) || !/data-r=\{rMode\}/.test(rails)) fails.push('the right rail does not fold in Journey mode')
if (!/\.head>div\.row\{flex-direction:row/.test(read('app/themes/frequency/kit-members.css'))) fails.push('heading actions still stack')
const body = read('components/frequency/members/journey/journey-course-body.tsx')
if (!/startsWith\(label\.toLowerCase\(\)\)/.test(body)) fails.push('a phase title that leads with its label is doubled')
if (!/coverImage \?/.test(body) || !/coverImage=\{plan\.cover_image/.test(read('app/(main)/journeys/[slug]/learn/page.tsx'))) fails.push('the course page has no cover photo')
if (fails.length) { console.error('JRN-016 FAIL\n- ' + fails.join('\n- ')); process.exit(1) }
console.log('JRN-016 ok: Journey mode folds the rail, heading actions are one row, week titles are not doubled, the course page has its cover')

#!/usr/bin/env node
// JRN-020: the course page says each thing once, under the right name. Checks the consequence in source:
//   1. The header meta line no longer repeats the headcount the On this Journey panel already shows.
//   2. A Frequency course reads "Creator Lab · Course" above its title; other Journeys keep "The Quest · Journey".
import { readFileSync } from 'node:fs'
const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []
const body = read('components/frequency/members/journey/journey-course-body.tsx')
const page = read('app/(main)/journeys/[slug]/learn/page.tsx')
if (/metaParts\.push\(.*on this Journey/.test(body)) fails.push('the header meta line repeats the headcount')
if (!/OnThisJourneyPanel[^>]*adoptCount=/.test(page)) fails.push('the On this Journey panel lost its headcount')
if (!/kicker=\{eyebrow\}/.test(body) || !/eyebrow = 'The Quest · Journey'/.test(body)) fails.push('the course page cannot take its own eyebrow')
if (!/isCourse\(/.test(page) || !/'Creator Lab · Course'/.test(page)) fails.push('a Frequency course still reads "The Quest · Journey"')
if (fails.length) { console.error('JRN-020 FAIL\n- ' + fails.join('\n- ')); process.exit(1) }
console.log('JRN-020 ok: the headcount shows once, and a Frequency course reads "Creator Lab · Course"')

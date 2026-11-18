#!/usr/bin/env node
// JRN-010: finishing the last lesson of ANY Journey (not only a ranked one) stamps the member's enrolment
// complete, so the seat frees and the phase and prompt notices stop (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const fails = []
const learn = read('app/(main)/journeys/[slug]/learn/actions.ts')
const at = learn.indexOf('export async function completeJourneyLessonAction(')
const body = at < 0 ? '' : learn.slice(at, learn.indexOf('\nexport ', at + 10))
if (!/journey_complete'\)\)\s*await stampEnrollmentComplete\(caller\.id, planId\)/.test(body)) fails.push('completeJourneyLessonAction fires journey_complete but never stamps journey_enrollments.completed_at')
const runs = read('lib/journeys/runs.ts')
if (!/export async function stampEnrollmentComplete[\s\S]{0,400}completed_at[\s\S]{0,300}\.is\('completed_at', null\)/.test(runs)) fails.push('lib/journeys/runs.ts has no idempotent stampEnrollmentComplete')

if (fails.length) {
  console.error(`JRN-010 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-010 ok: finishing a Journey stamps the enrolment complete')

#!/usr/bin/env node
// JRN-013: the Journey editor only adds a block under a parent of the same Journey, and only links a
// practice the author may use (Journey audit 2026-11-17).
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => {
  const u = new URL(`../../${p}`, import.meta.url)
  return existsSync(u) ? readFileSync(u, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : ''
}
const body = (src, sig) => {
  const at = src.indexOf(sig)
  if (at < 0) return ''
  const end = src.indexOf('\nexport ', at + 10)
  return src.slice(at, end < 0 ? undefined : end)
}
const fails = []
const src = read('app/(main)/journeys/[slug]/edit/actions.ts')
for (const fn of ['addModuleAction', 'addLessonAction', 'addExtraCreditAction', 'addPracticeBlockAction']) {
  if (!/parentInPlan\(admin, a\.planId/.test(body(src, `export async function ${fn}(`))) fails.push(`${fn} trusts a client parent id from any Journey`)
}
for (const fn of ['addPracticeBlockAction', 'setBlockPracticeAction']) {
  if (!/loadUsablePractice\(/.test(body(src, `export async function ${fn}(`))) fails.push(`${fn} links any practice, including another member's private draft`)
}

if (fails.length) {
  console.error(`JRN-013 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-013 ok: editor blocks stay inside their Journey and link only usable practices')

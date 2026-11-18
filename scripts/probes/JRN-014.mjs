#!/usr/bin/env node
// JRN-014: Journey polish from the audit (2026-11-17): an unlisted Journey reads as live in the
// editor, every create road goes through the governed write, a failed guide template does not leave
// a half skeleton, and the HowTo schema lists real steps with the Journey's own cover.
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

const builder = read('components/journey/v2/journey-builder.tsx')
if (!/const live = [^\n]*'unlisted'/.test(builder)) fails.push('the editor offers Publish again on an unlisted (already live) Journey')

const create = read('app/(main)/journeys/create-actions.ts')
if (!/proposeAndConfirmCreate\(/.test(body(create, 'export async function createMasterFrameworkAction('))) fails.push('the Master Framework road writes the plan outside the governed create')

const guide = read('app/(main)/journeys/[slug]/guide/actions.ts')
if (!/\{ data, error \} = await admin\s*\.from\('journey_plan_items'\)\s*\.insert/.test(guide) || !/\.delete\(\)\.in\('id', landed\)/.test(guide)) fails.push('a failed guide template insert is ignored and leaves a half skeleton')

const jsonld = body(read('lib/jsonld.ts'), 'export function journeySchema(')
if (!/isContainerBlock\(/.test(jsonld)) fails.push('the HowTo schema lists phases and modules as steps')
if (!/plan\.cover_image/.test(jsonld)) fails.push('the HowTo schema ignores the Journey cover')

if (fails.length) {
  console.error(`JRN-014 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('JRN-014 ok: unlisted reads live, governed create, guarded template, real HowTo steps')

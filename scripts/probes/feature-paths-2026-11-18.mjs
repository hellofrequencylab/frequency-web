#!/usr/bin/env node
// The feature-path wiring scan of 2026-11-18 (project thread "Verify every feature path end to end"). One
// probe per finding: `node scripts/probes/feature-paths-2026-11-18.mjs <ID>`. Each reads source with comments
// stripped and checks the consequence the row names. Exit 1 (FAIL) while the defect stands.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const read = (p) => (has(p) ? readFileSync(new URL(p, root), 'utf8') : '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const PROBES = {
  // The post composer's Share kind offers the Journeys a member follows. journey_enrollments is deny-all
  // under RLS (no policies), so a session-client read of it always returns nothing.
  'LIVE-2356': () => {
    const f = []
    const src = read('lib/feed/shareables.ts')
    const action = read('app/(main)/feed/actions.ts')
    if (!src) return ['lib/feed/shareables.ts is missing']
    const at = src.indexOf(".from('journey_enrollments')")
    if (at < 0) f.push('shareables no longer reads journey_enrollments')
    else {
      const head = src.slice(Math.max(0, at - 80), at)
      if (/\bsupabase\s*$/.test(head.trimEnd())) f.push('journey_enrollments is still read through the session client, which RLS denies')
    }
    if (!/\.eq\('profile_id', profileId\)[\s\S]{0,200}\.from\('journey_enrollments'\)|\.from\('journey_enrollments'\)[\s\S]{0,200}\.eq\('profile_id', profileId\)/.test(src)) f.push('the journey_enrollments read is not pinned to the caller profileId')
    if (!/listShareablesFor\(profileId, createAdminClient\(\)\)/.test(action)) f.push('listShareables does not hand shareables a reader that can see journey_enrollments')
    return f
  },
  // Every secret the draft links sign with is documented, so an operator can set it apart from the
  // unsubscribe secret instead of discovering the shared fallback only after a rotation.
  'HYG-246': () => {
    const f = []
    const io = read('lib/create-space/draft-io.ts')
    const example = has('.env.example') ? readFileSync(new URL('.env.example', root), 'utf8') : ''
    for (const name of io.match(/'[A-Z][A-Z0-9_]+_SECRET'/g) ?? []) {
      const key = name.slice(1, -1)
      if (!new RegExp(`^${key}=`, 'm').test(example)) f.push(`${key} is read by draft-io.ts but missing from .env.example`)
    }
    return f
  },
}

const id = process.argv[2]
const probe = PROBES[id]
if (!probe) {
  console.error(`unknown id ${id}; known: ${Object.keys(PROBES).join(', ')}`)
  process.exit(2)
}
const fails = probe()
if (fails.length) {
  for (const x of fails) console.log(`FAIL ${id}: ${x}`)
  process.exit(1)
}
console.log(`PASS ${id}`)

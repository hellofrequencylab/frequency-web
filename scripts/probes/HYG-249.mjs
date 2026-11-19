#!/usr/bin/env node
// HYG-249: segment snapshots read every member_traits row, and a failed read is not an empty segment.
// PostgREST caps an unranged select at 1000 rows; production holds ~1,718 member_traits rows, so the
// unpaged read dropped members from segment counts and campaign audiences, and `data ?? []` turned a
// read error into "nobody matches". Passes while loadMemberSnapshots pages member_traits with .range()
// and a read error throws.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../lib/traits/segments.ts', import.meta.url), 'utf8')
const start = src.indexOf('export async function loadMemberSnapshots')
const end = src.indexOf('\nexport ', start + 10)
const fn = start === -1 ? '' : src.slice(start, end === -1 ? undefined : end)

const problems = []
if (!fn) problems.push('loadMemberSnapshots is missing from lib/traits/segments.ts')
else {
  const traits = fn.slice(fn.indexOf("'member_traits'"), fn.indexOf("'member_traits'") + 600)
  if (!/\.range\(/.test(traits)) problems.push('the member_traits read is not paged with .range()')
  if (!/\.order\(/.test(traits)) problems.push('the member_traits pages have no stable order')
  if (/traitRows \?\? \[\]/.test(fn)) problems.push('a failed member_traits read still falls back to an empty list')
  const pager = /readAllSnapshotRows\(/.test(fn)
  if (pager && !/log\.error\('segments\.snapshot_read_failed'[\s\S]{0,200}throw new Error/.test(src)) {
    problems.push('the snapshot pager does not log and throw on a read error')
  }
  if (!pager) problems.push('loadMemberSnapshots does not read through the paging helper')
}

if (problems.length) {
  console.error(`HYG-249 FAIL\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('HYG-249 ok: member_traits is read a page at a time and a read error throws')

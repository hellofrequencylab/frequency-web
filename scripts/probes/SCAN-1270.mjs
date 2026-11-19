#!/usr/bin/env node
// SCAN-1270: a public course page, its Course markup, the catalog's next date and the Week 1 email only ever name
// a session anyone can open. Both service-role reads of a course's linked events filter on public visibility, as
// the course's .ics already does.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const publicOnly = (file) => {
  const src = readFileSync(file, 'utf8')
  const reads = src.split(".from('events')").slice(1).map((s) => s.slice(0, s.indexOf('.order(')))
  assert.ok(reads.length > 0, `${file} reads events`)
  for (const r of reads) assert.ok(r.includes(".eq('visibility', 'public')"), `${file}: a course session read is not limited to public events`)
}
publicOnly('lib/courses/course-context.ts')
publicOnly('lib/courses/library.ts')
console.log('SCAN-1270: course pages list public sessions only')

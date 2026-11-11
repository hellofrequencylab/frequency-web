#!/usr/bin/env node
// LIVE-2259: FlowWeb reply drafts link to /for/teacher, /for/studio, /for/venue, /for/music, /for/gathering and
// /for/maker. Fails when next.config.ts stops sending one of them to a live /for door.
import { readFileSync } from 'node:fs'
const s = readFileSync('next.config.ts', 'utf8')
const want = {
  teacher: 'coaches-and-healers',
  studio: 'studios',
  venue: 'venues',
  music: 'event-hosts',
  gathering: 'clubs-and-groups',
  maker: 'local-businesses',
}
const missing = Object.entries(want).filter(
  ([from, to]) => !s.includes(`source: '/for/${from}', destination: '/for/${to}'`),
)
if (missing.length) {
  console.error('no redirect for: ' + missing.map(([f]) => `/for/${f}`).join(', '))
  process.exit(1)
}
console.log('ok: six FlowWeb short doors land on live /for pages')

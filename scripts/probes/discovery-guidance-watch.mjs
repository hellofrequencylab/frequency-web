import assert from 'node:assert/strict'
import { GUIDANCE_SOURCES, parseGuidanceWatchState, runGuidanceWatch } from '../../lib/ai/discovery-guidance-watch.ts'
// Actual source with inert storage and HTTP. No external reads, test runner or publication.
let state = parseGuidanceWatchState(null)
let changed = false
let unavailable = false
const deps = {
  read: async () => structuredClone(state),
  write: async value => { state=structuredClone(value) },
  exhausted: () => false,
  now: () => new Date('2026-10-26T12:00:00Z'),
  fetch: async url => {
    if (unavailable) return null
    const source = GUIDANCE_SOURCES.find(item => item.url === url)
    assert.ok(source, 'Only fixed official URLs may be fetched')
    return { status:200, finalUrl:url, headers:{'content-type':'text/html'}, body:Buffer.from(`<main><h1>${source.heading}</h1><p>${'Documented public facts. '.repeat(20)}${changed?'Changed guidance detail.':''}</p></main>`) }
  },
}
assert.ok((await runGuidanceWatch(deps)).report.every(source=>source.status==='baseline'))
assert.ok((await runGuidanceWatch(deps)).report.every(source=>source.status==='unchanged'))
changed=true
assert.ok((await runGuidanceWatch(deps)).report.every(source=>source.status==='review_required'))
const successful=structuredClone(state)
unavailable=true
const failed=await runGuidanceWatch(deps)
assert.equal(failed.errors,GUIDANCE_SOURCES.length)
for(const source of GUIDANCE_SOURCES){assert.equal(state.sources[source.id].lastSuccess,successful.sources[source.id].lastSuccess);assert.equal(state.sources[source.id].baselineDigest,successful.sources[source.id].baselineDigest);assert.equal(state.sources[source.id].reviewRequired,true);assert.equal(state.sources[source.id].lastError,'source_unavailable')}
console.log('ok: actual fixed-source watch distinguishes first baseline, unchanged, human review and source failure while preserving last successful evidence (inert IO).')

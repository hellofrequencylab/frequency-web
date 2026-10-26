import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GUIDANCE_SOURCES, guidanceDigest, parseGuidanceWatchState, runGuidanceWatch, type GuidanceWatchState } from './discovery-guidance-watch'
const at = new Date('2026-10-26T12:00:00Z')
const html = (heading: string, extra = '') => `<main><h1>${heading}</h1><p>${'Official documented facts and details. '.repeat(10)}${extra}</p></main>`
let state: GuidanceWatchState
const fetch = vi.fn(), write = vi.fn()
const deps = () => ({ read: async () => structuredClone(state), write: async (next: GuidanceWatchState) => { write(next); state=structuredClone(next) }, fetch, exhausted: () => false, now: () => at })
beforeEach(() => { vi.resetAllMocks(); state={ version:1, sources:{} }; fetch.mockImplementation(async (url: string) => { const source=GUIDANCE_SOURCES.find(item=>item.url===url)!; return {status:200, finalUrl:url, headers:{'content-type':'text/html; charset=utf-8'}, body:Buffer.from(html(source.heading))} }) })
describe('fixed public guidance watch', () => {
  it('establishes a baseline without calling it a policy change and reads only allowlisted sources', async () => {
    const result=await runGuidanceWatch(deps())
    expect(result.report.map(item=>item.status)).toEqual(['baseline','baseline','baseline'])
    expect(fetch.mock.calls.map(args=>args[0])).toEqual(GUIDANCE_SOURCES.map(source=>source.url))
    expect(Object.values(state.sources).every(source=>source.lastSuccess===at.toISOString() && !source.reviewRequired)).toBe(true)
    expect(JSON.stringify(state)).not.toContain('Official documented')
  })
  it('flags changes for review and never silently acknowledges them on later runs', async () => {
    await runGuidanceWatch(deps())
    const original=state.sources.google_ai_features.baselineDigest
    fetch.mockImplementation(async (url: string) => ({status:200, finalUrl:url, headers:{'content-type':'text/html'}, body:Buffer.from(html(GUIDANCE_SOURCES.find(item=>item.url===url)!.heading,'Added factual detail.'))}))
    expect((await runGuidanceWatch(deps())).report.every(item=>item.status==='review_required')).toBe(true)
    expect(state.sources.google_ai_features.baselineDigest).toBe(original)
    expect(state.sources.google_ai_features.latestDigest).not.toBe(original)
    expect((await runGuidanceWatch(deps())).report[0].status).toBe('review_required')
  })
  it('keeps last successful evidence through transport errors and distinguishes attempts', async () => {
    await runGuidanceWatch(deps())
    const prior=structuredClone(state.sources.google_ai_features)
    fetch.mockResolvedValue(null)
    const later=new Date(at.getTime()+86400000)
    const result=await runGuidanceWatch({...deps(),now:()=>later})
    expect(result.errors).toBe(3)
    expect(state.sources.google_ai_features).toEqual({...prior,lastAttempt:later.toISOString(),lastError:'source_unavailable'})
  })
  it('does not baseline a redirect, oversized response, wrong media type or missing article', async () => {
    for (const response of [
      {status:302,finalUrl:'https://elsewhere.example',headers:{'content-type':'text/html'},body:Buffer.from('redirect')},
      {status:200,finalUrl:GUIDANCE_SOURCES[0].url,headers:{'content-type':'application/json'},body:Buffer.from('{}')},
      {status:200,finalUrl:GUIDANCE_SOURCES[0].url,headers:{'content-type':'text/html'},body:Buffer.alloc(524289)},
      {status:200,finalUrl:GUIDANCE_SOURCES[0].url,headers:{'content-type':'text/html'},body:Buffer.from('<body>Enable JavaScript</body>')},
    ]) {
      state={version:1,sources:{}};fetch.mockResolvedValue(response)
      const result=await runGuidanceWatch(deps())
      expect(result.report[0].status).toBe('unavailable')
      expect(state.sources.google_ai_features.lastSuccess).toBeNull()
    }
  })
  it('does not reset corrupted state or hide failed persistence', async () => {
    expect(()=>parseGuidanceWatchState('{bad')).toThrow()
    expect(()=>parseGuidanceWatchState('{"version":1,"sources":{"other":{}}}')).toThrow()
    expect(()=>parseGuidanceWatchState('{"version":1,"sources":{},"body":"raw document"}')).toThrow()
    await expect(runGuidanceWatch({...deps(),read:async()=>{throw Error('storage unavailable')}})).rejects.toThrow('storage unavailable')
    expect(fetch).not.toHaveBeenCalled()
    await expect(runGuidanceWatch({...deps(),write:async()=>{throw Error('write failed')}})).rejects.toThrow('write failed')
  })
  it('stops within the supplied invocation budget', async () => {
    const result=await runGuidanceWatch({...deps(),exhausted:()=>fetch.mock.calls.length>=1})
    expect(result.processed).toBe(1); expect(result.remaining).toBe(2)
  })
  it('ignores navigation and scripts but refuses an unexpected source layout', () => {
    const base=html(GUIDANCE_SOURCES[0].heading)
    expect(guidanceDigest(`<nav>Changed navigation</nav>${base}`,GUIDANCE_SOURCES[0].heading)).toBe(guidanceDigest(base,GUIDANCE_SOURCES[0].heading))
    expect(guidanceDigest(base.replace('</main>','<script>volatile</script></main>'),GUIDANCE_SOURCES[0].heading)).toBe(guidanceDigest(base,GUIDANCE_SOURCES[0].heading))
    expect(guidanceDigest(base,'Different article')).toBeNull()
  })
})

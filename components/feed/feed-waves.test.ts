import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// THE FEED RENDERS IN THREE DATABASE WAVES AND ASKS FOR my_orbit ONCE (LIVE-179, ADR-1242).
//
// Until 2026-09-07 the FeedList body awaited six things one after another, purely by position:
// the feed RPC, then the resonance map, then the scope resolver, then the dispatch/event pair,
// then the viewer context, then the lead-Dispatch pick. Only the scope resolver needs the posts,
// and only the Dispatch pick needs the viewer; everything else depends on the props alone. On top
// of that, the resonance map and the viewer context each called getMyOrbit(200), and getMyOrbit
// carried no cache() wrapper, so my_orbit (a three-way self-join) ran twice per render. The
// pick itself asked viewerHasActiveRsvp once per gated candidate, serially, up to eight times.
//
// None of that is visible to tsc, eslint or a render test: every version compiles, returns the
// same markup, and pays its round trips on every request forever. So this reads the SHAPE of the
// body, the same way app/(main)/events/[slug]/read-fanout.test.ts (LIVE-180) does: the number of
// awaits between the function head and the render merge, what the one Promise.all carries, the
// cache() wrapper on the orbit read, and the guards that must not have moved.

const FEED = 'components/feed/feed-list.tsx'
const ORBIT = 'lib/connections/resonance.ts'
const AUDIENCE = 'lib/events/dispatch-audience.ts'

const feed = readFileSync(FEED, 'utf8')
const orbit = readFileSync(ORBIT, 'utf8')
const audience = readFileSync(AUDIENCE, 'utf8')

const bodyStart = feed.indexOf('export async function FeedList(')
const bodyEnd = feed.indexOf('// ── Merge + render')
const body = feed.slice(bodyStart, bodyEnd)

const waveStart = body.indexOf('await Promise.all([')
const wave = body.slice(waveStart, body.indexOf('])', waveStart))

const pickStart = feed.indexOf('async function pickLeadDispatch(')
const pick = feed.slice(pickStart, feed.indexOf('function toDispatchItem(', pickStart))

describe('the FeedList body runs three waves, not five', () => {
  it('the body is where the count starts and ends', () => {
    expect(bodyStart).toBeGreaterThan(-1)
    expect(bodyEnd).toBeGreaterThan(bodyStart)
  })

  it('awaits exactly four times: the cookie, wave 1, the scope resolver, the Dispatch pick', () => {
    // The old body carried ten: two createClient(), two supabase.rpc(), the cookie, the resonance
    // map, the scope resolver, the dispatch/event pair, the viewer context, and the pick.
    const awaits = body.match(/\bawait\b/g) ?? []
    expect(awaits).toHaveLength(4)
    expect(body).toContain('const hideDemoEvents = await viewerHidesDemo()')
    expect(body).toContain('await Promise.all([')
    expect(body).toContain('const resolveScope = await buildScopeContextResolver(')
    expect(body).toContain('latestDispatch = await pickLeadDispatch(candidates, viewer)')
  })

  it('wave 1 carries the five prop-only reads together', () => {
    expect(waveStart).toBeGreaterThan(-1)
    expect(wave).toContain('loadPosts({')
    expect(wave).toContain('getViewerResonanceMap(resonanceFor)')
    expect(wave).toContain('dispatchCandidates(admin)')
    expect(wave).toContain('nearestPublicEvent(admin, hideDemoEvents)')
    expect(wave).toContain('resolveDispatchViewer(admin, furnitureFor, nearby)')
  })

  it('none of the wave-1 reads is awaited on its own any more', () => {
    expect(body).not.toContain('await getViewerResonanceMap(')
    expect(body).not.toContain('await resolveDispatchViewer(')
    expect(body).not.toContain('await supabase.rpc(')
    expect(body).not.toContain('await createClient()')
  })

  it('the cookie resolves BEFORE the wave, because the nearest-event query is shaped by it', () => {
    expect(body.indexOf('await viewerHidesDemo()')).toBeLessThan(waveStart)
    expect(body.indexOf('await viewerHidesDemo()')).toBeGreaterThan(-1)
  })

  it('the scope resolver still runs after the posts it depends on, on the ranked scope ids', () => {
    const resolverAt = body.indexOf('await buildScopeContextResolver(posts.map((p) => p.scope_id))')
    expect(resolverAt).toBeGreaterThan(waveStart)
    expect(body.indexOf('const posts: FeedPost[]')).toBeLessThan(resolverAt)
  })
})

describe('the guards the waves did not move', () => {
  it('the resonance map is built for the "For you" lens only', () => {
    expect(body).toContain("const resonanceFor = sort === 'relevant' && myProfileId ? myProfileId : null")
    expect(body).toContain('resonanceFor ? getViewerResonanceMap(resonanceFor) : null')
  })

  it('the furniture rail is still main-feed, signed-in, non-Story only', () => {
    expect(body).toContain("const furnitureFor = myProfileId && showPublicLayer && sort !== 'story' ? myProfileId : null")
    expect(body).toContain('if (furnitureFor && viewer) {')
  })

  it('a failed feed RPC still renders the error pane before anything is ranked', () => {
    const errorAt = body.indexOf("if (loaded.kind === 'error') {")
    expect(errorAt).toBeGreaterThan(waveStart)
    expect(errorAt).toBeLessThan(body.indexOf('let ranked: RawPost[]'))
    expect(body.slice(errorAt, errorAt + 120)).toContain('return <FeedError retryHref={retryHref} />')
  })

  it('the nearest-event banner still re-applies the public listing gate on both demo branches', () => {
    const fnAt = feed.indexOf('function nearestPublicEvent(')
    const fn = feed.slice(fnAt, feed.indexOf('export async function FeedList(', fnAt))
    expect((fn.match(/\.eq\('status', 'published'\)/g) ?? []).length).toBe(2)
    expect((fn.match(/\.eq\('visibility', 'public'\)/g) ?? []).length).toBe(2)
    expect((fn.match(/\.eq\('scope_type', 'public'\)/g) ?? []).length).toBe(2)
    expect((fn.match(/\.eq\('is_cancelled', false\)/g) ?? []).length).toBe(2)
    expect((fn.match(/\.eq\('is_demo', false\)/g) ?? []).length).toBe(1)
  })

  it('the feed RPCs still go through readFeedRpc, so an error is never the empty state', () => {
    const fnAt = feed.indexOf('async function loadPosts(')
    const fn = feed.slice(fnAt, feed.indexOf('const DISPATCH_SELECT', fnAt))
    expect(fn).toContain("readFeedRpc<RawPost>(\n      'scoped_feed_for_viewer',")
    expect(fn).toContain("readFeedRpc<RawPost>('feed_for_viewer', await supabase.rpc('feed_for_viewer', rpcArgs))")
    expect(fn).not.toContain('data ?? []')
  })
})

describe('my_orbit runs once per render', () => {
  it('getMyOrbit is wrapped in React cache(), keyed per limit', () => {
    expect(orbit).toContain("import { cache } from 'react'")
    expect(orbit).toContain('export const getMyOrbit = cache(async (limit = 100): Promise<OrbitMember[]> => {')
  })

  it('the RPC is dispatched from exactly one site, inside that wrapper', () => {
    expect((orbit.match(/\.rpc\('my_orbit'/g) ?? []).length).toBe(1)
    expect(feed).not.toContain("rpc('my_orbit'")
    expect(readFileSync('lib/feed/viewer-resonance.ts', 'utf8')).not.toContain("rpc('my_orbit'")
  })

  it('both feed readers still ask for the same limit, so the memo key matches', () => {
    expect(feed).toContain('getMyOrbit(200)')
    expect(readFileSync('lib/feed/viewer-resonance.ts', 'utf8')).toContain('getMyOrbit(200)')
  })
})

describe('the lead-Dispatch pick asks the RSVP question once', () => {
  it('reads the gated candidates in one .in() batch instead of a per-candidate maybeSingle', () => {
    expect(pickStart).toBeGreaterThan(-1)
    expect(pick).toContain('await viewerActiveRsvpEventIds(needsRsvp, viewer.profileId)')
    expect(pick).not.toContain('viewerHasActiveRsvp(')
    expect((pick.match(/\bawait\b/g) ?? []).length).toBe(1)
  })

  it('the batched read keeps the single read\'s filters: profile, non-muted, live statuses', () => {
    const fnAt = audience.indexOf('export async function viewerActiveRsvpEventIds(')
    expect(fnAt).toBeGreaterThan(-1)
    const fn = audience.slice(fnAt, audience.indexOf('/** The event fields the feed gate needs', fnAt))
    expect(fn).toContain(".from('event_rsvps')")
    expect(fn).toContain(".in('event_id', ids)")
    expect(fn).toContain(".eq('profile_id', profileId)")
    expect(fn).toContain(".eq('muted', false)")
    expect(fn).toContain(".in('status', ['going', 'maybe', 'waitlist'])")
  })

  it('an ordinary Dispatch still wins the moment it is reached, and the RSVP leg only covers what precedes it', () => {
    // Pass 1 stops collecting at the first non-event candidate; pass 2 returns it.
    expect(pick).toContain("if (row.dispatch_type !== 'event') break")
    expect(pick).toContain("if (row.dispatch_type !== 'event') {\n      return toDispatchItem(row, null)")
    expect(pick).toContain('const visible = viewerInEventDispatchArea(event, viewer) || rsvpd.has(event.id)')
  })
})

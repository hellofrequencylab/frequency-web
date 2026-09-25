import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

// THE ANONYMOUS-RENDER SEAM, and the regression it repairs.
//
// The public Space share URL (app/(public)/spaces/[slug]/page.tsx) is ISR: one document, built
// once, served to everyone including Googlebot. From 2026-09-19 (#2781) until this change its
// entire body was a sign-in card — the operator's blocks had been moved behind /full when the URL
// left the (main) layout, and nothing noticed, because the gate on that page
// (lib/nav/public-detail-isr.test.ts) greps the page's OWN source for `cookies()` and friends and
// cannot see one level down.
//
// Two halves, because each catches what the other cannot:
//   1. BEHAVIOUR. `markAnonymousRender()` must make `getCachedUser()` resolve null WITHOUT
//      constructing a Supabase client, because `createClient` is where `cookies()` is read and one
//      cookie read is what voids ISR. Every identity helper sits on that function, so this is the
//      property that keeps ~256 reachable server modules — including blocks written later — from
//      turning the page dynamic. An import-graph walk was considered as the gate instead and
//      rejected: all seven sibling public pages REACH a viewer read transitively while shipping
//      ISR fine, so reachability is far too coarse to block a build on. Executed behaviour is not.
//   2. THE PAGE. The stub is the thing that actually shipped, so it is the thing to pin: the public
//      Space page must render the operator's blocks, and must declare itself anonymous before it
//      reads anything. A future refactor that reduces this page to a card again fails here.

const { caches } = vi.hoisted(() => ({ caches: [] as Array<{ hit: boolean; value: unknown }> }))

vi.mock('react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react')>()
  // React's `cache` is a per-request memo only inside a server render; outside one it is a
  // pass-through, so the request-scoped holder would not behave like a holder at all. This
  // stand-in memoises the way the real one does during a render — and every cell is registered so
  // a test can clear them, which is this file's stand-in for "the next request".
  const cache = <T extends (...a: never[]) => unknown>(fn: T): T => {
    const cell = { hit: false, value: undefined as unknown }
    caches.push(cell)
    return ((...args: never[]) => {
      if (!cell.hit) {
        cell.hit = true
        cell.value = fn(...args)
      }
      return cell.value
    }) as T
  }
  return { ...mod, cache }
})

let createClientCalls = 0

// The jar is deliberately NOT empty: fq_hide_demo is set, so the demo-preference case below
// discriminates. With an empty jar that reader returns false either way and the test would pass
// against the very mutation it exists to catch.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [{ name: 'fq_hide_demo', value: '1' }],
    get: (name: string) => (name === 'fq_hide_demo' ? { name, value: '1' } : undefined),
    set: () => {},
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    createClientCalls += 1
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'p1', display_name: 'Ada', community_role: 'member', web_role: 'admin' },
            }),
          }),
        }),
      }),
    }
  },
}))

/** Start a fresh "request": every React.cache cell is cleared, so the holder and the memoised
 *  identity reads behave as they would on the next render. */
function newRequest() {
  for (const c of caches) {
    c.hit = false
    c.value = undefined
  }
  createClientCalls = 0
}

beforeEach(newRequest)

describe('an anonymous render never reaches for a viewer', () => {
  it('resolves no user and builds no Supabase client once marked', async () => {
    const { markAnonymousRender } = await import('./anonymous-render')
    const { getCachedUser } = await import('@/lib/auth')

    markAnonymousRender()
    expect(await getCachedUser()).toBeNull()
    // The assertion that matters: not "the user is null" but "nothing asked". `createClient` is
    // where cookies() is read, and a single read makes Next render this route per request.
    expect(createClientCalls, 'a client was built, so cookies() was read and ISR is void').toBe(0)
  })

  it('carries through every identity helper, not just getCachedUser', async () => {
    const { markAnonymousRender } = await import('./anonymous-render')
    const { getMyProfileId, getCallerProfile, isPlatformStaff } = await import('@/lib/auth')

    markAnonymousRender()
    expect(await getMyProfileId()).toBeNull()
    expect(await getCallerProfile()).toBeNull()
    // Staff is the one that fails OPEN if it is missed: a true here would hand owner tools to an
    // anonymous reader AND bake them into a cached document.
    expect(await isPlatformStaff()).toBe(false)
    expect(createClientCalls).toBe(0)
  })

  it('covers the one reader that takes a cookie without resolving a viewer', async () => {
    const { markAnonymousRender } = await import('./anonymous-render')
    const { viewerHidesDemo } = await import('@/lib/demo-preference')
    // `viewerHidesDemo` reads fq_hide_demo directly, so `getCachedUser` never sees it and the seam
    // below cannot neutralise it. It has to check the flag itself. This is the SHAPE to watch for:
    // any per-viewer cookie added to a public render needs the same line.
    markAnonymousRender()
    expect(await viewerHidesDemo()).toBe(false)
  })

  it('is inert on a render that does not mark itself', async () => {
    const { getCachedUser } = await import('@/lib/auth')
    // The flag defaults false, so every member render behaves exactly as it did. If this ever
    // fails, the seam has become a site-wide sign-out rather than a per-render declaration.
    expect(await getCachedUser()).toEqual({ id: 'auth-1' })
    expect(createClientCalls).toBe(1)
  })

  it('does not leak across requests', async () => {
    const { markAnonymousRender } = await import('./anonymous-render')
    const { getCachedUser } = await import('@/lib/auth')
    markAnonymousRender()
    expect(await getCachedUser()).toBeNull()

    newRequest()
    expect(await getCachedUser()).toEqual({ id: 'auth-1' })
  })
})

// ── Source shape: the two things that are true today and must stay true ────────────────────────

/** Strip comment lines so a check cannot be satisfied by the prose above the code. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
}

describe('the seam is checked before the client is built', () => {
  it('getCachedUser returns on the flag ahead of createClient', () => {
    const auth = code('lib/auth.ts')
    const body = auth.slice(auth.indexOf('export const getCachedUser'))
    const flag = body.indexOf('isAnonymousRender()')
    const client = body.indexOf('createClient(')
    expect(flag, 'getCachedUser no longer consults the anonymous-render flag').toBeGreaterThan(-1)
    // Order is the whole point. A check AFTER the client is constructed reads cookies anyway and
    // the page goes dynamic while every test above still passes.
    expect(flag, 'the flag is read after createClient, so cookies() is touched regardless').toBeLessThan(client)
  })
})

describe('the public Space page shows the Space', () => {
  const PAGE = 'app/(public)/spaces/[slug]/page.tsx'
  const src = code(PAGE)

  it('renders the operator blocks, not a sign-in card alone', () => {
    // 🔴 THE REGRESSION, PINNED. #2781 left this page's whole body as a <SignInCta>. It is the
    // sitemap-advertised URL for every networked Space, so that shipped a content-free page to
    // every signed-out visitor and to every crawler for six days before anyone looked.
    expect(src).toMatch(/<SpaceProfileModules\b/)
    expect(src).toMatch(/parseEntityLayout\(/)
  })

  it('declares itself anonymous before it reads anything', () => {
    const mark = src.indexOf('markAnonymousRender()')
    expect(mark, 'the page must declare it has no viewer').toBeGreaterThan(-1)
    // Before the Space read, which is the first thing that can reach a viewer helper.
    expect(mark).toBeLessThan(src.indexOf('getVisibleSpaceBySlug('))
  })

  it('keeps the sign-in card, below the content rather than instead of it', () => {
    // The card is not the enemy — asking a stranger to join after they have read what the Space is
    // is the whole funnel. Standing in FRONT of the content is what made it a wall.
    expect(src).toMatch(/<SignInCta\b/)
    expect(src.indexOf('<SpaceProfileModules')).toBeLessThan(src.indexOf('<SignInCta'))
  })
})

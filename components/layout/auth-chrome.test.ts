import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// ── THE AUTH CLUSTER FOLLOWS THE VIEWER ───────────────────────────────────────────────────────
//
// WHAT BROKE. MarketingHeader has known whether the viewer is signed in since `authed` landed —
// it used the answer to point the wordmark at /feed — and then rendered a hardcoded "Sign in" +
// "join the beta" pair three elements later. So on every public page a member was offered a door
// they were already through, and invited to join a thing they had joined. Two more copies of the
// same mistake sat one level up: the help centre never told the header who was looking at all,
// and the (main) layout's public chrome passed `isAuth={false}` on a branch that also serves a
// SIGNED-IN member (no profile row yet, or mid-induction).
//
// These are SOURCE assertions, in the house style of header-fit.test.ts beside them: the headers
// are client components whose auth state resolves from a Supabase session, and this repo has no
// browser in `pnpm test`. What a unit test can honestly hold is that every surface threads the
// viewer through, and that the member branch is pinned the same way the visitor branch is.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

const MARKETING = read('./marketing-header.tsx')
const MOBILE_MENU = read('./marketing-mobile-menu.tsx')

describe('MarketingHeader: a member is not offered the door they came through', () => {
  it('branches the auth cluster on the resolved viewer', () => {
    expect(MARKETING).toMatch(/\{authed \? \(\s*<Link\s+href="\/feed"/)
  })

  it('offers Sign in and the join CTA only to a signed-out viewer', () => {
    // Both live inside the `: (` half of that ternary. Measured by position rather than
    // described: the defect was precisely that they sat OUTSIDE any branch.
    const cluster = MARKETING.slice(MARKETING.indexOf('{authed ? ('))
    const elseArm = cluster.indexOf(') : (')
    expect(elseArm).toBeGreaterThan(-1)
    expect(cluster.indexOf('href="/sign-in"')).toBeGreaterThan(elseArm)
    expect(cluster.indexOf('href={BETA_CTA_HREF}')).toBeGreaterThan(elseArm)
  })

  it('says the same words the phone sheet already says', () => {
    // One destination, one label, two surfaces. A second wording here is how a header and its
    // own drawer start describing the product differently.
    expect(MARKETING).toContain('Your feed')
    expect(MOBILE_MENU).toContain('Your feed')
  })

  // ── the fit contract, on the branch header-fit.test.ts cannot see ──────────────────────────
  // The wordmark is this bar's only shrinkable child. header-fit.test.ts pins the visitor
  // controls; an auth-dependent control that forgot to pin itself would reintroduce the same
  // overflow on the branch a signed-out reader (and that test) never renders.
  it('pins the member control too', () => {
    const memberArm = MARKETING.slice(MARKETING.indexOf('{authed ? ('), MARKETING.indexOf(') : ('))
    expect(memberArm).toMatch(/shrink-0 rounded-lg px-3 py-1\.5 text-body-sm font-bold[^`]*whitespace-nowrap/)
  })

  it('tells the phone sheet who is looking', () => {
    expect(MARKETING).toContain('<MarketingMobileMenu light={light} headerMenu={headerMenu} isAuth={authed} />')
  })
})

describe('every public surface threads the viewer through', () => {
  // A header that CAN follow the viewer but is never told is the same bug with a longer stack.
  // Each call site must pass `isAuth` or set `detectClientAuth`; the one exception is the home
  // splash, which passes `isAuth={!!user}` from its own server read.
  const CALLERS = [
    ['app/(marketing)/layout.tsx', '../../app/(marketing)/layout.tsx'],
    ['app/(help)/layout.tsx', '../../app/(help)/layout.tsx'],
    ['app/(main)/layout.tsx', '../../app/(main)/layout.tsx'],
    ['app/page.tsx', '../../app/page.tsx'],
  ] as const

  it.each(CALLERS)('%s renders no viewer-blind MarketingHeader', (_label, path) => {
    const src = read(path)
    for (const tag of src.match(/<MarketingHeader[^>]*>/g) ?? []) {
      expect(tag).toMatch(/detectClientAuth|isAuth=\{/)
    }
  })

  it('never hardcodes a signed-out header', () => {
    // `isAuth={false}` is the (main) public chrome's original defect: that branch serves a
    // signed-out visitor AND a signed-in member who has no profile row yet.
    for (const [, path] of CALLERS) {
      expect(read(path)).not.toContain('isAuth={false}')
    }
  })
})

describe('/sign-in is not a destination for someone already signed in', () => {
  const SIGN_IN = read('../../app/sign-in/page.tsx')

  it('sends a signed-in viewer into the app', () => {
    expect(SIGN_IN).toContain("if (user) redirect(nextTarget || '/feed')")
  })

  it('honours a validated `next` and nothing else', () => {
    // Same-origin absolute path only — the shape /auth/callback and proxy.ts already enforce.
    // Without the guard this redirect is an open redirect on the product's own login URL.
    expect(SIGN_IN).toMatch(
      /const nextTarget =\s*\n?\s*next && next\.startsWith\('\/'\) && !next\.startsWith\('\/\/'\) && !next\.startsWith\("?'?\/\\\\/
    )
  })

  it('validates once, so the redirect and the form cannot disagree', () => {
    expect(SIGN_IN).toContain('const nextValue = nextTarget')
  })
})

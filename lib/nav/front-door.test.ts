import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { frontDoorRedirect } from './front-door'

// The three facts the front-door rule turns on, exercised directly. See front-door.ts for why
// the decision is a pure function rather than an `if` inside proxy.ts.

describe('a member lands on the feed', () => {
  it('sends a signed-in viewer from / to /feed', () => {
    expect(frontDoorRedirect({ pathname: '/', signedIn: true, preview: false })).toBe('/feed')
  })
})

describe('the indexable splash is untouched', () => {
  it('leaves a signed-out viewer on /', () => {
    expect(frontDoorRedirect({ pathname: '/', signedIn: false, preview: false })).toBeNull()
  })

  // A crawler is never signed in, so this is the same case as above — stated separately because
  // it is the one that would be catastrophic and silent: redirecting `/` unconditionally sends
  // Googlebot to a protected route, which the proxy bounces to a noindex /sign-in, and the home
  // page quietly leaves the index with every build still green.
  it('leaves a crawler on / — the front door stays the indexed document', () => {
    expect(frontDoorRedirect({ pathname: '/', signedIn: false, preview: true })).toBeNull()
  })
})

describe('the operator can still look at the page they edited', () => {
  it('lets ?preview through for a signed-in viewer', () => {
    expect(frontDoorRedirect({ pathname: '/', signedIn: true, preview: true })).toBeNull()
  })

  it('is the href the page editor actually uses', () => {
    // Pinned against the real caller: if "View home" ever stops carrying `?preview`, the escape
    // hatch above is decoration and the owner is locked out of their own front door.
    const editor = readFileSync(new URL('../../app/(main)/pages/home/page.tsx', import.meta.url), 'utf8')
    expect(editor).toContain('href="/?preview"')
  })
})

describe('only the root moves', () => {
  it.each(['/about', '/pricing', '/help', '/discover', '/feed', '/join', '/sign-in'])(
    'leaves %s alone for a signed-in viewer',
    (pathname) => {
      expect(frontDoorRedirect({ pathname, signedIn: true, preview: false })).toBeNull()
    }
  )

  // `/` is an exact match, never a prefix: a prefix test here would swallow the entire site.
  it('does not match by prefix', () => {
    expect(frontDoorRedirect({ pathname: '/the-lab', signedIn: true, preview: false })).toBeNull()
  })
})

describe('the rule is wired into the request path', () => {
  const PROXY = readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8')

  // The consequence, not the title: a helper nothing calls is a helper that does nothing.
  it('is called by proxy.ts', () => {
    expect(PROXY).toContain('frontDoorRedirect({')
  })

  it('carries refreshed session cookies onto the redirect', () => {
    // Dropping them signs the member out on the very request that was meant to let them in —
    // the failure mode the protected-path redirect below it already documents at length.
    const block = PROXY.slice(PROXY.indexOf('const frontDoor = frontDoorRedirect'))
    expect(block.slice(0, block.indexOf('// Calendar feed'))).toContain(
      'supabaseResponse.cookies\n      .getAll()\n      .forEach((cookie) => redirectResponse.cookies.set(cookie))'
    )
  })

  // The installed app opens on `start_url`. If that ever stops being "/", this rule stops
  // covering the phone and the owner's "same for both web and mobile" quietly becomes false.
  it('covers the installed app, whose start_url is the same root path', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8')
    )
    expect(manifest.start_url).toBe('/')
  })
})

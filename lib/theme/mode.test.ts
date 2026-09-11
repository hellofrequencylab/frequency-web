// @vitest-environment jsdom
//
// ── THE MODE LAW, AND THE COPY OF IT THAT RUNS BEFORE ANY BUNDLE ──────────────────────────────
//
// mode.ts states the light/dark law twice and has to: `resolveDarkMode` is the version the app
// calls, and `THEME_BOOTSTRAP_SCRIPT` is the ES5 restatement that runs inline in <head> before the
// first paint, where it cannot import anything. Two statements of one rule is exactly the shape
// that drifts, and the drift is invisible — the bootstrap's answer is overwritten milliseconds
// later by the runtime's, so a disagreement shows up as a FLASH of the wrong theme on first paint
// and nothing else. Nobody files that bug; they just see the site blink.
//
// So the first describe below does not test the script's shape. It EXECUTES the real exported
// string in a real DOM, across the full cartesian product of the five inputs, and asserts the class
// it leaves on <html> matches what resolveDarkMode says for the same inputs. 48 combinations, one
// law. Deleting a branch from either copy fails it.
//
// The rest are the three owner rules, written as the thing a person would notice:
//   • a visitor with no preference meets the site light                    → the default
//   • a signed-out browser cannot show dark, even holding a dark preference → the account gate
//   • /discover on a phone is light for a member with dark mode on          → the public lock
//   • …and that member's preference is still there when they leave          → nothing is written

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ACCOUNT_COOKIE,
  DEFAULT_THEME_MODE,
  MOBILE_MAX_WIDTH_PX,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  THEME_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  canChooseMode,
  hasAccountSignal,
  isLightLockedPath,
  isPublicCommunityPath,
  parseThemeMode,
  resolveDarkMode,
} from './mode'

/* ── Harness ──────────────────────────────────────────────────────────────── */

interface Scenario {
  stored: string | null
  systemDark: boolean
  hasAccount: boolean
  pathname: string
  viewportWidth: number
}

/** Put the DOM into a scenario, then run the REAL bootstrap string against it. */
function runBootstrap(s: Scenario): { dark: boolean; themeColor: string | null } {
  window.localStorage.clear()
  if (s.stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, s.stored)

  // jsdom has no navigation, so the path is replaced rather than navigated to.
  window.history.replaceState({}, '', s.pathname)

  // `document.cookie` in jsdom is a real jar — clear the marker, then set it if the scenario has one.
  document.cookie = `${ACCOUNT_COOKIE}=; max-age=0; path=/`
  if (s.hasAccount) document.cookie = `${ACCOUNT_COOKIE}=1; path=/`

  Object.defineProperty(window, 'innerWidth', { value: s.viewportWidth, configurable: true })

  // jsdom ships no matchMedia. The bootstrap only ever asks it about prefers-color-scheme.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('prefers-color-scheme:dark') || q.includes('prefers-color-scheme: dark')
        ? s.systemDark
        : false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  })

  document.documentElement.className = ''
  document.head.querySelector('meta[name="theme-color"]')?.remove()

  new Function(THEME_BOOTSTRAP_SCRIPT)()

  return {
    dark: document.documentElement.classList.contains('dark'),
    themeColor: document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
  }
}

const ORIGINAL_MATCH_MEDIA = Object.getOwnPropertyDescriptor(window, 'matchMedia')
const ORIGINAL_INNER_WIDTH = Object.getOwnPropertyDescriptor(window, 'innerWidth')

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  if (ORIGINAL_MATCH_MEDIA) Object.defineProperty(window, 'matchMedia', ORIGINAL_MATCH_MEDIA)
  if (ORIGINAL_INNER_WIDTH) Object.defineProperty(window, 'innerWidth', ORIGINAL_INNER_WIDTH)
  document.cookie = `${ACCOUNT_COOKIE}=; max-age=0; path=/`
  window.history.replaceState({}, '', '/')
})

/* ── 1. The two statements of the law agree, on every input ───────────────── */

describe('the pre-paint bootstrap and resolveDarkMode are the same law', () => {
  const STORED: (string | null)[] = [null, 'light', 'dark', 'system']
  const PATHS = ['/feed', '/discover', '/discover/circles', '/join', '/join/breathwork']
  const WIDTHS = [390, 1280] // a phone, and a laptop

  const matrix: Scenario[] = []
  for (const stored of STORED) {
    for (const systemDark of [false, true]) {
      for (const hasAccount of [false, true]) {
        for (const pathname of PATHS) {
          for (const viewportWidth of WIDTHS) {
            matrix.push({ stored, systemDark, hasAccount, pathname, viewportWidth })
          }
        }
      }
    }
  }

  it(`covers the whole input space (${4 * 2 * 2 * 5 * 2} combinations)`, () => {
    expect(matrix).toHaveLength(160)
  })

  for (const s of matrix) {
    const label =
      `stored=${s.stored ?? 'unset'} sys=${s.systemDark ? 'dark' : 'light'} ` +
      `acct=${s.hasAccount} ${s.pathname} @${s.viewportWidth}px`

    it(`agrees: ${label}`, () => {
      const law = resolveDarkMode(s)
      const bootstrap = runBootstrap(s)
      expect(bootstrap.dark, 'bootstrap disagrees with resolveDarkMode').toBe(law)
      // The browser chrome follows the same answer — a dark page with a cream status bar is
      // the same first-paint defect in a different pixel.
      expect(bootstrap.themeColor).toBe(law ? THEME_COLOR_DARK : THEME_COLOR_LIGHT)
    })
  }
})

/* ── 2. Default is light ──────────────────────────────────────────────────── */

describe('an unset preference means light', () => {
  it('is the declared default', () => {
    expect(DEFAULT_THEME_MODE).toBe('light')
    expect(parseThemeMode(null)).toBe('light')
    expect(parseThemeMode('nonsense')).toBe('light')
  })

  it('a first-time visitor on a dark phone still meets the site light', () => {
    const dark = resolveDarkMode({
      stored: null,
      systemDark: true,
      hasAccount: true, // even WITH an account: unset no longer means "follow the device"
      pathname: '/feed',
      viewportWidth: 390,
    })
    expect(dark).toBe(false)
  })

  it("'system' is still honoured once a member opts into it", () => {
    const inputs = { stored: 'system', hasAccount: true, pathname: '/feed', viewportWidth: 1280 }
    expect(resolveDarkMode({ ...inputs, systemDark: true })).toBe(true)
    expect(resolveDarkMode({ ...inputs, systemDark: false })).toBe(false)
  })

  it('migrates the legacy key rather than resetting a long-standing member', () => {
    window.localStorage.clear()
    window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, 'dark')
    document.cookie = `${ACCOUNT_COOKIE}=1; path=/`
    window.history.replaceState({}, '', '/feed')
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    })
    document.documentElement.className = ''

    new Function(THEME_BOOTSTRAP_SCRIPT)()

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})

/* ── 3. No account, no dark ───────────────────────────────────────────────── */

describe('dark mode needs an account', () => {
  it('a signed-out browser holding a dark preference renders light', () => {
    const dark = resolveDarkMode({
      stored: 'dark',
      systemDark: true,
      hasAccount: false,
      pathname: '/feed',
      viewportWidth: 1280,
    })
    expect(dark).toBe(false)
  })

  it("the preference is not erased — it is just not honoured until they sign back in", () => {
    const signedOut = runBootstrap({
      stored: 'dark', systemDark: false, hasAccount: false, pathname: '/', viewportWidth: 390,
    })
    expect(signedOut.dark).toBe(false)
    // The stored choice survived the signed-out render untouched.
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    const signedBackIn = runBootstrapKeepingStorage({
      stored: 'dark', systemDark: false, hasAccount: true, pathname: '/', viewportWidth: 390,
    })
    expect(signedBackIn.dark).toBe(true)
  })

  it('the toggles are only offered to someone with an account', () => {
    expect(canChooseMode(false)).toBe(false)
    expect(canChooseMode(true)).toBe(true)
  })

  it('reads the marker as a whole cookie name, never a substring', () => {
    expect(hasAccountSignal(`${ACCOUNT_COOKIE}=1`)).toBe(true)
    expect(hasAccountSignal(`a=b; ${ACCOUNT_COOKIE}=1; c=d`)).toBe(true)
    expect(hasAccountSignal(`${ACCOUNT_COOKIE}=0`)).toBe(false)
    expect(hasAccountSignal('')).toBe(false)
    expect(hasAccountSignal(null)).toBe(false)
    // The shape that would make a prefix probe wrong: another cookie ENDING in the marker name.
    expect(hasAccountSignal(`not_${ACCOUNT_COOKIE}=1`)).toBe(false)
    expect(hasAccountSignal(`${ACCOUNT_COOKIE}_other=1`)).toBe(false)
  })
})

/* ── 4. /discover is light on a phone, for everyone ───────────────────────── */

describe('the public community lock', () => {
  const MEMBER_IN_DARK = { stored: 'dark', systemDark: true, hasAccount: true } as const

  it('pins /discover light on a phone even for a member who chose dark', () => {
    expect(resolveDarkMode({
      ...MEMBER_IN_DARK, pathname: '/discover', viewportWidth: MOBILE_MAX_WIDTH_PX,
    })).toBe(false)
    expect(resolveDarkMode({
      ...MEMBER_IN_DARK, pathname: '/discover/circles/sunrise-swim', viewportWidth: 390,
    })).toBe(false)
  })

  it('leaves that member in dark on the same page at desktop width', () => {
    expect(resolveDarkMode({
      ...MEMBER_IN_DARK, pathname: '/discover', viewportWidth: MOBILE_MAX_WIDTH_PX + 1,
    })).toBe(true)
  })

  it('leaves that member in dark everywhere else on a phone', () => {
    expect(resolveDarkMode({ ...MEMBER_IN_DARK, pathname: '/feed', viewportWidth: 390 })).toBe(true)
  })

  it('writes nothing — the member still holds dark after a locked render', () => {
    runBootstrap({ ...MEMBER_IN_DARK, pathname: '/discover', viewportWidth: 390 })
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('matches the /discover tree and nothing that merely starts with the letters', () => {
    expect(isPublicCommunityPath('/discover')).toBe(true)
    expect(isPublicCommunityPath('/discover/')).toBe(true)
    expect(isPublicCommunityPath('/discover/spaces')).toBe(true)
    expect(isPublicCommunityPath('/discovery')).toBe(false)
    expect(isPublicCommunityPath('/feed')).toBe(false)
    expect(isPublicCommunityPath('/sites/acme')).toBe(false) // white-label keeps its own skin
    expect(isPublicCommunityPath(null)).toBe(false)
  })
})

/* ── 5. The induction lock is a RULE, not an override ─────────────────────── */

describe('the induction light lock', () => {
  const MEMBER_IN_DARK = { stored: 'dark', systemDark: true, hasAccount: true } as const

  it('pins the three induction routes light at every width', () => {
    for (const pathname of ['/join', '/join/complete', '/join/preview']) {
      expect(resolveDarkMode({ ...MEMBER_IN_DARK, pathname, viewportWidth: 390 }), pathname).toBe(false)
      expect(resolveDarkMode({ ...MEMBER_IN_DARK, pathname, viewportWidth: 1440 }), pathname).toBe(false)
    }
  })

  it('leaves the sibling /join/<slug> splashes on the member\'s own mode', () => {
    // The route-group boundary the old layout drew, now written as a path. A Funnel splash and a
    // Circle invite redemption are ordinary surfaces.
    expect(resolveDarkMode({
      ...MEMBER_IN_DARK, pathname: '/join/breathwork', viewportWidth: 1440,
    })).toBe(true)
    expect(isLightLockedPath('/join/breathwork')).toBe(false)
    expect(isLightLockedPath('/joinx')).toBe(false)
  })

  it('is decided by the law rather than by a component that can be raced', () => {
    // The regression this replaced: a child effect stripped `.dark` and the root layout's sync put
    // it back, because React runs child effects before parent ones. Nothing to race if the shared
    // resolver already answers light — which is what the bootstrap agreement matrix above proves
    // for '/join' on every combination of preference, OS, account and width.
    expect(isLightLockedPath('/join')).toBe(true)
    expect(runBootstrap({ ...MEMBER_IN_DARK, pathname: '/join', viewportWidth: 1440 }).dark).toBe(false)
  })

  it('writes nothing — the member still holds dark after the funnel', () => {
    runBootstrap({ ...MEMBER_IN_DARK, pathname: '/join', viewportWidth: 390 })
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})

/** runBootstrap, but without clearing storage first — for the sign-out/sign-in round trip. */
function runBootstrapKeepingStorage(s: Scenario): { dark: boolean } {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  const out = runBootstrap({ ...s, stored })
  return out
}

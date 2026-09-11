// The MODE law — light vs dark — in one pure place.
//
// Mode used to be decided in four hand-written copies: the pre-paint script in app/layout.tsx, the
// account-menu toggle in components/layout/app-shell.tsx, the Settings switcher, and the induction's
// force-light restore. They agreed by inspection and nothing held them to it; two of them already
// carried comments claiming they shared a constant they did not (app/layout.tsx re-declared the
// theme-color literals that app/join/(induction)/force-light.tsx says it exports for them). This
// module is the single law all four now read, and mode.test.ts runs the real bootstrap script in a
// DOM against resolveDarkMode across the full input matrix, so a copy that drifts fails the build.
//
// PURE — no React, no next/*, no DOM, no server imports — so the root layout (a Server Component),
// the client toggles, the middleware-adjacent code and the unit test can all read one file. The DOM
// half lives beside it in apply-mode.ts.

/* ── Storage ──────────────────────────────────────────────────────────────── */

/** Where the member's chosen mode lives. Established the `freq-*` namespace (see lib/layout/rail-fold.ts). */
export const THEME_STORAGE_KEY = 'freq-theme'

/** The pre-`freq-*` key, still migrated one-time on read so long-standing members are never reset. */
export const LEGACY_THEME_STORAGE_KEY = 'theme'

/** The skin-preview key the bootstrap also applies (`data-skin` on <html>). */
export const SKIN_STORAGE_KEY = 'freq-skin'

/* ── The browser-chrome literals ──────────────────────────────────────────── */

// The pre-paint script runs BEFORE CSS, so `<meta name="theme-color">` cannot read a CSS variable
// and the value has to exist as a literal somewhere. This is that somewhere — one pair, imported by
// the root layout's viewport metadata, the bootstrap script and the induction's light lock. They
// mirror --color-canvas and --color-ink in app/globals.css.

/** Mirrors `--color-canvas` (light). */
export const THEME_COLOR_LIGHT = '#FBFAF6' // token-ok: browser chrome; set before CSS applies
/** Mirrors `--color-ink` (dark). */
export const THEME_COLOR_DARK = '#16130E' // token-ok: browser chrome; set before CSS applies

/** The browser-chrome colour for a resolved mode. */
export function themeColorFor(dark: boolean): string {
  return dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
}

/* ── The stored preference ────────────────────────────────────────────────── */

export type ThemeMode = 'light' | 'dark' | 'system'

/**
 * What an unset preference means (owner, 2026-09-11). Was `'system'`, which handed the decision to
 * the device: a visitor whose phone was in dark mode met Frequency dark, having never chosen it, on
 * a palette (DAWN) whose light values are the canonical look. Light is now the default and `'system'`
 * is a thing a member opts INTO.
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'light'

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Narrow a raw storage read to a mode, falling back to the default. Never throws. */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return isThemeMode(raw) ? raw : DEFAULT_THEME_MODE
}

/* ── The account signal ───────────────────────────────────────────────────── */

/**
 * The non-httpOnly marker the proxy writes beside the session (`fq_acct=1`), cleared on the first
 * request after sign-out. Its ONLY job is to tell the pre-paint script, which cannot await an auth
 * round trip, whether this browser belongs to someone with an account.
 *
 * ⚠️ PRESENTATIONAL, NOT A CREDENTIAL. Anyone can type it into their own cookie jar; all they win
 * is the ability to see the product in dark mode, which is the same thing `freq-theme` already
 * grants and no more. It is never read for authorization — grep it: this module and the proxy that
 * writes it are the only readers. Real access is decided by the session cookie, server-side, every
 * time. It is deliberately NOT the Supabase cookie itself: `sb-<ref>-auth-token` has a sibling
 * `sb-<ref>-auth-token-code-verifier` that exists mid-magic-link, BEFORE there is a session, so
 * probing that name would answer "yes" to someone who has not signed in yet.
 */
export const ACCOUNT_COOKIE = 'fq_acct'

/** Read the account marker out of a raw `document.cookie` / `Cookie:` string. Fails closed. */
export function hasAccountSignal(cookieString: string | null | undefined): boolean {
  if (!cookieString) return false
  return new RegExp(`(?:^|;\\s*)${ACCOUNT_COOKIE}=1(?:;|$)`).test(cookieString)
}

/* ── The public community surfaces ────────────────────────────────────────── */

/**
 * The pages pinned to light on a phone (owner, 2026-09-11): `/discover` and everything under it.
 *
 * That tree is the public community surface — app/discover/layout.tsx calls it "the only indexable
 * community URLs", since the authed app is robots-disallowed. It is the front door a stranger meets
 * from a search result or a shared link, and on a phone it is the whole screen with no member chrome
 * around it to explain the dark treatment. The canonical look is DAWN light; that is what it shows.
 *
 * NOT here, on purpose:
 *   • `/sites/<slug>` — white-label customer sites carry an owner-chosen skin. Pinning the mode
 *     would override somebody's branding on their own domain.
 *   • the `(marketing)` group — public, but marketing rather than community, and already covered
 *     for every signed-out visitor by the account gate below.
 *   • the member twins (`/spaces/<slug>`, `/events/<slug>`, …) — those render the member's own view
 *     of a thing and keep the member's own mode.
 */
export const PUBLIC_COMMUNITY_PATTERN = /^\/discover(?:\/|$)/

export function isPublicCommunityPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return PUBLIC_COMMUNITY_PATTERN.test(pathname)
}

/**
 * Surfaces pinned to light at EVERY width, for every viewer — currently the Funnels induction
 * (owner, 2026-08-07). It is a scripted cinematic sequence whose art, reel renders and inset fields
 * were all drawn against the light canvas; in dark mode it is not a second styling of the flow, it
 * is the flow with its lighting wrong.
 *
 * This used to be an OVERRIDE rather than a rule: app/join/(induction)/layout.tsx ran its own inline
 * script and mounted a `ForceLight` component that stripped `.dark` on mount and restored it on
 * unmount. That worked while nothing else re-resolved mode after paint. It stopped working the
 * moment ThemeModeSync joined the root layout, because React runs child effects BEFORE parent ones:
 * ForceLight would strip the class and ThemeModeSync would immediately put it back, handing a
 * dark-mode member the exact broken lighting the override exists to prevent. A lock that the law
 * itself knows about cannot be raced by the law.
 *
 * SCOPED TO THE THREE (induction) ROUTES, not to all of `/join`. The sibling `/join/<slug>` pages
 * (Funnel splashes + Circle invite redemption) are ordinary surfaces that keep honouring the
 * member's choice. That is the same boundary the route group drew, written as a path.
 */
export const LIGHT_LOCKED_PATTERN = /^\/join(?:\/(?:complete|preview))?\/?$/

export function isLightLockedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return LIGHT_LOCKED_PATTERN.test(pathname)
}

/**
 * "Mobile" for the light lock: below Tailwind's `md` (768px), matching the breakpoint
 * components/page-editor/mobile/use-is-mobile.ts already treats as the phone boundary.
 */
export const MOBILE_MAX_WIDTH_PX = 767

/* ── The law ──────────────────────────────────────────────────────────────── */

export interface ModeInputs {
  /** Raw `localStorage['freq-theme']` (already legacy-migrated by the caller). */
  stored: string | null
  /** `prefers-color-scheme: dark`. */
  systemDark: boolean
  /** Account marker present — see ACCOUNT_COOKIE. */
  hasAccount: boolean
  /** Current path, for the public-community lock. */
  pathname: string
  /** Viewport width in CSS px, for the mobile half of that lock. */
  viewportWidth: number
}

/**
 * Resolve dark mode. Three rules, in this order — each one can only ever answer "light", so the
 * whole law fails safe toward the canonical look.
 *
 *   0. A light-locked surface (the induction) is light at every width, for everyone.
 *   1. A public community page on a phone is light for EVERYONE, member or not. It is a DOM-level
 *      override and writes nothing: a member who keeps dark mode has it back the moment they leave.
 *   2. No account ⇒ light. This is the "cannot change to dark until they have an account" rule, and
 *      it is enforced on READ rather than on write for the case that actually happens: a member
 *      signs out of a shared or borrowed browser and the next visitor inherits their dark mode. The
 *      preference is not erased, just not honoured — sign back in and it returns.
 *   3. Otherwise the member's own choice, with an unset preference meaning DEFAULT_THEME_MODE.
 */
export function resolveDarkMode(inputs: ModeInputs): boolean {
  const { stored, systemDark, hasAccount, pathname, viewportWidth } = inputs

  if (isLightLockedPath(pathname)) return false
  if (isPublicCommunityPath(pathname) && viewportWidth <= MOBILE_MAX_WIDTH_PX) return false
  if (!hasAccount) return false

  const mode = parseThemeMode(stored)
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return systemDark
}

/**
 * Whether the mode toggles should be offered at all. The two toggles already live on member-only
 * surfaces, so this is a belt-and-braces assertion rather than the load-bearing gate — but it means
 * a toggle rendered somewhere public in future is inert instead of lying.
 */
export function canChooseMode(hasAccount: boolean): boolean {
  return hasAccount
}

/* ── The pre-paint bootstrap ──────────────────────────────────────────────── */

/**
 * The inline script app/layout.tsx runs synchronously in <head>, before the first paint, so the
 * `.dark` class and `<meta name="theme-color">` are correct on the first frame and nothing flashes.
 *
 * It is a STRING because it has to run before any bundle loads, which means it cannot import this
 * module and has to restate the law above in ES5. That duplication is the whole risk, so it is not
 * left to review: mode.test.ts executes this exact string in a DOM over the full input matrix and
 * asserts it agrees with resolveDarkMode on every combination. Change one without the other and the
 * test fails.
 *
 * Every literal is interpolated from the constants above rather than typed in, and the body is
 * wrapped in try/catch: a locked-down storage jar (private mode, a strict cookie policy) must never
 * be able to take the document down with it.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{
var d=document.documentElement;
var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(!s){var l=localStorage.getItem(${JSON.stringify(LEGACY_THEME_STORAGE_KEY)});if(l==='dark'||l==='light'||l==='system'){s=l;localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)},l);}}
var dark;
var p=location.pathname;
if(${LIGHT_LOCKED_PATTERN.toString()}.test(p)){dark=false;}
else if(${PUBLIC_COMMUNITY_PATTERN.toString()}.test(p)&&window.innerWidth<=${MOBILE_MAX_WIDTH_PX}){dark=false;}
else if(!(new RegExp("(?:^|;\\\\s*)${ACCOUNT_COOKIE}=1(?:;|$)")).test(document.cookie)){dark=false;}
else{dark=s==='dark'||(s==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches);}
d.classList.toggle('dark',dark);
var m=document.querySelector('meta[name="theme-color"]');
if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}
m.setAttribute('content',dark?${JSON.stringify(THEME_COLOR_DARK)}:${JSON.stringify(THEME_COLOR_LIGHT)});
var skin=localStorage.getItem(${JSON.stringify(SKIN_STORAGE_KEY)});if(skin){d.setAttribute('data-skin',skin);}
}catch(e){}})();`

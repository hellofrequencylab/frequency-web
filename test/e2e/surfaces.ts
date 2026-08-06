// Shared harness for the e2e VISUAL (Lift 6) and A11Y (Lift 3b) suites: the surface
// registry, the four render states, the quiet-by-default mask list, and the settle/guard
// helpers both suites need.
//
// Not a `*.spec.ts`, so Playwright's default testMatch never collects it as a test file.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'

/* ── The four render states ────────────────────────────────────────────────────
   app/globals.css defines TWO orthogonal axes:
     · MODE  — `.dark` on <html>  (`@custom-variant dark (&:where(.dark, .dark *))`)
     · SKIN  — `[data-skin="default" | "midnight"]`, whose dark-mode overrides are
               authored as the DESCENDANT selector `.dark [data-skin="midnight"]`.
   Four combinations, four looks: DAWN light/dark and Midnight light/dark. */

export type SkinId = 'default' | 'midnight'
export type ColorMode = 'light' | 'dark'

export interface RenderState {
  /** Stable id: goes in the test title AND the snapshot filename. */
  id: string
  skin: SkinId
  mode: ColorMode
}

const DAWN_LIGHT: RenderState = { id: 'dawn-light', skin: 'default', mode: 'light' }
const DAWN_DARK: RenderState = { id: 'dawn-dark', skin: 'default', mode: 'dark' }
const MIDNIGHT_LIGHT: RenderState = { id: 'midnight-light', skin: 'midnight', mode: 'light' }
const MIDNIGHT_DARK: RenderState = { id: 'midnight-dark', skin: 'midnight', mode: 'dark' }

/** Every render state the public surfaces are captured in. */
export const RENDER_STATES: readonly RenderState[] = [
  DAWN_LIGHT,
  DAWN_DARK,
  MIDNIGHT_LIGHT,
  MIDNIGHT_DARK,
]

/** The canonical look: what an anonymous visitor sees with no stored preference. */
export const DEFAULT_STATE: RenderState = DAWN_LIGHT

/** The states that are MEANINGFUL inside the member shell — see applyRenderState's note:
 *  the authed shell renders `[data-skin]` server-side on the shell root (a DESCENDANT of
 *  <html>), so it wins over anything we stamp on <html>. Only the mode axis is ours there,
 *  and capturing the two midnight variants would just duplicate these two baselines. */
export const SHELL_RENDER_STATES: readonly RenderState[] = [DAWN_LIGHT, DAWN_DARK]

/**
 * Stamp a render state so it is live on the FIRST paint of the first navigation.
 *
 * We do this THROUGH the app's own pre-paint bootstrap rather than against it. The inline
 * script in app/layout.tsx runs synchronously in <head> on every document and does:
 *   dark  = localStorage['freq-theme'] === 'dark' || (unset/'system' && prefers-color-scheme)
 *   skin  = localStorage['freq-skin'] → documentElement[data-skin]
 * An init script that only set the class/attribute would therefore be OVERWRITTEN a few
 * milliseconds later. Seeding the two localStorage keys instead makes the app's own script
 * compute exactly the state we asked for, on every navigation, for free.
 *
 * The direct class/attribute stamp is kept as belt-and-braces: it covers documents that do
 * not ship the bootstrap, and it is a no-op when the bootstrap agrees (it always will).
 * `emulateMedia` keeps `prefers-color-scheme` consistent for any component-level media
 * query, though the bootstrap never consults it once `freq-theme` is an explicit value.
 */
export async function applyRenderState(page: Page, state: RenderState): Promise<void> {
  await page.emulateMedia({ colorScheme: state.mode })
  await page.addInitScript(
    ({ skin, mode }: { skin: string; mode: string }) => {
      try {
        window.localStorage.setItem('freq-theme', mode)
        window.localStorage.setItem('freq-skin', skin)
      } catch {
        // Opaque origin (about:blank) — localStorage throws. The stamp below still lands,
        // and the real navigation's init-script run seeds the keys properly.
      }
      const el = document.documentElement
      if (el) {
        el.classList.toggle('dark', mode === 'dark')
        el.setAttribute('data-skin', skin)
      }
    },
    { skin: state.skin, mode: state.mode },
  )
}

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

export interface Surface {
  /** Route to visit, relative to PW_BASE_URL. */
  path: string
  /** Snapshot + test-title slug. Stable across route renames only if you keep it stable. */
  slug: string
  /** 'anon' renders signed-out; 'member' needs PW_STORAGE_STATE. */
  audience: 'anon' | 'member'
  /** Selectors masked on this surface only (on top of the global list). */
  masks?: readonly string[]
}

/** Last-known-good EDITABLE_PAGES paths, used only if the parse below cannot run.
 *  This is a FALLBACK, not the source of truth — see editablePagePaths(). */
const EDITABLE_PAGES_FALLBACK: readonly string[] = [
  '/',
  '/about',
  '/spaces',
  '/the-lab',
  '/the-community',
  '/the-quest',
  '/pricing',
  '/circles',
]

/** Public routes worth capturing that are NOT editor-backed (so they never appear in
 *  EDITABLE_PAGES). Keep this short: it is the only hand-maintained part of the list. */
const EXTRA_PUBLIC_PATHS: readonly string[] = ['/discover']

/** Fallback for protectedPathPrefixes() when proxy.ts cannot be read, mirroring the
 *  EDITABLE_PAGES_FALLBACK pattern above. Kept deliberately SHORT: only the prefixes that
 *  actually intersect the public surface list matter here. */
const PROTECTED_PREFIX_FALLBACK: readonly string[] = ['/circles']

function repoFile(relative: string): string | null {
  // Playwright runs from the package root, but be forgiving about the cwd.
  const cwd = process.cwd()
  for (const base of [cwd, join(cwd, '..'), join(cwd, '..', '..')]) {
    const candidate = join(base, relative)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * The templated marketing routes, READ FROM lib/page-editor/data.ts AT RUN TIME.
 *
 * Deliberately parsed from disk instead of imported: that module pulls in the Supabase
 * admin client and the Puck types at import time, which a test process has no business
 * booting. Deliberately parsed instead of hardcoded: `EDITABLE_PAGES` grows every time a
 * coded marketing page is converted to a template (Lift 5c), and the visual suite must
 * follow that list rather than drift behind it. Same "read the real file from disk"
 * pattern as lib/theme/skins.test.ts.
 *
 * A new route therefore shows up as MISSING BASELINES (a loud, correct signal to run the
 * runner's update_baselines mode), never as silent non-coverage.
 */
export function editablePagePaths(): readonly string[] {
  const file = repoFile('lib/page-editor/data.ts')
  if (!file) return EDITABLE_PAGES_FALLBACK

  const source = readFileSync(file, 'utf8')
  const block = source.match(/export const EDITABLE_PAGES\s*=\s*\[([\s\S]*?)\]\s*as const/)
  const body = block?.[1]
  if (!body) return EDITABLE_PAGES_FALLBACK

  const paths: string[] = []
  for (const match of body.matchAll(/path:\s*['"]([^'"]+)['"]/g)) {
    const value = match[1]
    if (value && !paths.includes(value)) paths.push(value)
  }
  return paths.length > 0 ? paths : EDITABLE_PAGES_FALLBACK
}

function slugFor(path: string): string {
  if (path === '/') return 'home'
  return path.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-') || 'home'
}

/**
 * The auth-walled path prefixes, READ FROM proxy.ts AT RUN TIME.
 *
 * Same disk-parse idiom as editablePagePaths() above, and for the same reason: proxy.ts
 * imports next/server and the Supabase SSR client at module load, which a test process has
 * no business booting. Parsing keeps ONE source of truth — the proxy decides what is
 * walled, and this registry follows it rather than keeping a second list that drifts.
 */
function protectedPathPrefixes(): readonly string[] {
  const file = repoFile('proxy.ts')
  if (!file) return PROTECTED_PREFIX_FALLBACK

  const source = readFileSync(file, 'utf8')
  const block = source.match(/const PROTECTED_PATHS\s*=\s*\[([\s\S]*?)\]/)
  const body = block?.[1]
  if (!body) return PROTECTED_PREFIX_FALLBACK

  const paths: string[] = []
  for (const match of body.matchAll(/['"](\/[^'"]*)['"]/g)) {
    const value = match[1]
    if (value && !paths.includes(value)) paths.push(value)
  }
  return paths.length > 0 ? paths : PROTECTED_PREFIX_FALLBACK
}

/**
 * Every ANONYMOUS-REACHABLE surface the visual + a11y suites cover.
 *
 * The filter is the point. `/circles` sits in EDITABLE_PAGES (so it arrived here as an
 * editor-backed marketing route) AND in proxy.ts's PROTECTED_PATHS (so an anonymous
 * visitor is redirected to /sign-in before the page renders). It therefore contributed 5
 * a11y contexts and 8 visual tests that could never produce a measurement — they skipped
 * on every run, forever, and were counted as part of a "44 of 84 tests do not run" figure
 * that was blamed entirely on the missing beta storage state. Only 12 of those 44 were.
 *
 * A page cannot be both editor-backed-and-public and auth-walled. Rather than special-case
 * the slug, the registry now asks the proxy: if anon cannot reach it, it is not an anon
 * surface. When /circles is opened to visitors, deleting its PROTECTED_PATHS entry brings
 * its 13 tests back automatically, with no edit here.
 */
export function publicSurfaces(): readonly Surface[] {
  const walled = protectedPathPrefixes()
  const isWalled = (path: string) =>
    walled.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))

  const paths: string[] = []
  for (const path of [...editablePagePaths(), ...EXTRA_PUBLIC_PATHS]) {
    if (isWalled(path)) continue
    if (!paths.includes(path)) paths.push(path)
  }
  return paths.map((path) => ({ path, slug: slugFor(path), audience: 'anon' as const }))
}

/**
 * The member-shell surfaces (Lift 6a's "app trio" + the Space console).
 *
 * Sign-in is magic-link only (app/sign-in/actions.ts → signInWithOtp), so there is no
 * scriptable password login to drive here. The suite therefore takes a pre-baked
 * `PW_STORAGE_STATE` file instead, and skips itself with a clear message when it is
 * absent. 🔴 Owner action: create the beta test account, save its storage state, and
 * expose the file to CI.
 *
 * The room and the Space console are account-specific, so their paths come from env
 * (PW_ROOM_PATH / PW_SPACE_SLUG). The room falls back to the channels index, which every
 * member can reach; the console is simply absent until a slug is provided.
 */
export function appSurfaces(): readonly Surface[] {
  const roomPath = process.env.PW_ROOM_PATH ?? '/channels'
  const spaceSlug = process.env.PW_SPACE_SLUG
  const surfaces: Surface[] = [
    { path: '/feed', slug: 'app-feed', audience: 'member' },
    { path: roomPath, slug: 'app-room', audience: 'member' },
    { path: '/settings', slug: 'app-settings', audience: 'member' },
  ]
  if (spaceSlug) {
    surfaces.push({
      path: `/spaces/${spaceSlug}/manage`,
      slug: 'app-space-console',
      audience: 'member',
    })
  }
  return surfaces
}

/** Path to a Playwright storage-state JSON for the beta member account, or undefined. */
export const STORAGE_STATE: string | undefined =
  process.env.PW_STORAGE_STATE && existsSync(process.env.PW_STORAGE_STATE)
    ? process.env.PW_STORAGE_STATE
    : undefined

/* ── Masking (the quiet-by-default rule, Lift 6c) ──────────────────────────────
   Every selector below is a NO-OP when it matches nothing, so the list is safe to apply
   to every surface. Each entry names the drift it kills.

   NOTE for whoever owns components/: none of these are semantic hooks — the codebase has
   no `data-testid`/`data-visual-mask` convention yet, so a few are structural (class
   combinations verified unique at the time of writing). Adding `data-visual-mask` to the
   live blocks would let this list shrink to one selector. Until then, treat a mask edit
   as part of the change that moved the markup. */
const GLOBAL_MASK_SELECTORS: readonly string[] = [
  // Absolute + relative timestamps ("3 days ago" moves every day).
  'time, [datetime]',
  // Anything the app itself declares as changing. sr-only live regions have a zero-size
  // box, so masking them costs nothing.
  '[aria-live]:not([aria-live="off"])',
  '[role="status"]',
  // The dispatch ticker. `animations: 'disabled'` already freezes it, but a cancelled
  // infinite animation still restarts from wherever layout put it on a slow load.
  '.animate-marquee',
  // Live member / Circle / event counts: LiveStatsBlock (components/marketing/blocks.tsx)
  // and the marketing StatBlock are the only two users of this class trio, and both of
  // them render a DB-backed numeral.
  'p.font-display.text-6xl',
  // Media + embeds: the on-air visualiser paints per frame, and third-party iframes
  // (chat widget, maps) are not ours to stabilise.
  'canvas, video, iframe',
  // Member avatars — different per account, and the beta account's may change.
  '[data-tour-anchor="avatar"]',
  'img[alt*="avatar" i]',
]

/** Escape hatch for the flaky-surface policy: quiet a surface the same week it flakes,
 *  without waiting for a code change. `PW_VISUAL_EXTRA_MASK=".foo,.bar"`. */
function envMaskSelectors(): readonly string[] {
  return (process.env.PW_VISUAL_EXTRA_MASK ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** The `mask` locators for a surface: global + per-surface + env. */
export function masksFor(page: Page, surface: Surface): Locator[] {
  return [...GLOBAL_MASK_SELECTORS, ...(surface.masks ?? []), ...envMaskSelectors()].map(
    (selector) => page.locator(selector),
  )
}

/* ── Navigation helpers ───────────────────────────────────────────────────── */

/**
 * Wait for a surface to stop moving: 'load', then a CAPPED networkidle (streaming
 * sections and analytics beacons mean /discover and the feed never reach true idle), then
 * web fonts, which swap late and shift every text metric, then HEIGHT.
 *
 * Height is the one that took three runs to find. `/feed` failed with `Failed to take two
 * consecutive stable screenshots` at 8497 → 9272 → 9390px, which reads like volatile
 * content and is not: the page carries five `<Suspense fallback={null}>` boundaries and
 * `/settings` carries twelve. A null fallback reserves ZERO height, so every boundary that
 * resolves does not swap a placeholder for content — it APPENDS. Neither of the first two
 * waits can see that. `networkidle` is capped precisely because these pages never idle, and
 * `document.fonts.ready` resolves long before the last boundary does.
 *
 * Masking cannot fix this and neither can a longer networkidle. A mask paints over a
 * region; the element keeps its box, so a masked block that arrives late still moves
 * everything under it. The failure is the page's HEIGHT, not its pixels.
 *
 * 🔴 DO NOT ADD A SCROLL PASS HERE. It has been tried and it cost 46 passing tests.
 * The reasoning was that `fullPage: true` stitches by scrolling, which trips lazy content,
 * which grows the page — so walking the document first would trigger everything while we
 * were still allowed to wait. That is plausible and it is not what happens. Scrolling fires
 * every scroll-triggered reveal on the page, and `animations: 'disabled'` does not undo it:
 * an IntersectionObserver toggling a class is JS state, not a CSS animation, and it does not
 * rewind when you scroll back to the top. Every marketing surface then rendered ~3% away
 * from a baseline captured without the scroll — over the 2% tolerance — and `/`, `/about`,
 * `/the-lab`, `/discover`, `/spaces`, `/the-community` and `/the-quest` all went red across
 * both viewports and all four render states. Measured: 3 failures became 49.
 *
 * The lesson is narrower than "no scrolling". The height problem was OBSERVED (a logged
 * 8497 → 9272 → 9390). The lazy-content problem was HYPOTHESISED and never seen. Shipping a
 * fix for the second alongside the first is what turned a three-surface failure into a
 * suite-wide one.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  // `.then(() => undefined)`: FontFaceSet is not serialisable across the protocol.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await settleHeight(page)
}

/**
 * Wait for `scrollHeight` to hold a single value. Observation only — this must not touch the
 * page, scroll it, or otherwise change what the camera is about to see (see the 🔴 note in
 * `settle`).
 *
 * The whole wait runs INSIDE one `page.evaluate` on purpose: polling height over the CDP wire
 * would put a round trip between each reading, so a page growing steadily could report the
 * same number twice by luck of timing and be declared stable — a flake that would surface
 * only under load. In-page, the readings are ~100ms apart and mean what they say.
 *
 * It resolves rather than throws on timeout. A surface that genuinely never settles should
 * fail as a SCREENSHOT diff, naming the surface and showing the pixels, not as an opaque
 * helper timeout several frames removed from the thing that moved.
 */
async function settleHeight(page: Page): Promise<void> {
  await page.evaluate(
    async ({ timeout, quietFor }) => {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
      const height = () => document.documentElement.scrollHeight

      // `quietFor` of no change is what counts as settled; a page that is still growing
      // resets the clock every time it does.
      const startedAt = Date.now()
      let last = height()
      let lastChangedAt = Date.now()
      while (Date.now() - startedAt < timeout) {
        await sleep(100)
        const current = height()
        if (current !== last) {
          last = current
          lastChangedAt = Date.now()
        } else if (Date.now() - lastChangedAt >= quietFor) {
          return
        }
      }
    },
    { timeout: 15_000, quietFor: 600 },
  )
}

/**
 * Fail LOUDLY if we are looking at Vercel's Deployment Protection interstitial instead of
 * the app. Without the bypass header every SSR route serves that wall, and both suites
 * would otherwise "pass" against a login screen or capture 96 identical baselines of it.
 */
export async function assertNotProtectionWall(page: Page): Promise<void> {
  const current = page.url()
  const host = (() => {
    try {
      return new URL(current).host
    } catch {
      return ''
    }
  })()
  const title = await page.title().catch(() => '')
  // Exact host or a true subdomain — `endsWith('vercel.com')` would also match a
  // look-alike like `notvercel.com`, which is the incomplete-sanitization pattern.
  const isVercelHost = host === 'vercel.com' || host.endsWith('.vercel.com')
  if (isVercelHost || /authentication required/i.test(title)) {
    throw new Error(
      [
        `Landed on Vercel Deployment Protection (${current}).`,
        'Set VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → project → Deployment Protection →',
        'Protection Bypass for Automation) so the suite tests the app instead of the wall.',
      ].join(' '),
    )
  }
}

/**
 * Fail LOUDLY when a MEMBER surface lands on /sign-in.
 *
 * Two different silences hide here, and neither may be allowed to pass as a result:
 *
 *  · The storage state is present but DEAD — an expired access token whose refresh token has
 *    already been rotated, or (the one that bites in CI) a session minted for a different
 *    host, because a Supabase auth cookie is domain-scoped and every PR gets a new preview
 *    hostname. Nothing about that is visible from the outside: Playwright would happily
 *    photograph the sign-in page under the name `/feed`, and the a11y suite would audit it
 *    and report on the sign-in form's contrast as if it were the shell's.
 *  · The account exists but cannot reach the surface (onboarding not finished, no Space
 *    membership). Same photograph-the-wrong-page outcome.
 *
 * A skip would be wrong here. The anon path skips because "this route has no public view" is
 * a true and permanent fact; this is a broken credential, which is a thing someone must fix,
 * so it throws.
 */
export function assertMemberSession(page: Page, surface: Surface): void {
  if (surface.audience !== 'member') return
  const landed = currentPathname(page)
  if (!landed.startsWith('/sign-in')) return
  throw new Error(
    [
      `${surface.path} redirected to ${landed} WITH a member session configured.`,
      'PW_STORAGE_STATE is set, so this is a dead credential rather than the known blind spot:',
      '  · the session expired, or its refresh token was already rotated by an earlier run; or',
      '  · it was minted for a different host (auth cookies are domain-scoped, and every PR',
      '    preview gets a new hostname), so re-mint it against THIS PW_BASE_URL.',
      'Re-mint with `pnpm e2e:session` — see test/e2e/README.md § The member shell.',
    ].join('\n'),
  )
}

/** Did an anonymous visit get bounced to sign-in? Returns the landing pathname. */
export function currentPathname(page: Page): string {
  try {
    return new URL(page.url()).pathname
  } catch {
    return ''
  }
}

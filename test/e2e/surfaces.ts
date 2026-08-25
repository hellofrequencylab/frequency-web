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
               authored as the selector LIST `.dark[data-skin="midnight"],
               .dark [data-skin="midnight"]` — this harness stamps BOTH axes on <html>
               (applyState below), and only the compound half matches that (LIVE-008).
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
  /** 'anon' renders signed-out; 'member' and 'operator' both need PW_STORAGE_STATE.
   *  'operator' is a member surface behind the /admin role floor as well as the auth wall
   *  (lib/admin/guard.ts), so it has one extra way to fail — see operatorDenialReason(). */
  audience: 'anon' | 'member' | 'operator'
  /** Selectors masked on this surface only (on top of the global list). */
  masks?: readonly string[]
  /**
   * Photograph the FIRST SCREEN instead of the whole page.
   *
   * For a surface whose length is driven by live, shared data, a `fullPage` baseline does not
   * record what the page looks like — it records what was in the database the moment it was
   * taken. `/feed` proved it: the recaptured baseline held for ~70 minutes and then failed on a
   * pure SIZE change (390x11772 expected, 390x11848 received) with no code between the two.
   * Re-running `update_baselines` only resets that clock.
   *
   * Masking cannot substitute for this. A mask paints over a region and the element keeps its
   * box, so a late or extra item still moves everything under it — the failure is the page's
   * HEIGHT (`surfaces.ts` records the same finding for `<Suspense fallback={null}>`).
   *
   * What is given up is an unbounded list of member posts, which was never design surface. What
   * is kept is the shell, the composer and the first cards — the part a designer actually owns.
   * Do NOT set this to paper over a flaky surface with real layout drift; the fix there is the
   * drift.
   */
  viewportOnly?: boolean
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
  return paths.map((path) => ({
    path,
    slug: slugFor(path),
    audience: 'anon' as const,
    ...(LIVE_DATA_PATHS.includes(path) ? { viewportOnly: true } : {}),
  }))
}

/**
 * Public surfaces that photograph the FIRST SCREEN instead of the whole page, by path.
 * **Deliberately empty**, the same way `ALLOWED_TWINS` in baseline-distinctness.test.ts is:
 * the seam stays so the next candidate lands as a row here with its measurement attached,
 * rather than as a magic string at the call site.
 *
 * 🔴 `/discover` WAS THE ONLY ENTRY IT EVER HELD (#2139), AND THE OWNER REVERSED THAT TRADE.
 * The flag is read per SURFACE, not per project, so it cost the below-the-fold baseline on
 * desktop AND mobile — eight PNGs, the topic bands, the circle grid and the footer among them —
 * to quiet a failure the record says is rare: the full-page baseline captured 2026-08-11 held
 * through 46 commits and three days of `pr-compare` before it moved. Paying eight baselines
 * permanently for that is the wrong side of the trade.
 *
 * ⚠️ THE CAUSE THE FIRST NOTE GAVE WAS WRONG, and it is worth correcting here because it is the
 * kind of wrong that makes the next reader reach for the same flag. It blamed `revalidate = 3600`
 * and "the ISR cache of whichever deployment answered". There is no ISR generation to blame.
 * `app/discover/page.tsx` calls `createClient()` (lib/supabase/server.ts → `cookies()`), which opts
 * the route out of static rendering altogether, and every discover read is a `.rpc()`, i.e. a POST,
 * which Next's data cache never stores. EVERY request runs the six queries live, and three of them
 * are order- or clock-sensitive:
 *   · `public_circles`  ORDER BY member_count DESC   one join reorders the top six
 *   · `public_posts`    ORDER BY created_at DESC     one post replaces the newest of three
 *   · `public_events`   WHERE starts_at >= now()     the upcoming window slides continuously
 *
 * ⚠️ AND THE PAGE'S HEIGHT IS A FUNCTION OF THAT TEXT, which is the part no wait can reach.
 * Measured on run 31826333373: mobile returned 390x9701 against a 390x9677 baseline on dawn-light,
 * dawn-dark and midnight-light, while midnight-dark passed and ALL FOUR DESKTOP captures passed.
 * No code change produces that shape. A narrower column does: 24px is exactly one `--text-body`
 * line (1.5rem), one row heading wrapping in the single-column mobile grid and absorbed on desktop
 * by an `h-full` sibling in the same three-up row. The same test's retries reported 76,014 then
 * 82,853 differing pixels at identical dimensions, so the content moved between two captures in
 * one run.
 *
 * 🔴 WHAT CANNOT FIX IT, listed so nobody spends the afternoon re-trying them:
 *   · A WAIT. The render is stable per request — Playwright logged "captured a stable screenshot"
 *     on every attempt, after `settle()` had already held `scrollHeight` still. The variance is
 *     between REQUESTS, not within one.
 *   · A MASK. A mask paints over a box and the box keeps its size (see `Surface.viewportOnly`).
 *   · `maxDiffPixelRatio`. `toHaveScreenshot` fails a size mismatch before it counts a pixel.
 *   · CSS injected at capture time (`toHaveScreenshot({ stylePath })`) genuinely CAN pin a height,
 *     and it still cannot pin this one: six live regions feed the page, and three of them (events,
 *     circles, posts) drop their entire section when the query comes back empty, which no clamp on
 *     a container can hold.
 *
 * SO THIS GATE WILL GO RED ON `/discover` AGAIN, and the honest reading when it does is the one
 * test/e2e/README.md already prescribes for `/spaces`. A `/discover`-only size mismatch worth one
 * or two text lines, on MOBILE ONLY, with all four desktop captures green, is the database moving:
 * recapture it. A shift that moves both viewports, or moves all four states together, is a layout
 * change and must be read as one.
 */
const LIVE_DATA_PATHS: readonly string[] = []

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
 * (PW_ROOM_PATH / PW_SPACE_SLUG). BOTH are absent until their env var is provided.
 *
 * 🔴 The room used to fall back to `/channels`, "which every member can reach". It does not:
 * `/channels` is in proxy.ts's PROTECTED_PATHS, that visit bounced, and #2049 committed four
 * `app-room` baselines that were pixel-for-pixel the marketing HOME page. An absent surface
 * is honest and shows up in the shell reporter as unphotographed; a bounced one photographs
 * the wrong page under the room's name. Never re-add a fallback here — point PW_ROOM_PATH at
 * a room the beta account is actually in.
 *
 * `env` defaults to the real environment; it is a parameter so a plain vitest test can
 * enumerate EVERY row — including the two only CI's env conjures — without setting env vars.
 * `baseline-distinctness.test.ts` uses that to learn which slugs are `viewportOnly`. Reading
 * it off these rows rather than re-listing the slugs is what keeps the two from drifting: a
 * future env-gated surface that opts into viewport capture is covered the day it is added.
 */
export function appSurfaces(
  env: { roomPath?: string; spaceSlug?: string } = {
    roomPath: process.env.PW_ROOM_PATH,
    spaceSlug: process.env.PW_SPACE_SLUG,
  },
): readonly Surface[] {
  const { roomPath, spaceSlug } = env
  const surfaces: Surface[] = [
    { path: '/feed', slug: 'app-feed', audience: 'member', viewportOnly: true },
    { path: '/settings', slug: 'app-settings', audience: 'member' },
    // Around You. Listed KNOWING it will SKIP until the seeded member account and its three repo
    // secrets exist (UX-MATURITY-PLAN lift 6a, an owner action), and that is the point rather than
    // an oversight: a listed-but-skipping surface is NAMED in the shell reporter's `unphotographed`
    // list on every PR, so the gap is visible in a job summary instead of being invisible because
    // nobody thought to add the row. It cost three consecutive PRs of dense layout work — a header
    // divider carrying a counts line, an aspect-ratio map band, a height-matched card grid — with
    // no automated check on any of it.
    //
    // 🔴 IT CANNOT BE AN `anon` SURFACE, and the reason is worth stating so nobody "fixes" it that
    // way. `/nearby` is auth-walled twice: proxy.ts lists it in PROTECTED_PATHS (so publicSurfaces()
    // filters it out on the same pass that drops /circles), and the page calls notFound() with no
    // user. An anon entry would either vanish from the registry or land on /sign-in and skip — a
    // permanent green with nothing behind it, which is the failure mode this file already fights.
    //
    // The structural half is covered TODAY and browserlessly by
    // test/a11y/nearby-map-header.a11y.test.tsx, on the already-required `test` check. What this
    // row buys is the pixels.
    //
    // ⚠️ AND SINCE ADR-1034, IT BUYS FEWER OF THEM THAN IT LOOKS. The page's header is now the live
    // map, and the map paints into a `canvas` — which GLOBAL_MASK_SELECTORS masks, correctly, since
    // tiles are not ours to stabilise. A Playwright mask paints over an element's BOUNDING BOX, and
    // the band's eyebrow / h1 / subtitle / button sit INSIDE that box, on top of the map. So the
    // baseline photographs the header as one magenta rectangle: everything below the band is still
    // covered, the band's own copy is not, and no mask selector can separate them because the text
    // and the tiles occupy the same rectangle by design.
    //
    // What holds that gap instead, so nobody reads this as uncovered: the jsdom test above asserts
    // the h1, the subtitle and the single control by content, and the @a11y shell run audits the
    // rendered band in a real browser (it is what caught the `aria-hidden` focus trap the first
    // version of this header shipped with). What is genuinely unmeasured is the band's APPEARANCE,
    // and an owner's eye on the Vercel preview is the check for it.
    { path: '/nearby', slug: 'app-nearby', audience: 'member' },
  ]
  if (roomPath) {
    surfaces.push({ path: roomPath, slug: 'app-room', audience: 'member' })
  }
  if (spaceSlug) {
    surfaces.push({
      path: `/spaces/${spaceSlug}/manage`,
      slug: 'app-space-console',
      audience: 'member',
    })
  }
  return surfaces
}


/* ── The operator surfaces (HYG-026, ADR-1128) ──────────────────────────────────
   🔴 WHY THIS BLOCK EXISTS. Until 2026-08-25 the visual suite's surfaces were, in full:
   `EDITABLE_PAGES` (parsed above) plus `/discover`. `EDITABLE_PAGES` answers a different
   question — WHICH PAGES THE PAGE EDITOR MAY EDIT — so what the camera watched was a
   by-product of an unrelated product decision, and the file contained ZERO '/admin' paths.
   No operator surface in the product was visually watched at all.

   That was found the only way it could be. A DAWN sweep moved 37 sites; exactly ONE of them
   sat on a watched surface, and that one produced 4 real failures. The other 36 moved while
   the run reported "140 passed" — a number that was never evidence the sweep held still.

   The parse stays: it is right, and Lift 5c conversions must keep joining automatically. What
   changes is that it is now ONE INPUT to a list chosen for COVERAGE, instead of the list. */

/**
 * The operator routes, CHOSEN BY MEASUREMENT rather than by taste.
 *
 * `node scripts/visual-surface-census.mjs` is the measurement, and it re-runs. It counts the
 * frozen `raw-button-bg` class (through check-adoption.mjs's own corpus, so it cannot drift
 * from the ratchet) and raw `<button>` opening tags (PROG-DAWN3's own basis), then attributes
 * them to routes on a DELIBERATELY SHALLOW basis: the files in a route's own directory plus two
 * import hops. Reading, 2026-08-25, ON THE TREE AFTER PROG-DAWN3 slice 1 (#2266) landed:
 *
 *   · 99 raw-button-bg (21.4% of 463) and 518 raw `<button>` (28.8% of 1,799) live in
 *     `app/(main)/admin/**` + `components/admin/**` — code an operator surface is the ONLY
 *     way to photograph. None of it was watched.
 *   · These seven routes hold 47 of the 98 raw-button-bg and 256 of the 481 raw `<button>`
 *     that all 92 static admin routes can be credited with — 48% / 53% of the operator
 *     population for 7.5% of the routes.
 *
 * 🔴 AN IMPORT IS NOT A RENDER, so every number here is an UPPER BOUND on what the camera
 * sees. The census header records the measurement that proves it matters: a FULL transitive
 * closure credits fourteen unrelated admin routes with the same 71 files, because a registry
 * deep in the graph imports most of the product. Widening this list on a transitive number
 * would buy coverage that does not exist.
 *
 * 🔴 AND `/admin` IS FIRST FOR A REASON THAT IS NOT ITS OWN DEBT. Whichever operator route
 * comes first buys the shared admin chrome — the sub-nav band, the Ask-Vera search bar, the
 * info rail, the page dock, the footer (`app/(main)/admin/layout.tsx`) — which nothing else in
 * the registry renders. The console index is the honest place to put that.
 */
const OPERATOR_PATHS: readonly { readonly path: string; readonly why: string }[] = [
  { path: '/admin', why: 'The console index — and the only surface that photographs the shared admin chrome (sub-nav, search band, info rail, page dock, footer). 6 raw-button-bg / 28 raw <button> of its own.' },
  { path: '/admin/library', why: 'Highest measured operator route: 12 raw-button-bg / 73 raw <button>.' },
  { path: '/admin/marketing/nurture', why: 'Second: 9 raw-button-bg / 65 raw <button>, and the entry point to the email-studio cluster.' },
  { path: '/admin/crew-tasks', why: '7 raw-button-bg / 17 raw <button> in two files — the densest ratio in the admin tree.' },
  { path: '/admin/crm', why: 'The Resonance CRM console head: 5 / 18 here, in front of the components/crm + components/admin/crm cluster.' },
  { path: '/admin/content/practices', why: '4 raw-button-bg / 43 raw <button> — the biggest single button population in the admin tree, a dense table plus its controls.' },
  { path: '/admin/qr', why: '4 raw-button-bg / 37 raw <button>; the QR studio is button-heavy and composes none of the kit.' },
]

/**
 * WHAT WAS DELIBERATELY LEFT OUT, so a later reader does not read this list as "the admin area".
 *
 *  · THE OTHER 85 STATIC ADMIN ROUTES. All 92 would be 368 captures on every PR that can move a
 *    pixel — roughly 18 minutes at the suite's measured ~11.5s/test over 4 workers — to buy the
 *    remaining 51 raw-button-bg. Seven buys 48% of the population for ~1.5 minutes. Cutting the
 *    tail is a trade, and it is stated here rather than performed silently: a silent truncation
 *    reads as coverage, which is the exact failure HYG-026 was filed about.
 *  · EVERY DYNAMIC ROUTE (`/admin/crm/deals/[...slug]`, `/admin/appearance/[id]`, …). They need
 *    a seeded id that survives across preview deployments; without one the surface would bounce
 *    and photograph the wrong page under an operator's name — the `app-room` failure (see
 *    assertMemberSession) with a different route.
 *  · THE SEEDER AND DEMO CONSOLES (`/admin/business-seeder` 3/27, `/admin/demo` 3/16). They are
 *    development fixtures, not operator product, and their content is generated. A button-first
 *    greedy cover picks `/admin/business-seeder` fifth; it is skipped on that ground, not missed.
 *  · THE @a11y AND OVERFLOW SUITES. Both read `publicSurfaces()` / `appSurfaces()` and are
 *    untouched by this change. An operator surface with no row in `a11y-baselines.json` is held
 *    to `$defaultMax` (0 serious+), so adding them there without a seeded ratchet capture would
 *    fail PRs on debt that predates them. That is its own change, with its own capture — filed
 *    as HYG-027.
 */
export function operatorSurfaces(): readonly Surface[] {
  return OPERATOR_PATHS.map(({ path }) => ({
    path,
    slug: slugFor(path),
    audience: 'operator' as const,
  }))
}

/**
 * THE VISUAL SUITE'S OWN SURFACE LIST — the union, and the answer to HYG-026.
 *
 * Three inputs, each with a different reason to be here:
 *   (a) `publicSurfaces()`  — the parsed `EDITABLE_PAGES` routes. Kept as an INPUT so a Lift 5c
 *       template conversion still joins the matrix the day it lands, with no edit here.
 *   (b) the public extras inside (a) (`EXTRA_PUBLIC_PATHS`) — routes with no editor row.
 *   (c) `operatorSurfaces()` — chosen above, by measurement.
 * plus `appSurfaces()`, the member shell, which was already its own list.
 *
 * ⚠️ IT IS A UNION, NOT A REPLACEMENT, and the ORDER of the inputs is not the point — the point
 * is that (c) can never again be a by-product of (a). If a future reader wants the visual suite
 * to watch something, this is the function that decides, and `scripts/visual-surface-census.mjs`
 * is how the argument gets made.
 */
export function coverageSurfaces(
  env?: { roomPath?: string; spaceSlug?: string },
): readonly Surface[] {
  return [...publicSurfaces(), ...appSurfaces(env), ...operatorSurfaces()]
}

/**
 * Did an OPERATOR surface bounce off the /admin role floor? Returns the reason, or null.
 *
 * 🔴 WHY THIS IS A SKIP AND NOT A THROW, when `assertMemberSession` throws for the member shell.
 * `requireAdminFloor()` (lib/admin/guard.ts) redirects a signed-in NON-STAFF viewer to `/feed`.
 * So a bounce to `/feed` from an /admin path means exactly one thing: the account behind
 * `PW_MEMBER_EMAIL` is a member and not an operator. That is an owner-held account fact, not a
 * defect in the pull request being tested — and a red X meaning "nobody has promoted the e2e
 * account yet" is the thing e2e.yml's own header says trains people to ignore the check.
 *
 * ⚠️ IT IS NOT SILENT, WHICH IS THE WHOLE DIFFERENCE FROM WHAT HYG-026 FOUND. These tests carry
 * the `@shell` tag, so `shell-reporter.ts` counts them and names every unphotographed operator
 * route in `$GITHUB_STEP_SUMMARY` on every run. The same treatment `/nearby` gets, for the same
 * reason: a listed-and-skipping surface is visible; an absent one is not.
 *
 * A bounce to /sign-in is NOT handled here — that is a dead credential and it still throws,
 * through assertMemberSession, because it means the member half of the matrix is lying too.
 */
export function operatorDenialReason(page: Page, surface: Surface): string | null {
  if (surface.audience !== 'operator') return null
  const landed = currentPathname(page)
  if (!landed.startsWith('/feed')) return null
  return [
    `${surface.path} redirected to ${landed}, which is requireAdminFloor()'s denial target:`,
    'the account behind PW_MEMBER_EMAIL is signed in and is NOT platform staff, so no operator',
    'surface can be photographed with it. Give that account web_role admin (or a staff role that',
    'sees an admin group) and these captures start running — see backlog HYG-027.',
  ].join(' ')
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
 *
 * ── 🔴 THE LAZY-CONTENT PROBLEM HAS NOW BEEN SEEN (2026-08-13) ────────────────────────────
 *
 * It is real, and it is WORSE than "a surface renders differently": it can freeze a broken
 * image into a baseline and INVERT the gate for that region — green while the image stays
 * broken, red the moment it renders correctly.
 *
 * The evidence. A capture run rewrote exactly one non-app baseline,
 * `spaces--dawn-dark-mobile.png`. Both versions are 390×16416 — identical dimensions, so it
 * never looked like a layout regression — and byte-identical everywhere except ONE contiguous
 * 421px band at y 4010..4430 (2.21% of pixels). Cropping both: the OLD baseline holds an empty
 * rounded rectangle, the NEW one holds the photograph that belongs there. The old capture had
 * photographed an image that never loaded, and that failure had been the expected state since.
 *
 * The band sits ~4000px down a 16416px page, far below the 390×844 mobile viewport, so it is
 * `loading="lazy"` content that was never asked to load. The height matched because the box is
 * correctly reserved; only the pixels were missing. On a dark theme an empty box reads as
 * deliberate negative space, which is why nobody caught it by eye.
 *
 * 🔴 THIS IS NOT A LICENCE TO RE-TRY THE SCROLL PASS. The note above still stands and the fix
 * is a DIFFERENT shape, which is precisely why the scroll pass failed: scrolling loads images
 * as a side effect of moving the viewport, and moving the viewport is what fires every
 * IntersectionObserver reveal on the page. Flipping `img.loading` to `eager` and awaiting
 * `img.decode()` loads the images WITHOUT moving anything, so it cannot trip a reveal.
 *
 * That change is not made here, because it contradicts this helper's observation-only rule and
 * would rewrite every full-page baseline currently holding a frozen-empty image — an owner
 * call, with an audit of the other 75 baselines for the same pattern first. Until then, treat a
 * baseline diff that is one contiguous band at identical dimensions as SUSPECTED FROZEN IMAGE
 * and crop both before judging it: the new capture is likely the correct one.
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

/** The shell's own content region (`app-shell.tsx`, `<main id="main" data-tour-anchor="content">`).
 *  Present on every authed surface and on NO marketing page, which is what makes it the
 *  positive half of the check below. */
const SHELL_MARKER = '[data-tour-anchor="content"]'

/**
 * Fail LOUDLY when a MEMBER surface photographs anything other than that surface.
 *
 * Three different silences hide here, and none may be allowed to pass as a result:
 *
 *  · The storage state is present but DEAD — an expired access token whose refresh token has
 *    already been rotated, or (the one that bites in CI) a session minted for a different
 *    host, because a Supabase auth cookie is domain-scoped and every PR gets a new preview
 *    hostname. Nothing about that is visible from the outside: Playwright would happily
 *    photograph the sign-in page under the name `/feed`, and the a11y suite would audit it
 *    and report on the sign-in form's contrast as if it were the shell's.
 *  · The account exists but cannot reach the surface (onboarding not finished, no Space
 *    membership). Same photograph-the-wrong-page outcome.
 *  · 🔴 The surface bounces somewhere that is NOT /sign-in. This is the one the first version
 *    of this guard could not see, and it had already happened when the guard was written:
 *    `appSurfaces()` defaults PW_ROOM_PATH to `/channels`, that visit landed on the marketing
 *    HOME page, and all four `app-room` baselines committed in #2049 are photographs of `/`
 *    — 99.3% to 99.7% pixel-identical to the `home` baselines, hero copy and JOIN THE BETA
 *    button included. A guard that only tests for `/sign-in` reads a bounce to `/` as success,
 *    and the next `update_baselines` run would have re-frozen the wrong page as the reference
 *    for a member room. Hence both halves below: the landing path must be the requested path,
 *    AND the shell must actually be on screen.
 *
 * A skip would be wrong here. The anon path skips because "this route has no public view" is
 * a true and permanent fact; this is a broken credential or a mis-pointed surface, which is a
 * thing someone must fix, so it throws.
 */
export async function assertMemberSession(page: Page, surface: Surface): Promise<void> {
  if (surface.audience === 'anon') return
  const landed = currentPathname(page)

  if (landed.startsWith('/sign-in')) {
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

  const requested = surface.path.split('?')[0].replace(/\/$/, '') || '/'
  const arrived = landed.replace(/\/$/, '') || '/'
  if (arrived !== requested) {
    throw new Error(
      [
        `${surface.path} landed on ${landed} — a DIFFERENT page, and it would have been`,
        `photographed under the name "${surface.slug}".`,
        'This is how all four app-room baselines became pictures of the marketing home page.',
        'Either the surface points at a route this account cannot reach (set PW_ROOM_PATH /',
        'PW_SPACE_SLUG to something it can), or the route now redirects and the registry in',
        'test/e2e/surfaces.ts needs to follow it.',
      ].join('\n'),
    )
  }

  if ((await page.locator(SHELL_MARKER).count()) === 0) {
    throw new Error(
      [
        `${surface.path} rendered without the member shell (${SHELL_MARKER} is absent),`,
        'so whatever is on screen is not the authed surface this baseline claims to be.',
        'Check the session first (`pnpm e2e:session`), then the route.',
      ].join('\n'),
    )
  }
}

/** Did an anonymous visit get bounced to sign-in? Returns the landing pathname. */
export function currentPathname(page: Page): string {
  try {
    return new URL(page.url()).pathname
  } catch {
    return ''
  }
}

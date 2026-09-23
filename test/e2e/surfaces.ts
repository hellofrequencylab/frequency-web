// Shared harness for the e2e VISUAL (Lift 6) and A11Y (Lift 3b) suites: the surface
// registry, the four render states, the quiet-by-default mask list, and the settle/guard
// helpers both suites need.
//
// Not a `*.spec.ts`, so Playwright's default testMatch never collects it as a test file.

import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Locator, Page } from '@playwright/test'

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

/** All four combinations the stylesheet can produce. Not every surface can reach all four — see
 *  PUBLIC_RENDER_STATES and SHELL_RENDER_STATES below, which are what the suites actually iterate. */
export const RENDER_STATES: readonly RenderState[] = [
  DAWN_LIGHT,
  DAWN_DARK,
  MIDNIGHT_LIGHT,
  MIDNIGHT_DARK,
]

/**
 * The states an ANONYMOUS surface can actually be in — **light only** (ADR-1323, 2026-09-11).
 *
 * Dark mode now requires an account: `resolveDarkMode` answers light for any browser with no
 * session, so a signed-out visitor CANNOT see `/pricing` or `/discover` dark, on any device, ever.
 * The two dark baselines for every public surface therefore photographed a state that no longer
 * exists, and they failed the moment the rule shipped — 68 of them, deterministically, which is the
 * product being right rather than the suite being wrong.
 *
 * 🔴 THE TEMPTING FIX IS THE WRONG ONE. The first attempt here seeded the `fq_acct` marker from
 * `applyRenderState` so the bootstrap would resolve dark anyway. That is forging the one fact the
 * rule turns on, to keep photographing something a user can never load — and it does not even work,
 * because the proxy DELETES that cookie on every anonymous response, so the harness would be racing
 * the server on every navigation. A baseline that can only be produced by lying to the app is not
 * coverage. It was removed.
 *
 * The member shell keeps both modes (SHELL_RENDER_STATES) and is unaffected: those surfaces run on a
 * real signed-in `storageState`, so their account marker is genuine and dark is genuinely reachable.
 */
export const PUBLIC_RENDER_STATES: readonly RenderState[] = [DAWN_LIGHT, MIDNIGHT_LIGHT]

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
 * script in app/layout.tsx runs synchronously in <head> on every document and applies the mode law
 * in lib/theme/mode.ts (see resolveDarkMode there for the full ordering):
 *   dark  = not light-locked && not (/discover on a phone) && HAS AN ACCOUNT
 *           && (freq-theme === 'dark' || ('system' && prefers-color-scheme: dark))
 *   skin  = localStorage['freq-skin'] → documentElement[data-skin]
 * An init script that only set the class/attribute would therefore be OVERWRITTEN a few
 * milliseconds later. Seeding storage instead makes the app's own script compute exactly the state
 * we asked for, on every navigation, for free.
 *
 * It does NOT seed the account marker, and must not. A dark render state is only meaningful where
 * the viewer genuinely has an account — the member shell, which supplies a real `storageState`.
 * For an anonymous surface the honest answer is that dark is unreachable, which is why
 * PUBLIC_RENDER_STATES is light-only rather than why this function forges a cookie.
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
 * to quiet a failure the record says is rare.
 *
 * LIVE-373 took the other door of the same trade: /discover still photographs full-page, but
 * those eight captures are @advisory (non-blocking). viewportOnly stays empty. A new listed Circle
 * must not fail the blocking public tier.
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
 *   · THE PIXEL TOLERANCE, whatever its shape. `toHaveScreenshot` fails a size mismatch before it
 *     counts a pixel, so neither the retired `maxDiffPixelRatio` nor today's absolute
 *     `maxDiffPixels` (ADR-1258) ever runs on this failure.
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
 *
 * ── 2026-09-10, LIVE-301: IT WENT RED, AND IT WAS THE OTHER FAILURE ───────────────────────────
 * `pr-compare` run 34539497155 (PR #2539) failed ALL EIGHT `/discover` baselines — `[desktop]`
 * and `[mobile]` x dawn-light, dawn-dark, midnight-light, midnight-dark — each reporting
 * "991 pixels (ratio 0.01 of all image pixels) are different". Read against the prescription
 * above, that is the OPPOSITE signature and must not be recaptured:
 *   · a PIXEL DIFF, not a size mismatch. `toHaveScreenshot` fails a size mismatch BEFORE it
 *     counts a pixel, so a pixel count is proof the dimensions matched. Height was not the fault.
 *   · BOTH viewports and ALL FOUR states, which the prescription above reads as a layout change —
 *     except the two theme pairs override their own tokens, and 991 pixels at ratio 0.01 is
 *     content-sized, not layout-sized. (`/nearby`'s mask change on the same run reads 0.16-0.17,
 *     139k-178k pixels. That is what a layout move looks like here.)
 * Recapturing would have reset a clock that drifts again within the hour — the trade LIVE-301
 * refused for `/nearby`. So the live boxes carry `data-visual-mask` instead (ADR-1277, six sites
 * in VISUAL_MASK_SITES below, `discover-*`), and the page's design surface stays photographed:
 * every SectionHeading and kicker, the body copy, the browse links, the dark Statement beat, the
 * ZigZag, the FAQ, the closing CTA, and both empty-state fallbacks.
 *
 * ⚠️ AND ONE PREMISE ABOVE IS STALE, corrected here rather than left to mislead the next reader.
 * The paragraph above says `app/discover/page.tsx` "calls `createClient()` (lib/supabase/server.ts
 * → `cookies()`)", so the route is never static and every request runs the six queries live. The
 * code says otherwise, and the code wins: `lib/discover.ts` imports `createPublicClient`
 * (lib/supabase/public.ts), whose cookie adapter returns `[]` and sets nothing, and
 * `app/discover/static-render.test.ts` FAILS the build if any page under `app/discover` reaches
 * for `cookies()`, `headers()`, `auth.getUser()` or `@/lib/supabase/server` at all. `/discover` is
 * prerendered with `export const revalidate = 3600`.
 * That does not weaken the diagnosis, it sharpens it: the six readings are baked AT BUILD TIME, and
 * `pr-compare` photographs the PR's OWN fresh Vercel preview deployment against baselines
 * committed from an older build. So every reading on the page differs whenever the database moved
 * between the two builds — which is why a recapture buys nothing beyond the next deploy, and why
 * the drift is uniform across all eight states rather than sampled per capture.
 *
 * 🔴 WHAT THE MASKS STILL DO NOT ANSWER, stated so the NEXT `/discover` failure is read correctly.
 * A mask paints a box and moves nothing. `app/discover/page.tsx` guards its Channels, events,
 * circles and posts sections with `.length > 0`, so any one of them DROPS ENTIRELY when its query
 * comes back empty; the hero swaps its whole block at SOCIAL_PROOF_FLOOR; the locator swaps
 * map-plus-list for a single card when no city cluster plots; and a list that returns three rows
 * instead of four is simply a shorter page. Every one of those is a HEIGHT, and no mask fixes a
 * height (ADR-1277 §3) — the same limit `/nearby` records for a published Dispatch. When the
 * picture shows a DIMENSION change on this surface, the masks are not the thing that failed.
 */
const LIVE_DATA_PATHS: readonly string[] = []

/**
 * THE RIGHT RAIL AS ONE BOX (LIVE-457, [ADR-1522](../../docs/DECISIONS.md); 2026-09-22,
 * e2e-manual runs 93 and 94 are the measurement).
 *
 * 🔴 WHAT WAS MEASURED, because this is the fourth theory this failure attracted and the first
 * three were wrong. Two `update_baselines` captures of the SAME commit, two hours apart, against
 * two previews (runs 93 and 94). Exactly eight PNGs changed, and six of them are the six that
 * `pr-compare` fails: /settings, /nearby and the Space console at desktop in both modes. Every
 * differing pixel in all six sits in `x: 940..1245` — the rail column, nothing else on the page.
 * The counts match what pr-compare reports to within a rounding error (/nearby 49266 against
 * 49266; /settings 57396 against 57343; the console 8130 against 8077).
 *
 * WHAT MOVES. The masked panel blocks, measured down the rail on /settings:
 *
 *   run 93   242-440  467-567  593-799(207)  802-927  953-1234  1260-1530
 *   run 94   242-440  467-567  593-718(126)  744-869  896-1176  1203-1473
 *
 * One panel is 207px in one capture and 126px in the next. Everything below it shifts up 57px.
 * `/nearby` shows the same thing on a different panel (490 -> 433). These are live lists — the
 * next gathering in the member's Circles, the newest posts in their Spaces (see the
 * `community-panel` entry in VISUAL_MASK_SITES) — and a list with one fewer row is a shorter box.
 *
 * ⚠️ SO EVERY REMEDY THAT WAS REACHED FOR FIRST IS RULED OUT BY THE MEASUREMENT, and they are
 * named here so nobody reaches for them again:
 *   · `viewportOnly` — the Space console ALREADY carries it and fails anyway; the drift is at
 *     y 719..799, inside the first screen. It is not a page-height failure: not one of the six
 *     is a dimension mismatch. Playwright would have said so before counting a pixel.
 *   · A COLOUR regression — ruled out by the two captures differing with no code between them.
 *   · RECAPTURING — run 94 is that experiment. It moved the baseline to the other sample and
 *     changed nothing, because `update_baselines` commits, the commit builds a new preview, and
 *     the comparison is never against the deployment the picture came from.
 *   · Masking each panel — already done (`rail-panel`), and it is why the rail is already a
 *     column of magenta in every committed baseline. A mask paints a box and moves nothing.
 *
 * WHAT THIS DOES INSTEAD. One mask over the rail's `<aside data-rail-column>`, which is a flex
 * child stretched to the content column's height — so its BOX is stable while its children
 * resize inside it. The cost is stated rather than hidden and it is genuinely small: every panel
 * in that column was already masked, so the pixels given up are the ~26px gaps between magenta
 * rectangles, the rail's own ground, and the two static buttons at its head (Report a bug,
 * Invite a friend) on these three surfaces.
 *
 * 🔴 `/feed` DELIBERATELY DOES NOT GET THIS. Its rail did not move between the two captures (it
 * is not among the eight changed PNGs — `railFor('/feed')` plans different panels), so it still
 * photographs the rail head for real. Per-surface and measured, the way `/discover` was not:
 * when a fourth surface starts drifting, it joins this list with its own reading attached.
 */
const RAIL_COLUMN_MASK: readonly string[] = ['[data-rail-column]']

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
    // The home feed. `viewportOnly` for the reason on the flag, and since LIVE-308 the first
    // screen also carries two `data-visual-mask` sites (`feed-*` in VISUAL_MASK_SITES below).
    // Read the committed PNG before reasoning about this row: at 1280x800 and 390x844 the first
    // screen of the e2e account is the date eyebrow, the time-of-day greeting, the onboarding
    // guide and the top of the Capture box. POSTS ARE NOT ON IT. What moves every hour up there
    // is the heading, which is a clock read in America/Los_Angeles, and the drift LIVE-308
    // measured appeared between 00:56Z and 01:03Z, across 18:00 Pacific, when "Good afternoon"
    // becomes "Good evening". So the heading row is masked (`feed-greeting`) and the stream
    // (`feed-stream`) is masked for the day the first screen reaches it. What stays in the
    // picture is the design surface: the shell, the Settings divider row, the onboarding guide
    // (account state, which moves only when the account acts), the Capture box, and the
    // empty pane if the stream is empty.
    // ⚠️ Heights this cannot hold, so the next size mismatch is read correctly: the guide gives
    // way to the JourneyBoard when onboarding completes (ADR-1362 put that board back at the top
    // of this page on every viewport, so it is in the 390-wide capture too, where LIVE-248 had
    // briefly left nothing); the walkthrough, role-promotion, Your corner, host-prompt and
    // romance cards each mount or not per account and per day; and at 390 wide the afternoon
    // greeting is a few pixels wider than the title block, so the h1 may take a third line
    // between 12:00 and 18:00 Pacific. None of those is a mask's to fix.
    { path: '/feed', slug: 'app-feed', audience: 'member', viewportOnly: true },
    { path: '/settings', slug: 'app-settings', audience: 'member', masks: RAIL_COLUMN_MASK },
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
    // 🔴 THE PAGE IS A READING, SO ITS LIVE BOXES DECLARE THEMSELVES (LIVE-301, 2026-09-10). Six
    // pr-compare failures on #2537 — desktop / mobile / narrow x dawn-light / dawn-dark — each
    // reporting the SAME 1347 differing pixels at identical dimensions. One number in six contexts
    // is not a rendering regression and is not a size drift: it is text that renders identically at
    // 1280, 390 and 320, moving between the capture (21:28Z) and the comparison (22:00Z).
    //
    // WHY IT IS MASKED AND NOT PHOTOGRAPHED FIRST-SCREEN-ONLY. Both remedies were on the table and
    // the committed baselines decided it. Crop this surface's own PNG at the fold: above it sit the
    // masked map canvas (one magenta rectangle, ~2/3 of the first screen), the map legend, the
    // at-a-glance line (four DB tallies) and the head of Coming up (event titles and DATES). Every
    // drifting box on this page is ABOVE the fold, so photographing the first screen alone keeps
    // 100% of the drift and gives up 60% of the page — the opposite of the trade `/feed` makes,
    // where the shell and the composer are stable and the unbounded post list is what is dropped.
    // So the five live boxes carry `data-visual-mask` (ADR-1277, VISUAL_MASK_SITES below) and the
    // page's chrome — hero band, two-column grammar, section headers, quick links, empty states —
    // stays in the picture.
    //
    // ⚠️ WHAT THIS DOES NOT ANSWER, stated so the next failure is read correctly: a mask paints a
    // box and moves nothing. If a Dispatch is published between two captures the list gets a row,
    // the page gets taller, and Playwright fails on SIZE before it counts a pixel. That failure has
    // not been seen here (this account reads "0 recent Dispatches"), and its remedy is the other
    // one. Do not reach for it before the picture shows a dimension change.
    //
    // What holds that gap instead, so nobody reads this as uncovered: the jsdom test above asserts
    // the h1, the subtitle and the single control by content, and the @a11y shell run audits the
    // rendered band in a real browser (it is what caught the `aria-hidden` focus trap the first
    // version of this header shipped with). What is genuinely unmeasured is the band's APPEARANCE,
    // and an owner's eye on the Vercel preview is the check for it.
    { path: '/nearby', slug: 'app-nearby', audience: 'member', masks: RAIL_COLUMN_MASK },
  ]
  if (roomPath) {
    surfaces.push({ path: roomPath, slug: 'app-room', audience: 'member' })
  }
  if (spaceSlug) {
    surfaces.push({
      // viewportOnly, and NOT for the reason this flag usually carries. The Space console's body is
      // LIVE PRODUCTION DATA - a card list that grows as the account's Space gains content - so a
      // fullPage baseline of it measures WHEN it was taken, which is exactly what the note on
      // `Surface.viewportOnly` says a full-page shot of a live stream does. LIVE-186 recorded the
      // consequence twice: the surface went 158 px stale in three weeks, was recaptured, and then
      // read 390x3017 at 16:21Z on 2026-09-07 and 390x2765 at 00:56Z on 2026-09-08 - 252 px in eight
      // hours, same production, no deploy touching the route. No recapture cadence holds that, and
      // every gap between chores is a red check everyone learns to merge past (ADR-970). Owner
      // ruling 2026-09-08, ADR-1265. The cost is real and is stated rather than hidden: below-fold
      // coverage on this one surface is gone.
      path: `/spaces/${spaceSlug}/manage`,
      slug: 'app-space-console',
      audience: 'member',
      viewportOnly: true,
      masks: RAIL_COLUMN_MASK,
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
  // 🔴 WAS `/admin/crm` UNTIL 2026-09-10, AND THE SWAP IS THE WHOLE LESSON (ADR-1314). That route
  // is `requireAdmin('janitor')` with NO staff escape, so NO `team_members` role can open it — not
  // analyst, not admin, not owner. Only `web_role` janitor or admin does, which is the meta-admin
  // tier a Playwright credential must never hold. This list was chosen by counting buttons and
  // nobody checked whether the e2e account could REACH what it named, so the census picked a route
  // the suite could never photograph and the gap read as a capture bug for two weeks.
  // `/admin/circles` is the nearest comparable that a staff role can actually open: 4 raw-button-bg
  // / 26 raw <button> against crm's 6 / 21 — fewer tinted backgrounds, more buttons.
  { path: '/admin/circles', why: 'The Circles operator console: 4 raw-button-bg / 26 raw <button>, and reachable by a staff role — see the note above for why it replaced /admin/crm.' },
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
 *  · THE OVERFLOW SUITE. It reads `publicSurfaces()` / `appSurfaces()` and is untouched. The
 *    @a11y suite DID say the same here until 2026-09-07; it now audits these seven too, held to
 *    readings of 0 in `a11y-baselines.json` (the zero-tolerance join rule, made explicit) that
 *    the first staff-session run measures for real (HYG-027, ADR-1239).
 */
/**
 * `/admin/qr` PHOTOGRAPHS ITS FIRST SCREEN ONLY, and this is the one place in the file that
 * records why, because `viewportOnly` is a coverage trade and a silent one reads as coverage.
 *
 * THE MEASUREMENT. Four consecutive PRs went red here on four unrelated diffs, none of which
 * touches anything this page renders: #2873 (flaky, lucky on the retry), #2874, #2875, #2878.
 * Every run the same pair of heights, 14521 and 14567, and the same differing-pixel count.
 *
 * IT IS NOT DRIFT AND A RECAPTURE CANNOT FIX IT. `toHaveScreenshot` compares each capture with
 * the PREVIOUS capture to prove the page is still, and gets the flip back, so it never takes
 * two consecutive stable frames. The page is BOTH heights; a baseline is one of them. Whichever
 * we committed would be red from the other side, which is why the obvious move was refused.
 *
 * WHAT IS RULED OUT, so nobody re-walks it. By arithmetic over the committed PNG (the comparator
 * pads both images and diffs the whole canvas, so the pixel count inverts): a 46px band entering
 * at the TOP would differ by ~996,772 pixels against the ~47,000 observed, which puts the
 * insertion at the foot of the Analytics block and makes every frame identical above y~13,500.
 * That kills the coarse-pointer touch floor, the `--tab-bar-clearance` asymmetry and every
 * `<Suspense fallback={null}>` on the surface. Two further theories died with evidence: the
 * chart's empty state was made dimension-invariant and the flip survived it, and `fullPage` was
 * shown NOT to resize the layout viewport in playwright-core 1.63 (`captureBeyondViewport`, no
 * `setDeviceMetricsOverride` in that path), which refutes the viewport-unit explanation. Its
 * arithmetic refutes it too: that model predicts a delta of 46 + X where X is zero on DESKTOP,
 * the viewport that passes, and >=112.5 on mobile, the one that fails.
 *
 * WHY THE FLAG RATHER THAN A SKIP. This is the same remedy `/feed` carries, for the reason the
 * flag exists: a page whose full-page height is not a function of its own content cannot be
 * photographed whole, and a picture of the first screen is still a real gate on the chrome, the
 * heading, the stat cards and the controls, which is what this surface was chosen for (it leads
 * the operator tree on raw buttons). What is given up is ~13,700px below the fold, stated here
 * rather than performed silently. The flip keeps its own row; when it is found, delete this
 * entry and the surface goes back to full-page in the same change.
 */
const VIEWPORT_ONLY_OPERATOR_PATHS: readonly string[] = ['/admin/qr']

export function operatorSurfaces(): readonly Surface[] {
  return OPERATOR_PATHS.map(({ path }) => ({
    path,
    slug: slugFor(path),
    audience: 'operator' as const,
    ...(VIEWPORT_ONLY_OPERATOR_PATHS.includes(path) ? { viewportOnly: true } : {}),
  }))
}

/**
 * THE OPERATOR SURFACES THAT ARE PHOTOGRAPHED BUT DO NOT VOTE (owner ruling 2026-09-23).
 *
 * An advisory surface is STILL CAPTURED, still compared and still reported. What it does not do
 * is fail a pull request. `/discover` went first (LIVE-373) and its describe in visual.spec.ts
 * states the rule this list obeys: A GATE THAT CANNOT FIRE TRUTHFULLY STAYS ADVISORY.
 *
 * 🔴 THIS IS NOT A SKIP LIST AND IT MUST NEVER BECOME ONE. The roster stays whole:
 * `operatorSurfaces()` is unchanged, `coverageSurfaces()` is unchanged, a11y and overflow are
 * unchanged, and the capture still runs on every pull request in the `@advisory` step. The one
 * thing that changes is which step's exit code the result lands in. A path that stopped being
 * photographed altogether would be the HYG-026 silence again, so `visual-tiers.test.ts` asserts
 * in-tree, on every pull request, that each path here has an advisory describe capturing it.
 *
 * ⚠️ AND THE COVERAGE LEDGER HAS TO BE TOLD. `shell-reporter.ts` counts `@shell` tests against
 * `operatorSurfaces()`, and the advisory describes are deliberately NOT `@shell` (the same
 * reason /discover is not: a running advisory capture must not let the reporter call the authed
 * app covered). So in the blocking shell run these paths are collected by nobody, and without
 * this list the banner would call them "unphotographed", false in the other direction, and
 * with `PW_REQUIRE_OPERATOR` set it would go red for a surface that WAS photographed. The value
 * is the backlog row that owns the downgrade, so the banner can cite it: see
 * `summarizeShellCoverage`, which reports these as advisory rather than as missing.
 *
 * The row is the debt. Clear the row, delete the entry, and the surface votes again.
 */
export const ADVISORY_OPERATOR_SURFACES: Readonly<Record<string, string>> = {
  // LIVE-476. Four consecutive pull requests that touched nothing this page renders went red
  // here. First the full-page height flip (14521 ↔ 14567), settled by the first-screen-only
  // capture above; then, on the first screen, a small STABLE desktop diff: 951 px dawn-light,
  // 1029 px dawn-dark, identical across three attempts, mobile green. The cause is NOT KNOWN.
  // Live tallies are ruled out by measurement, not by argument: the four StatCards on this page
  // read `qr_scans`, which has had no new row since 2026-09-18 and none at all since the
  // baseline was captured, so the numbers in the picture are frozen.
  '/admin/qr': 'LIVE-476',
}

/** The advisory operator paths, as a list. `visual.spec.ts` filters both operator loops on this
 *  so the blocking loop and the advisory describe can never drift apart. */
export const ADVISORY_OPERATOR_PATHS: readonly string[] = Object.keys(ADVISORY_OPERATOR_SURFACES)

/* ── The narrow phone, and the header band (HYG-057, ADR-1270) ──────────────── */

/** The Playwright project that photographs at 320px. Named once, so a spec can ask
 *  `testInfo.project.name === NARROW_PROJECT` without a string literal per call site. */
export const NARROW_PROJECT = 'narrow'

/**
 * THE HEADER BAND AS ITS OWN SURFACE — the second follow-up ADR-1035 named, and NOT for the
 * reason ADR-1035 gave.
 *
 * 🔴 THE ORIGINAL REASON HAS EXPIRED, and re-implementing it as written would have bought
 * nothing. ADR-1035 asked for this because the tolerance was `maxDiffPixelRatio: 0.02`, so a
 * 64px header was ~0.35% of an 18,000px capture and "the chrome at the top of every page could
 * change COMPLETELY and still pass". ADR-1258 retired that ratio for an absolute
 * `maxDiffPixels: 400` — 59% of the smallest control the design system draws, on a 390x844
 * capture and a 1280x16110 one alike. A marketing header that moves today fails `home`,
 * `about` and every other full-page baseline at both existing widths. Re-framing those same
 * pixels as a second surface at 1280 and 390 would be eight PNGs that re-photograph what is
 * already gated, and re-photographing something is not covering it.
 *
 * WHAT DOES NOT EXIST AT ANY TOLERANCE is a picture of the marketing header BELOW 390 — which
 * is exactly where ADR-1035's own defect lived: the menu button, the only navigation a
 * signed-out visitor has under `md`, at x=404 on a 360px screen. The member shell is reachable
 * at 320 through `appSurfaces()`; an anonymous visitor's chrome was reachable nowhere. So the
 * band is a NARROW-PROJECT surface, and `visual.spec.ts` runs it there only.
 *
 * `viewportOnly` for the reason the flag exists: the subject is the band, and a full-page shot
 * at 320 would bury a 64px header under ten thousand pixels of marketing copy — the framing
 * problem ADR-1035 described, reproduced at a third width. One screen, four states, one project:
 * 4 PNGs.
 *
 * 🔴 THE PATH IS `/how-to-build-community`, NOT `/`, AND THAT IS A MEASUREMENT RATHER THAN A
 * PREFERENCE. `viewportOnly` gives up the height signal that tells a real capture from a
 * protection wall, so `baseline-distinctness.test.ts` substitutes a different kind of evidence:
 * our surfaces repaint between light and dark, a wall does not, and a light/dark similarity
 * above 90% is read as a wall. That bar was measured on FULL-PAGE captures, where body copy
 * inverts across thousands of pixels. A FIRST SCREEN is hero-dominated and much more
 * theme-insensitive, so the two do not have the same headroom at all. Measured 2026-09-08 by
 * cropping the committed 390-wide baselines to their first 568px, dawn light vs dawn dark:
 *
 *   /                        92.8%   🔴 OVER the bar — a `/` band would have failed on capture
 *   /discover                87.0%
 *   /pricing                 85.1%
 *   /about                   84.4%
 *   ... eleven more between 69% and 83% ...
 *   /how-to-build-community   1.1%   ✅ two orders of magnitude of headroom
 *
 * The home hero is a full-bleed image that barely repaints; the article page is header + title +
 * prose on a ground that inverts completely. Every marketing page renders the SAME band
 * (wordmark, the Start a Circle CTA, the menu button — ADR-1035's exact trio), so the choice
 * costs nothing in subject and buys the whole margin. It also frames better: no hero competes
 * with the band for the screen.
 */
export function headerBandSurfaces(): readonly Surface[] {
  return [
    { path: '/how-to-build-community', slug: 'header-band', audience: 'anon', viewportOnly: true },
  ]
}

/**
 * THE VISUAL SUITE'S OWN SURFACE LIST — the union, and the answer to HYG-026.
 *
 * Three inputs, each with a different reason to be here:
 *   (a) `publicSurfaces()`  — the parsed `EDITABLE_PAGES` routes. Kept as an INPUT so a Lift 5c
 *       template conversion still joins the matrix the day it lands, with no edit here.
 *   (b) the public extras inside (a) (`EXTRA_PUBLIC_PATHS`) — routes with no editor row.
 *   (c) `operatorSurfaces()` — chosen above, by measurement.
 *   (d) `headerBandSurfaces()` — the narrow project's own surface (ADR-1270). It is in the union
 *       because `baseline-distinctness.test.ts` reads THIS function to learn which slugs are
 *       `viewportOnly`, and a surface it cannot see reads as a compromised capture rather than
 *       as an unknown — the fail-closed property that file's header insists on. A narrow-only
 *       surface is precisely the kind the old `appSurfaces()`-only read would have missed.
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
  return [...publicSurfaces(), ...appSurfaces(env), ...operatorSurfaces(), ...headerBandSurfaces()]
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
/**
 * The phrase every role-floor skip carries, and the ONE string `shell-reporter.ts` looks for in a
 * skipped test's annotation to tell "bounced off requireAdminFloor()" apart from every other skip.
 * A constant rather than a regex written twice, so the reporter cannot stop recognising the reason
 * the day somebody rewords it.
 */
export const ROLE_FLOOR_MARKER = "requireAdminFloor()'s denial target"

export function operatorDenialReason(page: Page, surface: Surface): string | null {
  if (surface.audience !== 'operator') return null
  const landed = currentPathname(page)
  if (!landed.startsWith('/feed')) return null
  return [
    `${surface.path} redirected to ${landed}, which is ${ROLE_FLOOR_MARKER}:`,
    'the account behind PW_MEMBER_EMAIL is signed in and is NOT platform staff, so no operator',
    'surface can be photographed with it. Give that account web_role admin (or a staff role that',
    'sees an admin group) and these captures start running — see backlog HYG-027.',
  ].join(' ')
}

/**
 * THE SAME DENIAL, RE-READ AT THE MOMENT THE CAMERA FIRES.
 *
 * 🔴 WHY THIS EXISTS BESIDE `operatorDenialReason` RATHER THAN INSIDE IT. That one is read
 * immediately after `goto` resolves. The bounce can land AFTER it: `requireAdmin()` denies at the
 * PAGE, not at the floor, and `settle()` alone waits up to 25s before the screenshot. Everything
 * in that gap is attributed to the route the test names.
 *
 * MEASURED, 2026-09-10 (e2e-manual run 34517618524, capture against production): EIGHT of the
 * sixteen committed operator baselines were photographs of `/feed` carrying an operator route's
 * name. `admin-qr--dawn-light-desktop.png` was the member feed. Nothing in the suite objected:
 *   · `operatorDenialReason` had already read the path and seen `/admin/qr`;
 *   · `assertMemberSession` CANNOT catch it, because /feed genuinely has the member shell it
 *     looks for — that guard proves a session, not a destination;
 *   · the height instability that made the run look flaky was /feed being an infinite stream,
 *     which is why `/feed` itself is `viewportOnly` — a full-page shot of it never settles.
 * Only `baseline-distinctness.test.ts` noticed, and only for the ONE pair that happened to settle
 * at the same instant and collide byte-for-byte. The other six would have become main's baselines,
 * and every later pull request would have been gated against a picture of the member feed.
 *
 * So the destination is re-read where it actually matters: last thing before the shutter. A
 * surface that is no longer on its own path is SKIPPED with the cause named, never photographed —
 * a missing baseline is a gap, a wrong one is a lie that gates everybody.
 */
export function operatorLandedElsewhere(page: Page, surface: Surface): string | null {
  if (surface.audience !== 'operator') return null
  const landed = currentPathname(page)
  if (landed === surface.path || landed.startsWith(`${surface.path}/`)) return null
  const floor = landed.startsWith('/feed') ? ` which is ${ROLE_FLOOR_MARKER},` : ''
  return [
    `${surface.path} was on its own path when the page loaded but is on ${landed} now,${floor}`,
    'so the capture would carry this route\'s name over another page. The account behind',
    'PW_MEMBER_EMAIL clears requireAdminFloor() but is denied by this PAGE: requireAdmin(min,',
    "{ staff }) defaults to staffLevel 'write', and a read-scoped staff role writes nothing.",
    'See backlog HYG-027 for the per-route grid.',
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

   `[data-visual-mask]` is the semantic hook (LIVE-213, ADR-1277): a component that knows its
   own box is live data, or renders in one environment and not another, declares it on its
   root and this list needs no edit. Every site that does so is enumerated in
   VISUAL_MASK_SITES below, and test/e2e/visual-masks.test.ts holds the components to that
   registry in both directions. The structural selectors that follow predate the hook and
   stay until their markup is moved onto it; treat an edit to one of them as part of the
   change that moved the markup. */
export const GLOBAL_MASK_SELECTORS: readonly string[] = [
  // Anything the app declares as live or environment-bound. One selector; the sites are
  // VISUAL_MASK_SITES.
  '[data-visual-mask]',
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

/**
 * EVERY `data-visual-mask` SITE IN THE PRODUCT, by value, with the file that carries it and
 * why its box is painted over. `test/e2e/visual-masks.test.ts` reads this list against the
 * tree: a value listed here must appear in its file, and a `data-visual-mask` in
 * components/ or app/ that is not listed here fails — so the reason for every mask is
 * written down once, beside the selector that applies it, and cannot go stale in silence.
 *
 * A mask PAINTS A BOX AND CHANGES NO LAYOUT. It answers "this box holds different pixels on
 * two honest captures of the same commit"; it cannot answer "this box is a different SIZE on
 * two captures", which is `Surface.viewportOnly`'s job (see its note). Three kinds of box
 * earn one:
 *   ENV      the element mounts in one Vercel environment and not another. The support-chat
 *            widget is the one such element: SUPPORT_CHAT is set for Production alone, so a
 *            production capture carried it and a preview capture did not (LIVE-213).
 *   LIVE     the element is a database reading. The right rail's panels, the Vault head's
 *            three numbers, the chat trigger's unread badge.
 *   ROUTE    the element renders on some routes and not others for a reason the picture cannot
 *            show. The edge pill renders only where no dock slot exists.
 *
 * ⚠️ The Vercel preview toolbar is NOT here, because it is not ours to mark: Vercel injects it
 * into every preview response, and `playwright.config.ts` sends `x-vercel-skip-toolbar` so it
 * is never in the document at all (ADR-1277). It was the mid-right band LIVE-213 first read
 * as Vera's edge tab.
 */
export const VISUAL_MASK_SITES: readonly {
  readonly value: string
  readonly file: string
  readonly kind: 'env' | 'live' | 'route'
  readonly why: string
}[] = [
  {
    value: 'support-chat',
    file: 'components/chat/support-chat-widget.tsx',
    kind: 'env',
    why: 'Mounts only where SUPPORT_CHAT=1, which is Production and not Preview.',
  },
  {
    value: 'edge-pill',
    file: 'components/layout/edge-pill.tsx',
    kind: 'route',
    why: 'The fallback launcher where no dock slot exists; its label and badge are live.',
  },
  {
    value: 'dock-chat-tab',
    file: 'components/vera/vera-launcher.tsx',
    kind: 'live',
    why: 'The phone chat tab: unread count and waiting peek.',
  },
  {
    value: 'dock-chat-trigger',
    file: 'components/vera/vera-launcher.tsx',
    kind: 'live',
    why: 'The docked chat trigger: unread badge and waiting dot.',
  },
  {
    value: 'vault-head',
    file: 'components/sidebar/game-stats-dock.tsx',
    kind: 'live',
    why: 'Zaps, Gems and streak at rest in the desktop dock.',
  },
  // `rail-panel` is carried by several files: WidgetCard stamps it on every rail panel, and
  // the rail's own sections, the demo notice and the streaming skeleton carry it directly.
  {
    value: 'rail-panel',
    file: 'components/modules/module-card.tsx',
    kind: 'live',
    why: 'WidgetCard, the rail panel wrapper: every panel it wraps is a database reading.',
  },
  {
    value: 'rail-panel',
    file: 'components/sidebar/right-sidebar.tsx',
    kind: 'live',
    why: 'The activity chart and the Frequency Signature dial, both readings of the member logs.',
  },
  {
    value: 'rail-panel',
    file: 'components/sidebar/demo-notice.tsx',
    kind: 'live',
    why: 'Two live headcounts, and the panel comes and goes with the demo flag.',
  },
  {
    value: 'rail-panel',
    file: 'components/sidebar/rail-panels.tsx',
    kind: 'live',
    why: 'PanelSkeleton, so a capture that lands mid-stream paints the same box.',
  },
  {
    value: 'rail-panel',
    file: 'components/sidebar/community-panel.tsx',
    kind: 'live',
    why: 'The community board, which took the rail slot when the practice board went back to the top of /feed (ADR-1362): the next gathering in the member’s Circles with its date chip and location, and the newest posts in their Spaces with authors and relative times, are every one of them a reading.',
  },
  // ── /nearby, the Dispatches page (LIVE-301) ─────────────────────────────────────────────
  // Five boxes on ONE page, and the count is the finding rather than a smell: `/nearby` is the
  // community dashboard, so almost everything on it below the header band is a reading. See the
  // note on the `/nearby` row in appSurfaces() for why the page is masked rather than made
  // `viewportOnly`.
  {
    value: 'nearby-glance',
    file: 'app/(main)/nearby/page.tsx',
    kind: 'live',
    why: 'The at-a-glance line: upcoming events, circles, members and recent Dispatches, four DB tallies.',
  },
  {
    value: 'nearby-latest-dispatch',
    file: 'app/(main)/nearby/page.tsx',
    kind: 'live',
    why: 'The highlight card holds whichever Dispatch was published most recently.',
  },
  {
    value: 'nearby-dispatch-list',
    file: 'app/(main)/nearby/page.tsx',
    kind: 'live',
    why: 'The Dispatch stream itself, up to 20 rows with author and relative time.',
  },
  {
    value: 'nearby-coming-up',
    file: 'app/(main)/nearby/page.tsx',
    kind: 'live',
    why: 'The next four gatherings and their dates; masked with its header, whose count reads wider than the list.',
  },
  {
    value: 'nearby-new-circles',
    file: 'app/(main)/nearby/page.tsx',
    kind: 'live',
    why: 'The newest circles by created_at, with a live member count on each row.',
  },
  // ── /discover, the public hub (LIVE-301) ────────────────────────────────────────────────
  // Six boxes across three files, one per live read. `/discover` is prerendered hourly, so each
  // preview deployment bakes its own snapshot of the database and `pr-compare` compares two
  // different snapshots — see the `/discover` note on LIVE_DATA_PATHS above for the measurement,
  // for why this is masked rather than recaptured, and for the heights no mask can hold.
  {
    value: 'discover-hero-stats',
    file: 'app/discover/page.tsx',
    kind: 'live',
    why: 'The hero tally line: members, circles and upcoming events, three DB readings.',
  },
  {
    value: 'discover-upcoming-events',
    file: 'app/discover/page.tsx',
    kind: 'live',
    why: 'The four upcoming gatherings; the `starts_at >= now()` window slides continuously.',
  },
  {
    value: 'discover-featured-circles',
    file: 'app/discover/page.tsx',
    kind: 'live',
    why: 'The featured circles grid, ordered by member_count DESC: one join reorders the top six.',
  },
  {
    value: 'discover-community-posts',
    file: 'app/discover/page.tsx',
    kind: 'live',
    why: 'The newest three posts by created_at, each with an author and a relative timestamp.',
  },
  {
    value: 'discover-channel-circle-count',
    file: 'components/discover/cards.tsx',
    kind: 'live',
    why: 'The per-Channel circle tally on ChannelCard, counted off the public_circles read; the card around it is not masked.',
  },
  {
    value: 'discover-locator-cities',
    file: 'components/discover/discover-locator.tsx',
    kind: 'live',
    why: 'The locator city list: a per-city circle tally, re-ranked by the viewer’s IP-approximate location.',
  },
  // ── /feed, the home stream (LIVE-308) ───────────────────────────────────────────────────
  // Two boxes, chosen from the committed first-screen PNGs rather than from the row's premise:
  // the heading is the clock that actually moved, and the stream is what moves once the first
  // screen reaches it. See the `/feed` row in appSurfaces() for what stays in the picture and
  // for the heights no mask can hold.
  {
    value: 'feed-greeting',
    file: 'app/(main)/feed/page.tsx',
    kind: 'live',
    why: 'The heading row: the eyebrow is today’s date and the title the time-of-day greeting, both read in America/Los_Angeles at render. The row rather than the h1, because the title block is content-sized and its width follows the words (PageHeading.visualMask).',
  },
  {
    value: 'feed-stream',
    file: 'components/feed/feed-list.tsx',
    kind: 'live',
    why: 'The post stream on both lenses: the latest Dispatch, the nearest event, posts with authors, avatars, reaction counts and relative times, and the people strip. The empty and error panes are not masked.',
  },
  {
    value: 'feed-stream',
    file: 'app/(main)/feed/page.tsx',
    kind: 'live',
    why: 'FeedListSkeleton, so a capture that lands mid-stream paints the same box the list would.',
  },
  {
    value: 'feed-community-board',
    file: 'components/feed/community-board.tsx',
    kind: 'live',
    why: 'The board’s body, wherever it is hosted — the right rail since ADR-1362. Every pixel is a reading: the next gathering in the member’s Circles with its date chip and location, and the newest posts in their Spaces with authors and relative times. The rail’s own PanelSkeleton covers a capture that lands mid-stream, so the board no longer ships one of its own. The EMPTY state is deliberately unmasked, the same rule the feed stream’s empty pane follows.',
  },
  // ── /admin/qr, the scans chart (LIVE-458, ADR-1522, 2026-09-22) ─────────────────────────────────────────────
  // Found the same way the rail column was, and it is the reason to keep looking at the pairs
  // rather than only at what is currently red: two baseline captures of the SAME commit, at
  // 22:25Z and 00:28Z, changed eight PNGs. Six were the rail. These two were this chart, and it
  // was NOT failing pr-compare — it would have started at the next UTC midnight, on somebody
  // else's pull request.
  //
  // ⚠️ WHAT THIS DOES NOT COVER, so the next failure here is read correctly: the four StatCards
  // above the chart are live tallies too (total scans, unique members, NFC taps, the 30-day
  // count) and they are deliberately NOT masked — they did not move in the measurement, and this
  // file's rule is to mask what was measured rather than everything that could move. A digit
  // changing in those cards is the next candidate and it lands here with its own reading.
  //
  // ✅ CLOSED, and it is the reason to write the next prediction down too: the paragraph that
  // used to end this note said that if the window went from zero scans to some, the section
  // would swap a one-line empty state for a 112px chart, that this is a HEIGHT, and that no
  // mask holds a height. It then happened — `[mobile] visual · operator console › /admin/qr`
  // went red on two unrelated PRs with byte-identical numbers. The fix is NOT another mask:
  // `analytics.tsx` now renders the empty state in the SAME `mt-4 h-28` box as the chart, so
  // the section is dimension-invariant and the branch is no longer visible to the camera.
  // The measured swap was 55.25px and the observed flip is 46px, so this closes a real
  // dimension flip on the surface WITHOUT being proven to be the whole of that flip; the
  // `settleHeight` report below is what will name the next one instead of guessing at it.
  {
    value: 'qr-daily-scans',
    file: 'app/(main)/admin/qr/analytics.tsx',
    kind: 'live',
    why: 'The daily scans bar chart. The 30-day window slides, so every bar steps one column left at the UTC day boundary with no code between two pictures — 3533 differing pixels across one midnight. The box is `h-28` and fixed, so the mask holds it.',
  },
  // ── /admin/content/practices, the per-row usage tallies (2026-09-22) ────────────────────────
  // The same defect as qr-daily-scans one surface further on, and this one was already FAILING
  // rather than merely going to: `pr-compare` went red on PR #2855 — a types-only change that
  // touches no file on this surface's render path — across all four looks, 4179 to 4405 pixels,
  // ratio 0.01. Fourteen hours separated the #2852 recapture from that run.
  //
  // WHAT MOVES: `p.logs_30d` is a ROLLING 30-DAY COUNT of member practice logs, rendered twice
  // per row — once in the lg:hidden compact line and once in the lg:flex tally cell, which also
  // carries `logs_total` and `adopters`. Real member activity moves digits in a dense table, so
  // the diff is small per row and spread over many, which is exactly a ratio-0.01 reading.
  //
  // WHY A MASK HOLDS IT: both rendered sites are `tabular-nums`, so the box does not resize as
  // digits change — the property ADR-1522 requires and the reason the QR mask worked.
  //
  // DELIBERATELY NARROW: on mobile only the count itself is wrapped, so the weight label and the
  // creator stay in the picture. Masking the whole line would blind the suite to two stable
  // values to hide one moving one, which is how a mask list becomes a blindfold.
  {
    value: 'practice-usage-tallies',
    file: 'app/(main)/admin/content/practices/practices-table.tsx',
    kind: 'live',
    why: 'Per-row practice usage: `logs_30d` is a rolling 30-day count of member logs, with `logs_total` and `adopters` beside it in the desktop cell. Real logging moves digits across a dense table between any two captures — 4179-4405 pixels on PR #2855, on a diff that touches nothing this surface renders. Both sites are `tabular-nums`, so the box is fixed and the mask holds it.',
  },
  // ── /settings and the Space console, the account-data bands (HYG-121, 2026-09-22) ─────────
  // OWN-081 added ONE space_members row for the e2e account and twelve captures went red: two
  // routes, two themes, three viewports. /settings reads that table for its mute list, and
  // /spaces/<slug>/manage renders at all only for a manager (OWN-081 is what made it render), so
  // its Dashboard tab is stat tiles, journey stats, the latest activity with relativeTime(), and
  // Coming up. Every band is a database reading; the next member, Plan or post moves them again.
  //
  // THE OWNER RULED: mask the volatile parts, keep /settings full-page. Its design surface
  // genuinely extends below the fold, unlike /feed, so `viewportOnly` is NOT the remedy here.
  //
  // ⚠️ WHAT A MASK CANNOT HOLD, so the next red is read correctly: a NEW mute row or membership
  // row on /settings, or a row-count change in the console's two lists, is a page HEIGHT. On
  // /settings full-page capture reports a dimension mismatch before it counts a pixel. Membership
  // changes are rare; that one is an accepted recapture. The stat grids are `tabular-nums`
  // StatCards, so digits change without the box resizing and those masks hold.
  //
  // NOT masked, deliberately: the settings section chip nav, the Edit profile card, the
  // appearance section (it IS the render-state axis), PageHeading on the console, HubSearch,
  // HubNav, and every EmptyState beside a masked list (the feed-stream rule).
  {
    value: 'settings-subject-mutes',
    file: 'app/(main)/settings/notifications/mutes-form.tsx',
    kind: 'live',
    why: 'The mute list: one row per Space or Circle the member belongs to, read from space_members (mute-subjects.ts). This is the box OWN-081 moved. The list wrapper only, not the card: header, intro and empty state are design. Names change inside a fixed row; a row added or removed is a height and an accepted recapture.',
  },
  {
    value: 'settings-my-memberships',
    file: 'app/(main)/settings/memberships/section.tsx',
    kind: 'live',
    why: 'The member’s own Space memberships: one EntityCard per row with a live tier name and billing cadence label. The <ul> only; the EmptyState is not masked. A membership added or removed is a height the mask cannot hold, and is accepted.',
  },
  {
    value: 'settings-tips-received',
    file: 'app/(main)/settings/billing/tips-received-section.tsx',
    kind: 'live',
    why: 'The Tips received card: a total, a count and the most recent tips with tipper names, amounts and dates. Every line in it is a reading, so the card is the site. It mounts only once a tip has landed, so its first appearance is a height and an accepted recapture.',
  },
  {
    value: 'settings-live-location-stamp',
    file: 'components/settings/live-location-toggle.tsx',
    kind: 'live',
    why: 'The "Live · last updated" stamp: a plain-text toLocaleString() clock with no <time> element, which the global `time, [datetime]` selector misses. The span only; the min-h status line around it carries three other messages that are fixed copy. It renders in a fixed-height line, so the box holds.',
  },
  {
    value: 'space-console-stats',
    file: 'components/spaces/dashboard/space-dashboard.tsx',
    kind: 'live',
    why: 'The console’s top row: revenue over 30 days, member count, mean health and at-risk count, four DB readings in StatCards. The values are `tabular-nums` and the grid is a fixed 2x2 / 1x4, so the box holds as digits change.',
  },
  {
    value: 'space-console-profile-stats',
    file: 'components/spaces/dashboard/space-dashboard.tsx',
    kind: 'live',
    why: 'Profile views and button clicks over a rolling 30-day window, two telemetry tallies. The grid only, not the section, so the SectionHeader above it stays photographed. `tabular-nums` StatCards; the box holds.',
  },
  {
    value: 'space-console-journey-stats',
    file: 'components/spaces/dashboard/space-dashboard.tsx',
    kind: 'live',
    why: 'Enrolled, finished, still going and finish rate across the Space’s Journeys, four completion tallies. The grid only, not the section, so the SectionHeader stays photographed. `tabular-nums` StatCards; the box holds.',
  },
  {
    value: 'space-console-activity',
    file: 'components/spaces/dashboard/space-dashboard.tsx',
    kind: 'live',
    why: 'Latest activity: up to eight rows of the contact touch stream, each with a summary and relativeTime(). The <ul> only; the EmptyState beside it is not masked. A row-count change is a height the mask cannot hold, and is accepted.',
  },
  {
    value: 'space-console-upcoming',
    file: 'components/spaces/dashboard/space-dashboard.tsx',
    kind: 'live',
    why: 'Coming up: the next five events with their dates, from a `upcomingOnly` window that slides continuously. The <ul> only; the EmptyState beside it is not masked. A row-count change is a height the mask cannot hold, and is accepted.',
  },
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
export async function settle(page: Page): Promise<SettleReport> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  // `.then(() => undefined)`: FontFaceSet is not serialisable across the protocol.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  return await settleHeight(page)
}

/** What `settle()` SAW while it waited. Returned rather than swallowed — see `settleHeight`. */
export interface SettleReport {
  /** `scrollHeight` held one value for the quiet window before the budget ran out. */
  settled: boolean
  /** The height LEFT a value and later came back to it. This is the flip-flop signature, and
   *  it is a different fact from `settled`: an oscillation whose plateaus outlast the quiet
   *  window reports `settled: true` and is still not photographable. */
  oscillated: boolean
  /** Distinct `scrollHeight` values in first-seen order, capped at `HEIGHT_SAMPLE_CAP`. */
  heights: number[]
  /** How many distinct values there were, including any past the cap. */
  distinct: number
  /** The height the page was left at. */
  final: number
  /** How long the height wait actually ran. */
  waitedMs: number
  /** Every box that changed size between the two plateaus, ancestors included, straight from
   *  the page. Empty unless the height oscillated AND both plateaus were sampled before the
   *  budget ran out. `smallestEnclosing()` is what makes this readable. */
  moved: MovedBox[]
  /** The answer: the boxes that MADE the change rather than carried it, deepest first, capped.
   *  This is the diagnosis, and the reason the message is worth failing a run on. */
  movers: { path: string; desc: string; from: number; to: number }[]
}

/** One box that changed height between the two plateaus. `from: 0` means it was absent from
 *  that plateau entirely, which is the branch-swap shape rather than a box that collapsed. */
export interface MovedBox {
  /** Position in the tree, e.g. `body>div[1]>section[2]>p[0]`. Stable across a re-render of
   *  the subtree, which element identity is not. */
  path: string
  /** tag + #id + up to two classes + the first few words of text. */
  desc: string
  from: number
  to: number
  delta: number
}

/**
 * The boxes that MADE the height change, out of the raw list that includes every ancestor.
 *
 * Why this is not just "the deepest one". An ancestor of a box that grew always grows by the
 * same amount, so the raw diff reports the whole chain — the shell, main, the column, the
 * section — and buries the one line worth reading. A box is therefore dropped when the movers
 * INSIDE it already account for its whole delta: it is carrying the change, not making it.
 *
 * Summing needs care. The movers inside a box form a chain, so adding all of them counts the
 * same change once per level; only the TOP layer within the box is summed. That one rule covers
 * both real shapes: a child that grew (sum = its delta), and a branch swap where one node left
 * and a taller one arrived in its place (sum = the taller minus the shorter).
 *
 * Pure and exported because it is the one genuinely subtle step in the diagnosis, and a rule
 * nobody can test is a rule that quietly stops working.
 */
export function smallestEnclosing(moved: readonly MovedBox[], cap = MOVER_CAP) {
  const inside = (box: MovedBox, other: MovedBox) => other.path.startsWith(`${box.path}>`)
  return moved
    .filter((box) => {
      const within = moved.filter((other) => inside(box, other))
      const top = within.filter((other) => !within.some((mid) => inside(mid, other)))
      if (top.length === 0) return true
      const explained = top.reduce((sum, other) => sum + other.delta, 0)
      return Math.abs(explained - box.delta) >= 0.5
    })
    .sort((x, y) => y.path.split('>').length - x.path.split('>').length)
    .slice(0, cap)
    .map(({ path, desc, from, to }) => ({ path, desc, from, to }))
}

/** Enough numbers to read a flip-flop, few enough that a page animating its own height
 *  cannot return a thousand of them into a failure message. */
const HEIGHT_SAMPLE_CAP = 12

/** Ceilings on the element diff below. It only runs on a page that has ALREADY flipped, and
 *  everything it produces crosses the CDP wire, so each one is a cap on a payload rather than a
 *  tuning knob: at most this many nodes walked per plateau, this many boxes named, this much
 *  text per box. Three boxes is what fits in a failure message somebody will actually read. */
const NODE_WALK_CAP = 6000
const RAW_MOVED_CAP = 200
const MOVER_CAP = 3
const MOVER_TEXT_CAP = 40

/**
 * Wait for `scrollHeight` to hold a single value, and REPORT WHAT IT SAW. Observation only —
 * this must not touch the page, scroll it, or otherwise change what the camera is about to
 * see (see the 🔴 note in `settle`).
 *
 * The whole wait runs INSIDE one `page.evaluate` on purpose: polling height over the CDP wire
 * would put a round trip between each reading, so a page growing steadily could report the
 * same number twice by luck of timing and be declared stable — a flake that would surface
 * only under load. In-page, the readings are ~100ms apart and mean what they say.
 *
 * 🔴 IT USED TO RETURN `void`, AND BOTH HALVES OF THAT WERE WRONG (2026-09-23).
 *
 *  1. It was written for MONOTONIC GROWTH and could only see that. It kept ONE previous
 *     height and reset a clock whenever the value changed, so "stopped" and "ALTERNATING"
 *     were the same observation to it: a page flipping 14521 ↔ 14567 with plateaus longer
 *     than `quietFor` was declared settled, on whichever plateau it happened to be sitting.
 *     That is why this now tracks the distinct values and whether the height came BACK to one
 *     it had already left. Growth never revisits a height; an oscillation always does.
 *  2. The old contract said it should resolve rather than throw on timeout, because "a surface
 *     that genuinely never settles should fail as a SCREENSHOT diff, naming the surface and
 *     showing the pixels, not as an opaque helper timeout". That reasoning is refuted by the
 *     thing it predicted. `/admin/qr` at 390 did exactly this, and the screenshot did NOT name
 *     it: `toHaveScreenshot` retried, caught the flip back on every attempt, and failed with
 *     `Failed to take two consecutive stable screenshots` — an opaque timeout several frames
 *     away from what moved, with two PRs' worth of people re-deriving the same 46,975 pixels.
 *     A budget that expires with no throw, no annotation and no counter is a fail-safe nothing
 *     notices firing, which AGENTS.md forbids in as many words.
 *
 * So the wait still never throws HERE — the throw belongs at the shutter, where the surface,
 * the render state and the project are all in hand — but it now hands back the evidence, and
 * `unsettledMessage()` turns it into the sentence the next person needs. Keep it that way: the
 * reason this helper does not assert is the same reason it does not scroll.
 */
async function settleHeight(page: Page): Promise<SettleReport> {
  const result = await page.evaluate(
    async ({ timeout, quietFor, cap, nodeCap, rawCap, textCap }) => {
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
      const height = () => document.documentElement.scrollHeight

      /* ── The element pass ── ARMED ONLY AFTER A FLIP, AND OBSERVATION ONLY ───────────────
       * Everything below READS: `getBoundingClientRect`, `getComputedStyle`, `children`,
       * `textContent`. Nothing assigns to `.style`, touches `classList`, sets an attribute,
       * scrolls, focuses or clicks. That is not a preference, it is the same rule the 🔴 note
       * in `settle()` records at the cost of 46 passing tests: this helper must not change what
       * the camera is about to see. A read of computed style is safe; a write is not. */

      /** One element's height and its description. Keyed, in the maps below, by a POSITION
       *  PATH (`body>div[1]>p[0]`) rather than by the element itself: React can replace the
       *  node when a branch swaps, and identity would then match nothing. The path is built
       *  DURING the walk rather than by climbing from each element, which would be
       *  O(nodes × depth) on a 14,000px page. */
      type Box = { h: number; d: string }

      /** tag + #id + up to two classes + the first few words, so the failure names something a
       *  person can find in the source. `className` is an SVGAnimatedString on SVG, hence the
       *  typeof guard. */
      const describe = (el: Element): string => {
        const tag = el.tagName.toLowerCase()
        const id = el.id ? `#${el.id}` : ''
        const raw = typeof el.className === 'string' ? el.className : ''
        const cls = raw
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((c) => `.${c}`)
          .join('')
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, textCap)
        return `${tag}${id}${cls}${text ? ` "${text}"` : ''}`
      }

      /** Every in-flow box on the page with its own height, keyed by tree position. Out-of-flow
       *  elements (`fixed` / `absolute`) are RECORDED nowhere because they cannot move the
       *  document's height, but the walk still DESCENDS through them: an in-flow subtree under an
       *  absolutely positioned wrapper is still in flow relative to that wrapper. */
      const snapshot = (): Map<string, Box> => {
        const out = new Map<string, Box>()
        if (!document.body) return out
        const stack: { el: Element; path: string }[] = [{ el: document.body, path: 'body' }]
        let visited = 0
        while (stack.length > 0 && visited < nodeCap) {
          const node = stack.pop()
          if (!node) break
          const kids = node.el.children
          for (let i = 0; i < kids.length; i += 1) {
            const kid = kids[i]
            if (!kid) continue
            visited += 1
            if (visited >= nodeCap) break
            const path = `${node.path}>${kid.tagName.toLowerCase()}[${i}]`
            const h = kid.getBoundingClientRect().height
            const position = getComputedStyle(kid).position
            if (h > 0 && position !== 'fixed' && position !== 'absolute') {
              out.set(path, { h: Math.round(h * 100) / 100, d: describe(kid) })
            }
            stack.push({ el: kid, path })
          }
        }
        return out
      }

      /** Every box whose OWN height differs between the two plateaus. Deliberately DUMB: it
       *  reports the ancestors too, because deciding which of them is merely carrying the
       *  change is a fiddly rule that belongs where it can be unit-tested, and this list is
       *  small (a depth of ancestors plus a few leaves) so it costs little on the wire. See
       *  `smallestEnclosing`, which is what turns this into the sentence. */
      const rawMoved = (a: Map<string, Box>, b: Map<string, Box>) => {
        const moved: { path: string; desc: string; from: number; to: number; delta: number }[] = []
        for (const path of new Set([...a.keys(), ...b.keys()])) {
          if (moved.length >= rawCap) break
          const from = a.get(path)?.h ?? 0
          const to = b.get(path)?.h ?? 0
          if (Math.abs(to - from) < 0.5) continue
          moved.push({ path, desc: (b.get(path) ?? a.get(path))!.d, from, to, delta: to - from })
        }
        return moved
      }

      const startedAt = Date.now()
      // Every distinct height, first-seen order. `seen` is what gets printed; `distinct`
      // counts past the cap so a truncated list can say so honestly.
      const seen: number[] = []
      let distinct = 0
      let oscillated = false
      const note = (value: number) => {
        if (seen.includes(value)) {
          // Already seen and we are arriving at it AGAIN: the height went away and came back.
          oscillated = true
          return
        }
        distinct += 1
        if (seen.length < cap) seen.push(value)
      }

      // One snapshot per plateau, taken ONLY once `oscillated` is set. A surface that settles
      // normally never walks the tree at all and pays exactly the height polling it paid before.
      const plateaus = new Map<number, Map<string, Box>>()
      let moved: { path: string; desc: string; from: number; to: number; delta: number }[] = []
      let diffed = false

      // `quietFor` of no change is what counts as settled; a page that is still growing
      // resets the clock every time it does.
      let last = height()
      note(last)
      let lastChangedAt = Date.now()
      let settled = false
      while (Date.now() - startedAt < timeout) {
        await sleep(100)
        const current = height()
        if (current !== last) {
          last = current
          note(current)
          lastChangedAt = Date.now()
        } else if (Date.now() - lastChangedAt >= quietFor) {
          settled = true
          // 🔴 DO NOT LEAVE YET IF THE DIAGNOSIS IS HALF-TAKEN. An oscillation can come to
          // rest on one of its two plateaus, and breaking here would return "14521 and 14567"
          // with no element named — exactly the message that costs the next person a PNG and a
          // calculator. Hold the remaining budget open for the other plateau instead.
          if (!oscillated || diffed) break
        }
        if (oscillated && !diffed) {
          if (!plateaus.has(current)) plateaus.set(current, snapshot())
          if (plateaus.size >= 2) {
            const [first, second] = [...plateaus.values()]
            moved = rawMoved(first!, second!)
            diffed = true
            if (settled) break
          }
        }
      }
      return {
        settled,
        oscillated,
        heights: seen,
        distinct,
        final: last,
        waitedMs: Date.now() - startedAt,
        moved,
      }
    },
    {
      timeout: 15_000,
      quietFor: 600,
      cap: HEIGHT_SAMPLE_CAP,
      nodeCap: NODE_WALK_CAP,
      rawCap: RAW_MOVED_CAP,
      textCap: MOVER_TEXT_CAP,
    },
  )
  // The ranking runs HERE, not in the page: it is the one genuinely subtle step, and out here
  // it is an exported pure function with its own tests instead of a closure no test can reach.
  return { ...result, movers: smallestEnclosing(result.moved) }
}

/** `15000` → `15s`, `3400` → `3.4s`. Readable in a failure message, exact enough to act on. */
function seconds(ms: number): string {
  return `${Number((ms / 1000).toFixed(1))}s`
}

/** `[a, b]` → `a and b`; `[a, b, c]` → `a, b and c`. */
function andList(values: readonly (string | number)[]): string {
  if (values.length <= 1) return String(values[0] ?? '')
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}

/**
 * The gate that notices `settleHeight`'s budget fired (AGENTS.md: "every fail-safe needs a
 * gate that notices it fired"). Returns the sentence to fail with, or null when the page's
 * height really did come to rest on one value.
 *
 * Pure, so it is unit-tested with no browser — same idiom as `operatorLandedElsewhere`.
 *
 * TWO failures, one message, because they are the same defect seen at two speeds: a height
 * still moving when the budget ran out, and a height that came to rest only because the
 * camera looked during one half of a flip. Both mean the page renders at more than one size
 * for the same commit, and a full-page baseline of such a page measures WHEN it was taken.
 */
export function unsettledMessage(report: SettleReport, label: string): string | null {
  if (report.settled && !report.oscillated) return null
  const hidden = report.distinct - report.heights.length
  const parts = report.heights.map(String)
  if (hidden > 0) parts.push(`${hidden} more`)
  const heights = andList(parts)
  const size = (px: number) => (px === 0 ? 'absent' : `${px}px`)
  const movers = report.movers.map((m) => `${m.desc} ${size(m.from)} then ${size(m.to)}`)
  return [
    `${label} never settled: ${heights} over ${seconds(report.waitedMs)}.`,
    report.oscillated
      ? 'The height came BACK to a value it had already left, so this is an oscillation and not slow growth: something on this surface renders at two different sizes between two renders of the same commit. A mask cannot hold a height, and neither can a longer wait.'
      : 'The height was still moving when the wait ran out of budget.',
    // THE POINT OF THE WHOLE GATE. Without this clause the message hands the next person the two
    // numbers they already had and none of what is 46px, and the surface stays blocked while
    // somebody does arithmetic over a committed PNG for the third time.
    movers.length > 0
      ? `The box that changed: ${andList(movers)}.`
      : 'No box could be named: the page came to rest on one plateau before the second could be sampled, so re-run to catch the flip with both halves in hand.',
    'No photograph was taken: a full-page baseline of a page that is still moving records the moment, not the surface. Make both branches of that box the same size rather than masking it.',
  ].join(' ')
}

/* ── THE FLIP THE WAIT CANNOT SEE: a height that only moves WHILE THE SHUTTER IS OPEN ─────
 *
 * MEASURED on PR #2878 (2026-09-23), and it is the reason the section below exists.
 * `settleHeight` watched `/admin/qr` at 390×844, saw one height, and returned honestly — no
 * oscillation, no timeout, nothing to report. `toHaveScreenshot` then took over and its own call
 * log showed the flip arriving with the camera:
 *
 *     - taking page screenshot
 *     - Expected an image 390px by 14521px, received 390px by 14567px.
 *     - waiting 100ms before taking screenshot
 *     - taking page screenshot
 *     - Expected an image 390px by 14567px, received 390px by 14521px.
 *
 * So the oscillation is INDUCED BY THE CAPTURE, not by the page. `fullPage: true` in Chromium
 * photographs past the viewport, which re-resolves anything sized against the viewport HEIGHT
 * for the duration of the shot and reverts it afterwards: `vh` / `dvh` / `svh` / `lvh` lengths,
 * `@media (min-height)` blocks, `env()` safe-area values, anything reading `innerHeight`. A
 * helper that measures at 844 can NEVER see that, however long it waits, because at 844 the
 * page is genuinely still.
 *
 * 🔴 AND THERE IS NO OBSERVATION-ONLY WAY TO MEASURE IT IN ADVANCE. Reproducing the
 * condition means making the viewport as tall as the document, and every route to that mutates
 * the page: `page.setViewportSize()` resizes it for real and does not revert, and taking a
 * throwaway `fullPage` screenshot is the camera firing early — which on this codebase is the
 * lazy-content hazard the 🔴 note in `settle()` records, since a viewport that suddenly
 * contains the whole document puts every IntersectionObserver target "in view" at once. Neither
 * is worth 14,000px of coverage, so this does NOT predict the flip.
 *
 * It catches it where it is already visible instead. `toHaveScreenshot`'s own failure carries
 * both heights; `capture()` catches that error, `capturedHeights()` recognises the signature,
 * and `viewportDependentBoxes()` then asks the page which of its boxes are tied to the viewport
 * height — a pure CSSOM read, no mutation — so the rethrown message names the surface, both
 * heights AND the candidate boxes. The opaque timeout becomes the diagnosis, without anyone
 * having had to predict it.
 */

/** A box on the page whose height is tied to the VIEWPORT height, which is the one thing a
 *  `fullPage` capture changes. */
export interface ViewportBox {
  /** Position path, same scheme as `MovedBox.path`. */
  path: string
  /** tag + #id + up to two classes. */
  desc: string
  /** The declaration that ties it to the viewport, e.g. `min-height: calc(100vh - 3.5rem)`. */
  rule: string
  /** What that box measures RIGHT NOW, at the normal viewport. */
  height: number
}

/** Height-ish properties only. `width: 100vh` cannot move a page's height, and listing every
 *  declaration that merely mentions a viewport unit would bury the one that matters. */
export const VIEWPORT_HEIGHT_PROPERTIES = [
  'height',
  'min-height',
  'max-height',
  'padding-top',
  'padding-bottom',
  'margin-top',
  'margin-bottom',
  'top',
  'bottom',
  'inset',
  'flex-basis',
  'gap',
  'row-gap',
  'grid-template-rows',
] as const

/** Ceilings on the CSSOM scan. It runs only on a failed capture, and its output goes into a
 *  message a person reads, so both are caps on a payload rather than tuning knobs. */
const VIEWPORT_RULE_CAP = 4000
const VIEWPORT_BOX_CAP = 6

/**
 * Every box on the page whose height is declared against the viewport height, with what it
 * measures right now. OBSERVATION ONLY: it reads `document.styleSheets`, runs
 * `querySelectorAll`, and calls `getBoundingClientRect`. It changes nothing, and in particular
 * it does NOT resize the viewport to see what would happen — see the 🔴 note above.
 *
 * A cross-origin stylesheet throws on `.cssRules` and a Tailwind arbitrary-value selector can
 * be invalid to `querySelectorAll`, so both are caught per rule rather than per sheet: one bad
 * entry must not blank the whole diagnosis.
 */
export async function viewportDependentBoxes(page: Page): Promise<ViewportBox[]> {
  return await page.evaluate(
    ({ properties, ruleCap, boxCap }) => {
      const viewportUnit = /\d(vh|dvh|svh|lvh)\b/
      type Found = { path: string; desc: string; rule: string; height: number }
      // TWO buckets, and the order is the message's quality. A declaration written IN viewport
      // units is the direct answer; a rule that merely sits inside a height media query is a
      // weaker candidate, and there can be a great many of them. Sharing one capped list would
      // let the weak kind crowd out the strong kind purely by stylesheet order.
      const direct: Found[] = []
      const viaMedia: Found[] = []
      const seen = new Set<string>()

      /** Climb to body. Only ever called for the handful of matching elements, so the cost
       *  that made the settle walk build paths downward does not apply here. */
      const pathOf = (el: Element): string => {
        const parts: string[] = []
        let node: Element | null = el
        while (node && node !== document.body && parts.length < 16) {
          const parent: Element | null = node.parentElement
          const i = parent ? [...parent.children].indexOf(node) : 0
          parts.unshift(`${node.tagName.toLowerCase()}[${i}]`)
          node = parent
        }
        return ['body', ...parts].join('>')
      }

      const describe = (el: Element): string => {
        const raw = typeof el.className === 'string' ? el.className : ''
        const cls = raw
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((c) => `.${c}`)
          .join('')
        return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}`
      }

      const record = (selector: string, declaration: string, bucket: Found[]) => {
        let matches: Element[]
        try {
          matches = [...document.querySelectorAll(selector)]
        } catch {
          return // A selector querySelectorAll cannot parse. Not our business.
        }
        for (const el of matches) {
          if (bucket.length >= boxCap) return
          const path = pathOf(el)
          const key = `${path}|${declaration}`
          if (seen.has(key)) continue
          seen.add(key)
          bucket.push({
            path,
            desc: describe(el),
            rule: declaration,
            height: Math.round(el.getBoundingClientRect().height * 100) / 100,
          })
        }
      }

      let scanned = 0
      const walkRules = (rules: CSSRuleList, heightMedia: string) => {
        for (const rule of [...rules]) {
          if (scanned >= ruleCap || direct.length >= boxCap) return
          scanned += 1
          // \U0001f534 A STYLE RULE IS ALSO A GROUPING RULE, and assuming otherwise made this
          // whole diagnosis return an empty list. CSS nesting gave `CSSStyleRule` a `cssRules`
          // of its own, so an `if (rule.cssRules) { recurse; continue }` branch swallows EVERY
          // plain rule on the page: the list is empty, truthy, and `continue` then skips the
          // declarations. Caught by running the real callback body against a jsdom tree; it
          // would have failed silently on the preview and printed "no box found" forever.
          // So: read the declarations off anything that HAS them, and recurse separately.
          const styleRule = rule as CSSStyleRule
          if (styleRule.style && styleRule.selectorText) {
            for (const property of properties) {
              const value = styleRule.style.getPropertyValue(property)
              if (!value) continue
              if (viewportUnit.test(value)) {
                record(styleRule.selectorText, `${property}: ${value}`, direct)
              } else if (heightMedia) {
                record(
                  styleRule.selectorText,
                  `${property}: ${value} inside @media (${heightMedia})`,
                  viaMedia,
                )
              }
            }
          }
          const grouping = rule as CSSGroupingRule
          if (grouping.cssRules && grouping.cssRules.length > 0) {
            // A `@media (min-height: ...)` block re-resolves with the viewport exactly the way a
            // `vh` length does, so it is carried down and every rule inside it qualifies.
            const condition = (rule as CSSMediaRule).conditionText ?? ''
            const isHeightMedia = /\b(min-|max-)?height\s*:/.test(condition)
            walkRules(grouping.cssRules, isHeightMedia ? condition : heightMedia)
          }
        }
      }

      for (const sheet of [...document.styleSheets]) {
        try {
          if (sheet.cssRules) walkRules(sheet.cssRules, '')
        } catch {
          // Cross-origin sheet. Nothing readable, nothing to say.
        }
      }
      return [...direct, ...viaMedia].slice(0, boxCap)
    },
    {
      properties: VIEWPORT_HEIGHT_PROPERTIES as unknown as string[],
      ruleCap: VIEWPORT_RULE_CAP,
      boxCap: VIEWPORT_BOX_CAP,
    },
  )
}

/**
 * The distinct image HEIGHTS Playwright named in a screenshot failure, in first-seen order.
 *
 * Its call log prints `Expected an image 390px by 14521px, received 390px by 14567px.` once per
 * attempt, so two or more distinct heights here IS the capture-flip signature and one height is
 * an ordinary pixel diff that this must not speak for. Pure, so it is unit-tested against the
 * real recorded log rather than against a guess at the wording.
 */
export function capturedHeights(text: string): number[] {
  const heights: number[] = []
  for (const match of text.matchAll(/(\d+)px by (\d+)px/g)) {
    const height = Number(match[2])
    if (Number.isFinite(height) && !heights.includes(height)) heights.push(height)
  }
  return heights
}

/**
 * The sentence for a height that only moved while the shutter was open. Pure.
 *
 * It says WHY the wait was silent, because the first question anybody will ask of this message
 * is why `settle()` did not catch it, and the answer is the finding: at the normal viewport the
 * page really is still.
 */
export function captureFlipMessage(
  label: string,
  heights: readonly number[],
  boxes: readonly ViewportBox[],
): string {
  const spread = Math.max(...heights) - Math.min(...heights)
  const named = boxes.map((b) => `${b.desc} { ${b.rule} } currently ${b.height}px at ${b.path}`)
  return [
    `${label} changed height DURING capture: ${andList([...heights])}, a ${spread}px difference.`,
    'The height wait saw a still page and was right to: this flip is INDUCED BY THE CAMERA. A `fullPage` capture photographs past the viewport, so anything sized against the viewport HEIGHT re-resolves at the document height while the shutter is open and reverts once it closes.',
    named.length > 0
      ? `Boxes on this surface whose height is tied to the viewport, which is what changes: ${andList(named)}.`
      : 'No viewport-height-dependent box was found in the stylesheets, so look instead for script that reads `innerHeight`, an `env()` safe-area value, or an IntersectionObserver that fires when the whole document is suddenly in view.',
    'Fix the box, not the wait: no mask, no timeout and no retry can hold a height that is a function of the viewport. Playwright\'s own failure follows.',
  ].join(' ')
}

/**
 * Turn a screenshot failure that carries the two-height signature into the diagnosis, and leave
 * every other screenshot failure exactly as it was.
 *
 * Returns the error to throw. It never swallows: the original is kept as `cause` and its text is
 * appended, so an ordinary pixel diff reads the way it always did.
 */
export async function explainCaptureFailure(
  page: Page,
  error: unknown,
  label: string,
): Promise<unknown> {
  const text = error instanceof Error ? `${error.message}` : String(error)
  const heights = capturedHeights(text)
  if (heights.length < 2) return error
  // The diagnosis is best-effort by design: if the page has gone (closed, crashed, navigated)
  // we must still rethrow the real failure rather than replace it with our own stack.
  const boxes = await viewportDependentBoxes(page).catch(() => [] as ViewportBox[])
  return new Error(`${captureFlipMessage(label, heights, boxes)}\n\n${text}`, { cause: error })
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

/* ── Router prefetches ────────────────────────────────────────────────────── */

/**
 * THE CAPTURE REFUSES ROUTER PREFETCHES (LIVE-328, out of ADR-1328).
 *
 * Every `<Link>` that scrolls into view on a production build asks the server for the RSC
 * payload of the route it points at, with `Next-Router-Prefetch: 1` on the request. On a member
 * page that is every link in the rail, the dock and the tab bar, and each one is a full server
 * render of a signed-in route: its own `/auth/v1/user` and the fifteen to twenty PostgREST reads
 * the app shell makes. The 2026-09-14 edge logs put the house profile's reads at 1,200 to 2,900
 * per table per fifteen minutes during the e2e runs, and the 5xx that followed were ours. A
 * capture never navigates by clicking a link (`page.goto` issues a document request, and the
 * overflow gate opens buttons only), so nothing here reads the cache those prefetches would fill.
 *
 * HOW A PREFETCH IS TOLD FROM A NAVIGATION, read from next/dist/client/components:
 *   · `app-router-headers.js` names the headers: `rsc` on every RSC fetch, `next-router-prefetch`
 *     ('1', or '2' / '3' for the segment cache's tiers) on a prefetch, and
 *     `next-router-segment-prefetch` beside it when the segment cache asks for one segment.
 *   · `router-reducer/fetch-server-response.js` `createFetch()` appends `_rsc=<hash>` to EVERY RSC
 *     fetch, prefetch and navigation alike (`setCacheBustingSearchParam`). So `_rsc` marks an RSC
 *     request, not a prefetch: it is the cheap URL selector that keeps the interception off every
 *     image and script, and the HEADER is the decision. Refusing on `_rsc` alone would refuse the
 *     soft navigation a `router.push` issues, which is the one thing the row says to let through.
 *
 * WHY FULFIL A 204 RATHER THAN ABORT. `route.abort()` makes Chromium print
 * `Failed to load resource: net::ERR_FAILED` to the console, and the classic prefetch path logs
 * `Failed to fetch RSC payload ... Falling back to browser navigation` on a rejected fetch.
 * `smoke.spec.ts` counts console errors on `/`, so an abort would fail the smoke run on noise the
 * fixture itself made. An empty 2xx with no content type is silent on both of Next's paths: the
 * segment cache's `fetchPrefetchResponse` returns null on a non-flight content type, and the
 * classic path returns its MPA fallback on `!res.body`. Either way the prefetch is a miss, a later
 * link click would issue a real navigation request, and the server never rendered anything.
 */
const ROUTER_PREFETCH_HEADERS: readonly string[] = ['next-router-prefetch', 'next-router-segment-prefetch']

/** The query Next puts on every RSC fetch (`NEXT_RSC_UNION_QUERY`). A selector, never a verdict. */
const RSC_QUERY = '_rsc'

/** The slice of Playwright's `Route` the handler reads, so a vitest can fake one without a browser. */
export interface RouterPrefetchRoute {
  request(): { url(): string; headers(): Record<string, string> }
  fulfill(response: { status: number; headers?: Record<string, string> }): Promise<void>
  fallback(): Promise<void>
}

/** Is this URL an RSC fetch at all? Only these are worth pausing to read the headers of. */
export function isRscRequestUrl(url: URL): boolean {
  return url.searchParams.has(RSC_QUERY)
}

/** Is this request a router PREFETCH, as opposed to the fetch a navigation issues? Header names
 *  are compared case-insensitively; Playwright lower-cases them, a fake might not. */
export function isRouterPrefetch(request: { headers(): Record<string, string> }): boolean {
  const headers = request.headers()
  return Object.keys(headers).some((name) => ROUTER_PREFETCH_HEADERS.includes(name.toLowerCase()))
}

/**
 * The route handler: a prefetch gets an empty 204 and never leaves the browser; anything else
 * falls through to the next handler, or to the network. Exported so the vitest beside this file
 * can prove both branches on a fake route.
 */
export async function routerPrefetchRoute(route: RouterPrefetchRoute): Promise<void> {
  if (isRouterPrefetch(route.request())) {
    await route.fulfill({ status: 204 })
    return
  }
  await route.fallback()
}

/** Install the refusal on a context. Every page the context opens inherits it. */
export async function refuseRouterPrefetch(context: BrowserContext): Promise<void> {
  await context.route(isRscRequestUrl, routerPrefetchRoute)
}

/* ── THE CAPTURE REFUSES A DEGRADED DEPLOYMENT (LIVE-333, ADR-1351) ──────────────────────────── */

/**
 * A CAPTURE TAKEN INSIDE A 5xx WINDOW COMMITS THE WINDOW AS TRUTH.
 *
 * The incident, 2026-09-14. The recapture dispatched at 23:28Z (run 34909054841, against
 * production) photographed 89 PNGs while the REST edge answered 503 to 11,042 requests between
 * 23:33Z and 23:42Z — the ADR-1328 exhaustion shape, reproduced by this repo's own capture
 * fan-out. The run PASSED. The runner committed the PNGs, the PR merged as #2594, and the next
 * three `pr-compare` runs failed 62 public comparisons at 1 to 2 percent on every page and every
 * mode, because the baselines they were measured against depicted a shell whose data reads had
 * failed. Nothing failed at the point that mattered: the capture never looked at the responses the
 * page received, and the commit step never asked whether the capture had been clean. ADR-1328
 * wrote down that the fan-out causes the windows; nothing wrote down that a capture inside one
 * writes the window into the repository, where it becomes the definition of correct.
 *
 * So: every response with status >= 500 that the page under test — or any of its RSC fetches,
 * images, fonts, scripts or stylesheets — receives is RECORDED, and a surface that saw one is
 * REFUSED with the URL and the status in the message instead of being photographed.
 *
 * ── WHERE THE IGNORABLE LINE IS DRAWN, AND WHY ───────────────────────────────────────────────
 *
 * DEFAULT-DENY. Any 5xx fails the capture unless its URL matches `TELEMETRY_5XX_IGNORED` below,
 * which is a CLOSED, enumerated list of beacons that render nothing. The argument for that
 * direction, rather than an allowlist of "requests that matter":
 *
 *   1. These surfaces are not open-internet pages. Everything the browser fetches on them is
 *      either the app's own origin or one of three named third parties (`app/layout.tsx`:
 *      Google Analytics and Vercel Web Analytics; `instrumentation-client.ts`: Sentry, and only
 *      when a DSN is configured). The list of exceptions is short and it is knowable.
 *   2. The failure modes are asymmetric. Default-ALLOW means every NEW data path — a new route
 *      handler, a new RSC segment, a new `/_next/image` transform — is silently exempt until
 *      somebody remembers to add it, which is this row's own defect wearing a fresh coat.
 *      Default-DENY means one loud failure that PRINTS THE URL, and a one-line addition here
 *      carrying its reason. ADR-970 warns that a gate which cannot fire honestly gets routed
 *      around; that warning cuts toward default-deny when the noise is nameable and bounded,
 *      which it is, because the message hands you the exact string to add.
 *   3. Everything not on the list can change what the camera sees, including the things that
 *      look harmless. A 500 from `/_next/image` freezes an empty box into a baseline and then
 *      INVERTS the gate for that region — green while the image stays broken, red the day it
 *      renders. That is not hypothetical; see the 🔴 note in `settle()` about
 *      `spaces--dawn-dark-mobile.png`, one contiguous 421px band at identical dimensions.
 *
 * ── 🔴 WHAT THIS CANNOT SEE, SAID OUT LOUD ───────────────────────────────────────────────────
 *
 * This is a BROWSER-SIDE recorder, and the 5xx of 2026-09-14 were not browser-side: every one
 * carried user agent `node` and no referer (ADR-1328), i.e. they were PostgREST answering the
 * Next server, on a hop the browser never observes. This guard therefore catches the half of a
 * degraded window that reaches the browser — a document or RSC fetch that 5xxes, a broken image
 * transform — and it CANNOT catch a server read that failed and was softened into an empty list
 * on the way out, because ADR-1339 makes softening the deliberate behaviour for a list reader and
 * a softened read renders a 200. A page that renders its empty state over a failed read is
 * pixel-different and HTTP-clean, and no `page.on('response')` in the world will say so.
 *
 * Do NOT close that half by failing on `incomplete`-shaped guesses, and do not read a green run
 * here as "the deployment was healthy". It means the browser saw no server error. The other half
 * is closed by not capturing inside a window at all, which is what the ADR-1331/ADR-1346
 * turnstile and the `needs:` chain are for, and by the run-level marker below, which is what
 * stops a partial capture being committed.
 */

/**
 * The only 5xx that do not fail a capture: beacons whose response cannot change a pixel. Each
 * entry names the file that puts it on the page and the reason it renders nothing.
 *
 * ⚠️ IT IS NOT A SUBSTRING LIST, and that is not fussiness. `entry.match` is compared against a
 * PARSED URL: a `host` entry matches that host exactly or a true subdomain of it, and a `path`
 * entry matches the pathname's prefix. A plain `url.includes('googletagmanager.com')` also ignores
 * `https://googletagmanager.com.evil.test/x` and `https://cdn.example/?r=googletagmanager.com`,
 * which is the incomplete-sanitisation pattern `assertNotProtectionWall` above already carries a
 * note about — and this one would be worse, because the consequence is a SILENCED gate rather than
 * a noisy one. The test beside this file drives that exact look-alike.
 *
 * ⚠️ Add to this ONLY for something that renders nothing. A masked element is NOT a reason — a
 * mask paints over a box, and the box is still laid out by whatever did or did not load into it
 * (see `settle()`). For a one-run reprieve use `PW_CAPTURE_ALLOW_5XX` instead of editing this.
 */
export const TELEMETRY_5XX_IGNORED: readonly {
  readonly kind: 'host' | 'path'
  readonly match: string
  readonly why: string
}[] = [
  // app/layout.tsx → <Analytics /> from @vercel/analytics/next. SAME ORIGIN, so it is a path:
  // no host list could express it, which is why this list has two kinds at all.
  {
    kind: 'path',
    match: '/_vercel/insights/',
    why: 'Vercel Web Analytics beacon (app/layout.tsx) — fire-and-forget, renders nothing.',
  },
  {
    kind: 'path',
    match: '/_vercel/speed-insights/',
    why: 'Vercel Speed Insights beacon — same shape, same origin, renders nothing.',
  },
  // app/layout.tsx → <GoogleAnalytics /> (components/analytics/google-analytics.tsx).
  {
    kind: 'host',
    match: 'googletagmanager.com',
    why: 'The gtag loader (components/analytics/google-analytics.tsx) — a failed load leaves the page identical.',
  },
  {
    kind: 'host',
    match: 'google-analytics.com',
    why: 'The GA collect beacon, regional hosts included (subdomains match) — a measurement of the page, never part of it.',
  },
  // instrumentation-client.ts, and only on a deploy that configures NEXT_PUBLIC_SENTRY_DSN.
  {
    kind: 'host',
    match: 'ingest.sentry.io',
    why: 'Sentry error transport (instrumentation-client.ts) — monitoring must not take down what it monitors, and it paints nothing.',
  },
  {
    kind: 'host',
    match: 'ingest.us.sentry.io',
    why: 'The regional Sentry ingest host, same reason.',
  },
]

/**
 * Escape hatch, mirroring `PW_VISUAL_EXTRA_MASK` (see `envMaskSelectors`): quiet one URL for one
 * run without waiting for a code change. `PW_CAPTURE_ALLOW_5XX="/embed/,partner.example"`.
 *
 * A plain substring here, unlike the list above, and deliberately: an operator typed this value
 * for this run and it leaves no diff behind, so it cannot become a permanent hole the way a
 * loose entry in the committed list would.
 */
function envAllowed5xx(): readonly string[] {
  return (process.env.PW_CAPTURE_ALLOW_5XX ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Exact host, or a true subdomain of it. `evil.googletagmanager.com.test` is neither. */
function hostMatches(host: string, match: string): boolean {
  return host === match || host.endsWith(`.${match}`)
}

/** Is this URL on the telemetry list (or this run's env reprieve)? */
export function isIgnorable5xx(url: string): boolean {
  if (envAllowed5xx().some((match) => url.includes(match))) return true
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    // An unparseable URL is not a beacon we recognise, so it is NOT ignorable. Default-deny holds
    // even when the input is malformed: the failure mode of guessing wrong here is a silent gate.
    return false
  }
  return TELEMETRY_5XX_IGNORED.some((entry) =>
    entry.kind === 'host'
      ? hostMatches(parsed.host, entry.match)
      : parsed.pathname.startsWith(entry.match),
  )
}

/** One recorded server error. */
export interface ServerError {
  readonly url: string
  readonly status: number
  /** Playwright's own classification (`document`, `fetch`, `image`, `script`, …). Reported so a
   *  reader can tell a failed RSC payload from a failed image without opening the URL. */
  readonly resourceType: string
}

/** The slice of Playwright's `Response` this reads, so a vitest can script one without a browser. */
export interface ObservedResponse {
  url(): string
  status(): number
  request(): { resourceType(): string }
}

/**
 * The VERDICT on one response, pure and browser-free: a `ServerError` when this response would
 * make the capture a photograph of a degraded deployment, `null` otherwise.
 */
export function serverErrorFrom(response: ObservedResponse): ServerError | null {
  const status = response.status()
  if (status < 500) return null
  const url = response.url()
  if (isIgnorable5xx(url)) return null
  let resourceType = 'unknown'
  try {
    resourceType = response.request().resourceType()
  } catch {
    // A fake, or a request Playwright has already disposed. The status and the URL are the
    // load-bearing half of the message; never lose a refusal over the label on it.
  }
  return { url, status, resourceType }
}

/** What one capture saw. One per test, because one Playwright test captures one surface. */
export interface ServerErrorLog {
  readonly seen: ServerError[]
}

export function createServerErrorLog(): ServerErrorLog {
  return { seen: [] }
}

/**
 * Install the recorder on a context. Every page the context opens is covered, and so is every
 * frame and every subresource — which is the point: `page.on('response')` on the main frame alone
 * would miss the RSC fetches the row names.
 *
 * Synchronous, unlike `refuseRouterPrefetch`: `context.on` is not a protocol call.
 */
export function watchServerErrors(context: BrowserContext, log: ServerErrorLog): void {
  context.on('response', (response) => {
    try {
      const error = serverErrorFrom(response)
      if (error) log.seen.push(error)
    } catch {
      // A recorder that throws inside an event handler takes down the run it was meant to
      // report on. Losing one reading is survivable; losing the suite is not.
    }
  })
}

/** At most this many distinct URL+status pairs are printed. A window produces thousands. */
const MAX_SERVER_ERRORS_PRINTED = 10

/** Where a refusal is recorded for the RUN, so the commit step in e2e-manual.yml can read it. */
export const DEGRADED_CAPTURE_LOG = 'test/e2e/.degraded-capture.jsonl'

/**
 * The refusal message, or `null` when the capture was clean. Split from the throw so a vitest can
 * read the message without catching, and so the same text serves the visual and a11y suites.
 */
export function serverErrorRefusal(log: ServerErrorLog, label: string): string | null {
  if (log.seen.length === 0) return null
  const byKey = new Map<string, ServerError>()
  for (const error of log.seen) byKey.set(`${error.status} ${error.url}`, error)
  const distinct = [...byKey.values()]
  const printed = distinct.slice(0, MAX_SERVER_ERRORS_PRINTED)
  return [
    `REFUSING TO CAPTURE ${label}: the deployment answered ${log.seen.length} request(s) with a server error during this capture.`,
    '',
    ...printed.map((error) => `  · ${error.status}  ${error.url}  (${error.resourceType})`),
    ...(distinct.length > printed.length
      ? [`  … and ${distinct.length - printed.length} further distinct URL+status pair(s).`]
      : []),
    '',
    'A capture taken inside a 5xx window photographs a degraded shell, and a COMMITTED baseline',
    'then becomes the definition every later comparison is measured against. On 2026-09-14 that',
    'cost 62 public comparisons failing at 1 to 2 percent across three runs (run 34909054841,',
    '11,042 x 503 on /rest/v1/*, merged as #2594). Re-dispatch the capture against a healthy',
    'deployment rather than re-running until it goes green.',
    '',
    'If one of the URLs above is telemetry that cannot change a pixel, add it to',
    'TELEMETRY_5XX_IGNORED in test/e2e/surfaces.ts with the reason it renders nothing, or take a',
    'one-run reprieve with PW_CAPTURE_ALLOW_5XX="<substring>".',
  ].join('\n')
}

/** Record a refusal for the whole RUN. Append, not write: workers run in parallel. */
function appendDegradedCapture(label: string, seen: readonly ServerError[]): void {
  appendFileSync(
    join(process.cwd(), ...DEGRADED_CAPTURE_LOG.split('/')),
    JSON.stringify({ label, seen }) + '\n',
  )
}

/**
 * THE REFUSAL. Called by the visual suite immediately before the shutter and by the a11y suite
 * immediately before axe runs — after `settle()`, so it sees everything the page fetched, and
 * before anything is written, so a degraded surface leaves no PNG and no observation behind.
 *
 * It also lands a line in `DEGRADED_CAPTURE_LOG`, which is half (2) of the row: the
 * `update-baselines` commit step reads that file and refuses to commit, because its `if: always()`
 * means a non-zero capture does NOT stop it on its own (that `always()` is deliberate and right —
 * ADR-1273, a single flaky surface must not discard the other captures — so the marker is what
 * tells a run-wide degradation apart from one flake).
 *
 * `sink` is injectable so the vitest beside this file can drive the real refusal without writing
 * into the repository.
 */
export function assertNoServerErrors(
  log: ServerErrorLog,
  label: string,
  sink: (label: string, seen: readonly ServerError[]) => void = appendDegradedCapture,
): void {
  const refusal = serverErrorRefusal(log, label)
  if (refusal === null) return
  let sinkFailure = ''
  try {
    sink(label, log.seen)
  } catch (cause) {
    // Every fail-safe needs a gate that notices it fired (AGENTS.md), and that includes this
    // one's own marker: if the file could not be written, the commit step will see a clean run,
    // so say so in the message that IS going to be read.
    sinkFailure =
      `\n\n⚠️ ALSO: the run-level marker at ${DEGRADED_CAPTURE_LOG} could not be written ` +
      `(${String(cause)}), so the commit step in e2e-manual.yml cannot see this refusal. ` +
      `Do not commit the baselines this run produced.`
  }
  throw new Error(refusal + sinkFailure)
}

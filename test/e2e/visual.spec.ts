// Visual snapshots of the real surface area (UX maturity plan, Lift 6).
//
// The matrix is: SURFACE × RENDER STATE × VIEWPORT PROJECT.
//   surfaces      — `coverageSurfaces()` in test/e2e/surfaces.ts: THE VISUAL SUITE'S OWN LIST,
//                   chosen for coverage (ADR-1128). Three inputs — the parsed EDITABLE_PAGES
//                   routes (so Lift 5c conversions still join automatically), the public
//                   extras, and an explicit operator/admin set measured by
//                   `node scripts/visual-surface-census.mjs` — plus the member shell trio +
//                   Space console when PW_STORAGE_STATE is set.
//
//                   🔴 It used to be EDITABLE_PAGES plus /discover, full stop. That list
//                   answers "which pages may the page editor edit?", so the camera pointed
//                   wherever an unrelated product decision happened to point it, and it held
//                   ZERO /admin routes. A DAWN sweep moved 37 sites, ONE of them was watched,
//                   and the run said "140 passed" (HYG-026).
//   render states — DAWN light/dark × Midnight light/dark (test/e2e/surfaces.ts).
//                   The member shell captures the two MODE states only; see
//                   SHELL_RENDER_STATES for why the skin axis is not ours there.
//   projects      — `desktop` (1280×800), `mobile` (390×844) and `narrow` (320×568), from
//                   playwright.config.ts.
//
//                   ⚠️ `narrow` IS NOT A THIRD COLUMN OF THE MATRIX. It is the only project
//                   `visual.spec.ts` runs at all (its per-project `testMatch`), and within this
//                   file it photographs a DELIBERATE SUBSET: the member shell and the header
//                   band, the two places where a picture at 320 answers a question the other two
//                   widths cannot. Running the 16 public surfaces there as well would be 64 more
//                   captures of body copy reflowing — the axis `overflow.spec.ts` already
//                   measures at 320 for free, without a baseline. See ADR-1270, and the skips
//                   below, which name the reason at each describe rather than here.
//
//                   The subset is a RUNTIME skip on the project name, which is how
//                   `overflow.spec.ts` already pins itself to one project — so the rows are
//                   collected and then reported as skipped WITH the reason attached, rather
//                   than vanishing. That is the trade: a file-level split would hide them, and
//                   this repo's standing complaint is about silences, not about skip counts.
//
// Tagged @visual so they only run when explicitly asked for:
//   pnpm test:e2e:visual        (playwright test --grep @visual)
// The plain smoke run (pnpm test:e2e) grep-inverts the tag, so these never fire by
// accident — they are the one suite with a committed-baseline dependency.
//
// Baselines are captured ON A RUNNER, never in an agent sandbox (which cannot reach a
// deploy URL): .github/workflows/e2e.yml → workflow_dispatch → update_baselines.
import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import {
  captureEnvironmentMismatch,
  classifyCaptureEnvironment,
  isCaptureRun,
  readCaptureStamp,
  writeCaptureStamp,
} from './capture-env'
import {
  ADVISORY_OPERATOR_PATHS,
  NARROW_PROJECT,
  PUBLIC_RENDER_STATES,
  SHELL_RENDER_STATES,
  STORAGE_STATE,
  appSurfaces,
  applyRenderState,
  assertMemberSession,
  assertNoServerErrors,
  assertNotProtectionWall,
  currentPathname,
  headerBandSurfaces,
  masksFor,
  operatorDenialReason,
  operatorLandedElsewhere,
  operatorSurfaces,
  publicSurfaces,
  explainCaptureFailure,
  settle,
  unsettledMessage,
  type RenderState,
  type ServerErrorLog,
  type Surface,
} from './surfaces'

const baseURL = process.env.PW_BASE_URL

/** Set once the environment gate below has agreed, per worker process. It is NOT set when the
 *  gate throws, so every test in the run names the cause rather than only the first one. */
let baselineEnvironmentAgreed = false

/**
 * 🔴 IS THIS FOLDER'S BASELINE VALID AGAINST THE DEPLOYMENT WE ARE POINTED AT? (LIVE-213.)
 *
 * The committed set carries the environment it was photographed on (test/e2e/capture-env.ts, and
 * the reasoning is written there). Preview and production do not render the same chrome, so a
 * capture taken on one and compared against the other is red by thousands of pixels on every
 * page, 128 of 144 surfaces on 2026-09-08, with nothing in the failure naming the cause.
 *
 * This runs BEFORE the navigation, not at the shutter, so a mismatched run photographs nothing at
 * all: on a `--update-snapshots` dispatch that is what stops half a folder being photographed on
 * production and half on a preview, which is the shape a `capture_shell`-off recapture has.
 */
function assertBaselineEnvironment(): void {
  if (baselineEnvironmentAgreed) return
  const capturing = isCaptureRun(test.info().config.updateSnapshots)
  const mismatch = captureEnvironmentMismatch(readCaptureStamp(), baseURL, { capturing })
  if (mismatch) throw new Error(mismatch)
  if (capturing) {
    const environment = classifyCaptureEnvironment(baseURL)
    // An unrecognised base URL leaves no stamp rather than a wrong one. A stamp that says
    // `unknown` would read as a claim, and the only honest claim here is silence.
    if (environment !== 'unknown') writeCaptureStamp({ environment, baseUrl: baseURL ?? '' })
  }
  baselineEnvironmentAgreed = true
}

/** One capture. `state.id` is in the filename so all four looks are separately reviewable:
 *  test/e2e/__screenshots__/visual.spec.ts/<slug>--<state>-<project>.png */
async function capture(
  page: Page,
  surface: Surface,
  state: RenderState,
  serverErrors: ServerErrorLog,
): Promise<void> {
  assertBaselineEnvironment()
  await applyRenderState(page, state)
  await page.goto(surface.path, { waitUntil: 'load' })
  await assertNotProtectionWall(page)
  // An OPERATOR surface bounced to /feed is requireAdminFloor()'s denial: the e2e account is a
  // member and not staff. That is an owner-held account fact, not this PR's fault, so it skips
  // WITH THE CAUSE NAMED and is counted by shell-reporter.ts. See operatorDenialReason().
  const denied = operatorDenialReason(page, surface)
  if (denied) test.skip(true, denied)
  // A member surface on the sign-in page is a dead credential, not a missing one; a member
  // surface on ANY other page is a mis-pointed surface. Throw rather than photograph the
  // wrong page under the shell's name — see the app-room case in assertMemberSession.
  await assertMemberSession(page, surface)

  const landed = currentPathname(page)
  if (surface.audience === 'anon' && landed.startsWith('/sign-in') && surface.path !== '/sign-in') {
    // A route left EDITABLE_PAGES' anonymous surface (or never had one — /circles is
    // editor-backed but member-gated). Capturing the sign-in page under that route's name
    // would be a lie; say so and move on.
    test.skip(
      true,
      `${surface.path} redirected to ${landed} for an anonymous visitor — no public capture to take.`,
    )
  }

  // What `settle()` SAW is checked at the shutter, below, and not here: an operator surface that
  // bounced to /feed, or a surface whose data reads 5xx'd, is a better explanation of a moving
  // height than the surface itself is, and both of those are diagnosed in the next few lines.
  const settleReport = await settle(page)
  // 🔴 THE LAST THING BEFORE THE SHUTTER: is this still the page we came for? The check above ran
  // before `settle()`, and a requireAdmin() bounce lands inside that window — which is how eight
  // photographs of /feed were committed under operator route names on 2026-09-10. See
  // operatorLandedElsewhere: a missing baseline is a gap, a misattributed one gates everybody.
  const drifted = operatorLandedElsewhere(page, surface)
  if (drifted) test.skip(true, drifted)
  // 🔴 AND: was the deployment HEALTHY while we were looking at it? (LIVE-333, ADR-1351.) The
  // checks above ask whether this is the right page; this one asks whether the page's data reads
  // worked. A capture taken inside the 2026-09-14 503 window was committed as the baseline and
  // 62 public comparisons then failed against it at 1 to 2 percent. Last thing before the
  // shutter, so it covers everything `settle()` waited for, and BEFORE it, so a degraded surface
  // leaves no PNG behind — there is nothing to review in a photograph of an outage.
  const label = `${surface.path} [${state.id} · ${test.info().project.name}]`
  assertNoServerErrors(serverErrors, label)
  // 🔴 AND FINALLY: did the page actually STOP MOVING? `settle()` waits on `scrollHeight`
  // behind a 15s budget, and that budget used to expire in silence — no throw, no annotation, no
  // counter. The page then reached the camera unsettled and `toHaveScreenshot` failed with
  // `Failed to take two consecutive stable screenshots`, which names neither the surface's height
  // nor the fact that a wait had given up; two PRs went into re-deriving `/admin/qr`'s
  // 14521 ↔ 14567 flip by hand out of the committed PNG. This is the gate that notices that
  // fail-safe firing (AGENTS.md: every fail-safe needs a gate that notices it fired), and it is
  // the LAST thing before the shutter so it covers everything the waits above waited for.
  //
  // It THROWS rather than skipping. A surface that renders at two heights for one commit is a
  // defect on the surface, not an absent capability like a denied operator route, and a skip
  // would let the flake keep its silence while quietly dropping a baseline from the run.
  //
  // ── 🔴 THE ONE EXCEPTION, AND IT IS NOT A LOOPHOLE ────────────────────────────────
  //
  // THE GATE IS NOT OPTIONAL. Do not reach for `viewportOnly` to quiet a surface this gate has
  // caught; `Surface.viewportOnly`'s own note already says it in the general case ("Do NOT set
  // this to paper over a flaky surface with real layout drift; the fix there is the drift"),
  // and doing it here would trade ~14,000px of coverage for a silence. The exception below is
  // about what the CAMERA CAN SEE, and nothing else.
  //
  // A `viewportOnly` capture photographs the first screen only. A height moving 8,000px below
  // the fold therefore cannot reach the picture at all, so there is no baseline for it to
  // spoil and nothing for the gate to protect. Throwing would only be noise.
  //
  // And it would be LOUD noise on day one. `/feed` carries `viewportOnly` PRECISELY BECAUSE a
  // full-page shot of it never settles: it is an infinite stream, and surfaces.ts records the
  // measurement ("the height instability that made the run look flaky was /feed being an
  // infinite stream, which is why `/feed` itself is `viewportOnly` — a full-page shot of it
  // never settles", in the operatorLandedElsewhere note). An unconditional throw here would
  // fail /feed in all four looks on the first run, for a picture that was never affected. That
  // is the shape of the 46-passing-tests mistake the 🔴 scroll-pass note in `settle()` exists
  // to stop anyone repeating: a real fix for one problem, shipped with a guess about another.
  //
  // The fail-safe is still NOTICED on those surfaces. It lands as a `unsettled-height`
  // annotation carrying the full message, visible in the HTML report and in the JSON, so a
  // viewport-only surface that starts oscillating leaves a record instead of a silence.
  const unsettled = unsettledMessage(settleReport, label)
  if (unsettled) {
    if (surface.viewportOnly) {
      test.info().annotations.push({ type: 'unsettled-height', description: unsettled })
    } else {
      throw new Error(unsettled)
    }
  }
  // `viewportOnly` surfaces photograph the first screen. See the note on Surface.viewportOnly:
  // a full-page baseline of a live, shared stream measures WHEN it was taken, not how it looks.
  //
  // 🔴 AND IF IT FAILS, SAY WHAT MOVED. The gate above measures the page at the normal
  // viewport, and on PR #2878 that was not enough: /admin/qr was genuinely still at 390\u00d7844
  // and started flipping 14521 \u2194 14567 only once `toHaveScreenshot` began capturing past the
  // viewport. `settle()` reported nothing because there was nothing to report. Playwright then
  // failed with a bare timeout, and the two heights were visible ONLY inside its call log.
  //
  // So the failure is caught and re-thrown with the diagnosis attached: both heights, and the
  // boxes on this surface whose height is a function of the viewport height (a CSSOM read \u2014
  // nothing is resized, nothing is mutated). Anything that is NOT that signature is re-thrown
  // untouched, so an ordinary pixel diff still reads exactly as it did.
  try {
    await expect(page).toHaveScreenshot(`${surface.slug}--${state.id}.png`, {
      fullPage: !surface.viewportOnly,
      mask: masksFor(page, surface),
    })
  } catch (error) {
    throw await explainCaptureFailure(page, error, label)
  }
}

test.describe('visual', { tag: '@visual' }, () => {
  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the visual suite.',
  )
  // The 16 public surfaces are captured at 1280 and 390. At 320 the extra answer is body copy
  // reflowing, and `overflow.spec.ts` already drives all 16 at 320 as a MEASUREMENT — no
  // baseline, no capture run, and a failure that names the selector. Sixty-four more PNGs would
  // buy the same axis at the price of a recapture on every marketing edit. The chrome half —
  // the part a picture is needed for — is the header band, captured below.
  test.skip(
    () => test.info().project.name === NARROW_PROJECT,
    'The narrow project photographs the shell and the header band; the public surfaces are measured at 320 by overflow.spec.ts instead (ADR-1270).',
  )

  for (const state of PUBLIC_RENDER_STATES) {
    test.describe(state.id, () => {
      // LIVE-373: /discover is photographed in the advisory describe below. Its height is a
      // function of production Circles, events and posts, so a new listed Circle used to fail
      // every open PR's blocking visual job.
      for (const surface of publicSurfaces().filter((s) => s.path !== '/discover')) {
        test(`${surface.path} matches baseline`, async ({ page, serverErrors }) => {
          await capture(page, surface, state, serverErrors)
        })
      }
    })
  }
})

// /discover is public and anonymous, AND it photographs live production data. The blocking
// public tier cannot tell "someone moved the hero" from "a Circle was listed since Tuesday"
// (LIVE-373: one new public Circle grew the page ~180 px and failed every branch). The
// member shell earned its block back (LIVE-313); /discover did not, because its HEIGHT is
// the listed set. A gate that cannot fire truthfully stays advisory.
// Tagged @advisory, not @shell: @shell is what shell-reporter.ts counts as the authed app, and
// a running /discover capture would make that reporter call the member shell covered.
// a11y and overflow still walk publicSurfaces() including /discover; those are geometry and
// roles, not pixels.
test.describe('visual · discover', { tag: ['@visual', '@advisory'] }, () => {
  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the visual suite.',
  )
  test.skip(
    () => test.info().project.name === NARROW_PROJECT,
    'The narrow project photographs the shell and the header band; the public surfaces are measured at 320 by overflow.spec.ts instead (ADR-1270).',
  )

  for (const state of PUBLIC_RENDER_STATES) {
    test.describe(state.id, () => {
      for (const surface of publicSurfaces().filter((s) => s.path === '/discover')) {
        test(`${surface.path} matches baseline`, async ({ page, serverErrors }) => {
          await capture(page, surface, state, serverErrors)
        })
      }
    })
  }
})

// The member shell. Sign-in is magic-link only, so there is nothing to script: the suite
// consumes a pre-baked storage state and skips loudly without it.
// @shell is what test/e2e/shell-reporter.ts counts: it is the difference between "12
// skipped" and a job summary that names /feed, the room, /settings and the Space console as
// unphotographed. Adding a member-shell describe without the tag re-opens that silence.
test.describe('visual · member shell', { tag: ['@visual', '@shell'] }, () => {
  test.use({ storageState: STORAGE_STATE })

  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the visual suite.',
  )
  test.skip(
    !STORAGE_STATE,
    'PW_STORAGE_STATE is not set (or the file is missing). Point it at a saved storage state for the beta member account to capture the app shell.',
  )

  // NO NARROW SKIP HERE — this describe is why the third project exists. The rail, the dock and
  // the seven-slot bottom tab bar are the chrome ADR-1035's in-app defects lived in, and they
  // are laid out by division rather than by content: every slot is `min-w-0 flex-1`, so the
  // width is 45.7px at 320 against 55.7px at 390 and the labels give way in a different ORDER.
  // That is a shell fact a marketing page cannot report.
  for (const state of SHELL_RENDER_STATES) {
    test.describe(state.id, () => {
      for (const surface of appSurfaces()) {
        test(`${surface.path} matches baseline`, async ({ page, serverErrors }) => {
          await capture(page, surface, state, serverErrors)
        })
      }
    })
  }
})

// The operator console (HYG-026, ADR-1128). SAME session as the member shell — `test.use` takes
// the same `STORAGE_STATE`, so nothing here is a second auth path; `capture_shell` in
// e2e-manual.yml (and the `Mint the member session` step in e2e.yml) is what supplies it.
//
// @shell is deliberate and load-bearing: it is what makes `shell-reporter.ts` count these tests
// and NAME each unphotographed operator route in the job summary. An operator describe without
// the tag would skip in silence, which is the disease this change treats, not the cure.
//
// SHELL_RENDER_STATES, not RENDER_STATES: /admin renders inside the authed shell, which stamps
// `[data-skin]` server-side on a DESCENDANT of <html>, so the skin axis is not ours here and the
// two midnight variants would only duplicate these baselines.
test.describe('visual · operator console', { tag: ['@visual', '@shell'] }, () => {
  test.use({ storageState: STORAGE_STATE })

  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the visual suite.',
  )
  test.skip(
    !STORAGE_STATE,
    'PW_STORAGE_STATE is not set (or the file is missing). The operator surfaces ride the SAME member session as the app shell — point it at a saved storage state for an account that is platform staff.',
  )
  // The operator console is a DESK, and the routes chosen for it were chosen by counting raw
  // buttons in dense admin tables (`visual-surface-census.mjs`). Nobody moderates from a 320px
  // phone, and these 28 baselines are not captured today anyway — the e2e account does not clear
  // the /admin role floor (HYG-027), so a narrow column here would add 14 more surfaces that
  // skip. Widen this the day the operator baselines exist AND someone names a narrow operator
  // task, not before.
  test.skip(
    () => test.info().project.name === NARROW_PROJECT,
    'The operator console is not a narrow-phone surface; see the note above and ADR-1270.',
  )

  for (const state of SHELL_RENDER_STATES) {
    test.describe(state.id, () => {
      // LIVE-476: `/admin/qr` is photographed in the advisory describe below, for the reason
      // /discover left the blocking public loop. It is dropped HERE, at the site, with the
      // reason named, rather than removed from `operatorSurfaces()`. The roster stays whole so
      // a11y, overflow and the coverage ledger keep seeing the surface.
      for (const surface of operatorSurfaces().filter(
        (s) => !ADVISORY_OPERATOR_PATHS.includes(s.path),
      )) {
        test(`${surface.path} matches baseline`, async ({ page, serverErrors }) => {
          await capture(page, surface, state, serverErrors)
        })
      }
    })
  }
})

// THE ADVISORY OPERATOR SURFACES: photographed every run, and no longer voting (LIVE-476).
//
// `/admin/qr` blocked four consecutive pull requests, none of which touched anything this page
// renders. The first cause was the full-page height flip; the first-screen-only capture settled
// that, and the surface came back red anyway with a SMALL STABLE desktop diff: 951 px dawn-light,
// 1029 px dawn-dark, identical across three attempts, mobile green throughout. That is not drift
// and it is not a live tally: `qr_scans` has had no new row since 2026-09-18, so the four
// StatCards in the picture are frozen. WHAT IT IS, NOBODY KNOWS: the diff image lives on an
// artifact host this environment's egress policy blocks, so it has never been read.
//
// So the gate is firing on pull requests that did not cause it, and this repo already has the
// rule for that, written above the /discover describe: A GATE THAT CANNOT FIRE TRUTHFULLY STAYS
// ADVISORY. This is not a fix and it is not a skip. The capture still runs on every pull request
// in `pnpm test:e2e:visual:advisory`, the diff still uploads, and e2e.yml's "Report the advisory
// tier" step names this surface in the job summary where a reviewer already looks.
//
// Tagged @advisory, NOT @shell, for the reason /discover is not: @shell is what
// shell-reporter.ts counts as the authed app, and a running advisory capture would let that
// reporter call the operator console covered. The ledger learns about this surface a different
// way, ADVISORY_OPERATOR_SURFACES in surfaces.ts, so the banner says "photographed in the
// ADVISORY tier (LIVE-476)" instead of the false "unphotographed".
//
// SAME storage state and SAME skips as the blocking operator describe above: this is the same
// session and the same surface, on a different step's exit code.
//
// AND NOTHING IS RECAPTURED BY THIS MOVE, which was checked rather than assumed.
// `snapshotPathTemplate` in playwright.config.ts is `{testDir}/__screenshots__/{testFileName}/
// {arg}-{projectName}{ext}`, and the describe title is not in it, so the four committed
// `admin-qr--*` PNGs are the same four files this describe compares against. A recapture here
// would hide the very diff this row exists to explain.
test.describe('visual · operator console · advisory', { tag: ['@visual', '@advisory'] }, () => {
  test.use({ storageState: STORAGE_STATE })

  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the visual suite.',
  )
  test.skip(
    !STORAGE_STATE,
    'PW_STORAGE_STATE is not set (or the file is missing). The operator surfaces ride the SAME member session as the app shell — point it at a saved storage state for an account that is platform staff.',
  )
  test.skip(
    () => test.info().project.name === NARROW_PROJECT,
    'The operator console is not a narrow-phone surface; see the note above and ADR-1270.',
  )

  for (const state of SHELL_RENDER_STATES) {
    test.describe(state.id, () => {
      for (const surface of operatorSurfaces().filter((s) =>
        ADVISORY_OPERATOR_PATHS.includes(s.path),
      )) {
        test(`${surface.path} matches baseline`, async ({ page, serverErrors }) => {
          await capture(page, surface, state, serverErrors)
        })
      }
    })
  }
})

// The header band (ADR-1035's other named follow-up, taken on ADR-1270's terms).
//
// NARROW ONLY, and the reason is in `headerBandSurfaces()`: at 1280 and 390 this would
// re-photograph pixels the marketing baselines already gate under an absolute 400px tolerance
// (ADR-1258 retired the ratio that made the header invisible). At 320 nothing photographs an
// anonymous visitor's chrome at all, and that is the width ADR-1035's off-screen menu button
// was found near. The PATH was chosen by measuring the wall detector's headroom, not by taste —
// see the table in `headerBandSurfaces()`; `/` would have failed on capture.
//
// Anonymous: NO `test.use({ storageState })` here, deliberately. A signed-in capture would
// photograph whatever the session turns the header into, under the name of the band a visitor
// sees.
test.describe('visual · header band', { tag: '@visual' }, () => {
  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the visual suite.',
  )
  test.skip(
    () => test.info().project.name !== NARROW_PROJECT,
    'The header band is captured at 320 only — at 1280 and 390 the full-page marketing baselines already gate it (ADR-1270).',
  )

  for (const state of PUBLIC_RENDER_STATES) {
    test.describe(state.id, () => {
      for (const surface of headerBandSurfaces()) {
        test(`${surface.path} header band matches baseline`, async ({ page, serverErrors }) => {
          await capture(page, surface, state, serverErrors)
        })
      }
    })
  }
})

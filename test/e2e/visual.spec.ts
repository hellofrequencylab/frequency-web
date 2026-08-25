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
//   projects      — `desktop` (1280×800) and `mobile` (390×844), from playwright.config.ts.
//
// Tagged @visual so they only run when explicitly asked for:
//   pnpm test:e2e:visual        (playwright test --grep @visual)
// The plain smoke run (pnpm test:e2e) grep-inverts the tag, so these never fire by
// accident — they are the one suite with a committed-baseline dependency.
//
// Baselines are captured ON A RUNNER, never in an agent sandbox (which cannot reach a
// deploy URL): .github/workflows/e2e.yml → workflow_dispatch → update_baselines.
import { test, expect, type Page } from '@playwright/test'
import {
  RENDER_STATES,
  SHELL_RENDER_STATES,
  STORAGE_STATE,
  appSurfaces,
  applyRenderState,
  assertMemberSession,
  assertNotProtectionWall,
  currentPathname,
  masksFor,
  operatorDenialReason,
  operatorSurfaces,
  publicSurfaces,
  settle,
  type RenderState,
  type Surface,
} from './surfaces'

const baseURL = process.env.PW_BASE_URL

/** One capture. `state.id` is in the filename so all four looks are separately reviewable:
 *  test/e2e/__screenshots__/visual.spec.ts/<slug>--<state>-<project>.png */
async function capture(
  page: Page,
  surface: Surface,
  state: RenderState,
): Promise<void> {
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

  await settle(page)
  // `viewportOnly` surfaces photograph the first screen. See the note on Surface.viewportOnly:
  // a full-page baseline of a live, shared stream measures WHEN it was taken, not how it looks.
  await expect(page).toHaveScreenshot(`${surface.slug}--${state.id}.png`, {
    fullPage: !surface.viewportOnly,
    mask: masksFor(page, surface),
  })
}

test.describe('visual', { tag: '@visual' }, () => {
  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the visual suite.',
  )

  for (const state of RENDER_STATES) {
    test.describe(state.id, () => {
      for (const surface of publicSurfaces()) {
        test(`${surface.path} matches baseline`, async ({ page }) => {
          await capture(page, surface, state)
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

  for (const state of SHELL_RENDER_STATES) {
    test.describe(state.id, () => {
      for (const surface of appSurfaces()) {
        test(`${surface.path} matches baseline`, async ({ page }) => {
          await capture(page, surface, state)
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

  for (const state of SHELL_RENDER_STATES) {
    test.describe(state.id, () => {
      for (const surface of operatorSurfaces()) {
        test(`${surface.path} matches baseline`, async ({ page }) => {
          await capture(page, surface, state)
        })
      }
    })
  }
})

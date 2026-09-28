import { existsSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const baseURL = process.env.PW_BASE_URL
const spaceSlug = process.env.PW_SPACE_SLUG
const storageState = process.env.PW_STORAGE_STATE
const hasSession = !!storageState && existsSync(storageState)
const calendarPath = spaceSlug ? `/spaces/${spaceSlug}/calendar` : '/spaces/missing/calendar'

/**
 * How long a write that ends in `revalidate(slug)` may take to show its consequence on the page.
 *
 * 🔴 SIZED FROM THE SERVER, NOT FROM THE TEST'S OWN CLOCK (LIVE-463). The first ceiling here was
 * 20 s, taken from "the title's Date.now() to the row's created_at": 7.6 s to 10.9 s. That interval
 * was the wrong instrument. Two of the three tests mint the title BEFORE `openOperatorCalendar`, so
 * it counted a page load; all three count the dialog, two fills and a click that waits for
 * actionability on a runner that is also driving the visual suite. Re-measured on 2026-09-28 from
 * the database's side of the same saves (Supabase gateway log, filtered to the e2e member and the
 * function instance that made the RPC; Postgres pg_stat_statements for the RPC itself):
 *
 *   create_penciled_plan in Postgres      26.7 ms mean, 72.5 ms max, 205 calls
 *   the same RPC at the gateway           140 ms to 330 ms
 *   resolveEditor before it               auth → profile → space → caps, under 0.8 s
 *   the revalidate re-render after it     four parallel reads, 100 ms to 450 ms each
 *   the whole server-visible action       about 2 s, first DB call to last re-render read
 *
 * So the save the host waits for is about 2 s of server, and the rest of the old number was the
 * harness. This ceiling is five times the server-visible action and half the old one. It is a
 * ceiling, not a claim: `pencilDate()` records the real click-to-consequence time as a
 * `pencil-save-ms` annotation on every save, so the next run that is allowed to pencil prints the
 * number instead of a bare timeout. Do not raise this to absorb a slow run; read the annotation.
 */
const SAVE_ROUND_TRIP_MS = 10_000

/**
 * Every Plan a test pencils in, so `afterEach` can put it away. The harness Space is the owner's
 * REAL Space (owner ruling 2026-09-22: no throwaway Space; `frequency` is the root and never the
 * target), and before HYG-120 each run left its Plans and dates behind: 27 stacked on one day in a
 * single evening, enough that test 1 could not find its own title on the grid. The test step holds
 * no service-role key (e2e.yml gives it only to the mint step), so teardown goes through the
 * product, which is also why the product has the door.
 */
const pencilledTitles: string[] = []

function uniquePlanTitle(): string {
  const title = `Browser pencil ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  pencilledTitles.push(title)
  return title
}

/**
 * The role guard, lifted out of `openOperatorCalendar` so a test that has to navigate somewhere
 * else first can apply it too.
 *
 * 🔴 WHY IT HAS TO BE SHARED. `calendar-workspace.tsx` returns early with
 * `data-calendar-view="guest"` and NO operator controls when `adminAllowed` is false, so a viewer
 * the Space does not let manage sees the guest view whatever `?view=` says. Every test in this
 * file went through `openOperatorCalendar` and skipped cleanly on that — except the legacy-URL
 * one, which navigated on its own and asserted `admin` directly. It was therefore the only test
 * here that turned an owner-held ACCOUNT fact into a red required check, and on 2026-09-21/22 it
 * did: two failures on every `pr-compare`, on six pull requests that had nothing to do with the
 * calendar, for as long as the e2e member lacked manage rights on PW_SPACE_SLUG's Space.
 *
 * The same run's committed baselines corroborate the cause rather than leaving it inferred: both
 * `app-space-console` PNGs are photographs of "That space isn't here". The account cannot reach
 * that Space's console either.
 *
 * ⚠️ THIS IS A SKIP, NOT A PASS, and the distinction is the point. It carries the cause and the
 * remedy in its message, `@shell` makes `shell-reporter.ts` count it, and `PW_REQUIRE_SHELL`
 * still holds the suite to reaching the surfaces it can reach. What it stops doing is reporting
 * an account fact as somebody's broken pull request.
 */
async function skipUnlessOperator(page: Page) {
  await expect(page.locator('[data-calendar-workspace]')).toBeVisible()
  if ((await page.getByRole('button', { name: 'Calendar', exact: true }).count()) === 0) {
    test.skip(
      true,
      `The saved e2e member cannot manage ${calendarPath}; point PW_SPACE_SLUG at a Space this account can manage.`,
    )
  }
}

async function openOperatorCalendar(page: Page) {
  const response = await page.goto(calendarPath)
  expect(response, `navigation to ${calendarPath} returned a response`).toBeTruthy()
  expect(response!.ok(), `expected 2xx for ${calendarPath}, got ${response!.status()}`).toBe(true)
  await skipUnlessOperator(page)
  await page.getByRole('button', { name: 'Calendar', exact: true }).click()
  await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'admin')
  await expect(page.locator('[data-calendar-admin-grid]')).toBeVisible()
}

/**
 * Press "Pencil date" and wait for the WRITE, not the click.
 *
 * 🔴 WHY THE TIMEOUT IS SIZED AND NOT DEFAULT. Saving a pencil is a server action that inserts two
 * rows and then revalidates both calendar routes, which re-renders the viewed page in the same
 * round trip. playwright.config.ts sets `timeout: 60_000` and no `expect.timeout`, so a bare
 * `expect(...).toBeVisible()` here gives up at 5 s while a `click()` on the same page waits out the
 * full minute — which is exactly why one test's click survived the same save that failed the
 * assertion in the test beside it. (LIVE-462 removed a second, redundant client render from that
 * path; LIVE-463 measured what was left, and the ceiling is `SAVE_ROUND_TRIP_MS`, sized there.)
 *
 * "Open Plan" is the proof the save landed: it renders only for a saved entry that carries a Plan
 * id, which is what the action returns. Waiting on it asserts the consequence, not a delay. The
 * time from the click to that proof is written to the report as `pencil-save-ms`, so the ceiling
 * above is judged against the click and never again against the title's clock.
 */
async function pencilDate(page: Page) {
  const clickedAt = Date.now()
  await page.getByRole('button', { name: 'Pencil date', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open Plan', exact: true })).toBeVisible({ timeout: SAVE_ROUND_TRIP_MS })
  test.info().annotations.push({ type: 'pencil-save-ms', description: String(Date.now() - clickedAt) })
}

test.describe('operator calendar acceptance', { tag: ['@smoke', '@shell'] }, () => {
  test.use({ storageState })
  test.skip(!baseURL, 'PW_BASE_URL is required for real-browser calendar acceptance coverage.')
  test.skip(!spaceSlug, 'PW_SPACE_SLUG must name a Space the e2e member can manage.')
  test.skip(!hasSession, 'PW_STORAGE_STATE must point to a saved member session.')

  /**
   * TEARDOWN THROUGH THE PRODUCT (HYG-120). Open each pencilled Plan from the List and press
   * "Archive Plan": the Plan leaves every list and its pencilled date leaves the grid. A title that
   * never reached the List (the test failed before its save landed) has nothing to archive and is
   * skipped rather than failing the teardown on top of the test.
   */
  test.afterEach(async ({ page }) => {
    const titles = pencilledTitles.splice(0)
    if (titles.length === 0) return
    await page.goto(calendarPath)
    if ((await page.getByRole('button', { name: 'List', exact: true }).count()) === 0) return
    await page.getByRole('button', { name: 'List', exact: true }).click()
    const listPanel = page.locator('[data-calendar-panel="list"]')
    for (const title of titles) {
      const row = listPanel.getByRole('button', { name: new RegExp(title) })
      if ((await row.count()) === 0) continue
      await row.click()
      await listPanel.getByRole('button', { name: 'Open Plan' }).click()
      const drawer = page.getByRole('dialog').filter({ has: page.locator('#plan-title') })
      await expect(drawer.locator('#plan-title')).toHaveValue(title)
      page.once('dialog', (dialog) => dialog.accept())
      await drawer.getByRole('button', { name: 'Archive Plan' }).click()
      // Archive is the same shape of write as the pencil (gate, rows, revalidate), so the same ceiling.
      await expect(drawer).toHaveCount(0, { timeout: SAVE_ROUND_TRIP_MS })
      await expect(row).toHaveCount(0, { timeout: SAVE_ROUND_TRIP_MS })
    }
  })

  test('creates a title/date-only pencil and finds its Plan in Calendar, List, and Workflow', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The mutating journey runs once; mobile controls have their own coverage.')

    const title = uniquePlanTitle()
    await openOperatorCalendar(page)

    await page.getByRole('button', { name: 'Pencil it in' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('#entry-title').fill(title)
    await page.locator('#entry-start-date').fill(new Date().toLocaleDateString('en-CA'))
    await pencilDate(page)
    // 🔴 `exact: true`, and it is load-bearing at all three Cancel sites. getByRole's `name`
    // defaults to exact:false, which is case-insensitive SUBSTRING matching, and the saved entry
    // drawer renders two buttons whose names one prefixes the other: the footer's "Cancel"
    // (dismiss the form, staff-calendar.tsx:599) and the stage row's "Cancel this date" (the
    // Cancelled exit, :344). Strict mode then fails with two matches. The second only appears once
    // the entry has been SAVED, which is why this never fired while these tests were skipping for
    // want of manage rights on PW_SPACE_SLUG's Space — the account fact this file's own
    // skipUnlessOperator note describes. Granting it made three latent selector bugs real.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    const calendarPanel = page.locator('[data-calendar-panel="admin"]')
    // 🔴 BY TITLE ATTRIBUTE, NOT BY EXACT TEXT. A grid chip renders `<span>{timeLabel}</span> {title}`
    // (event-calendar.tsx), so its text is never exactly the title; a busy day STACKS its chips into
    // one button whose text joins every title with ' · '; and past three chips the rest hide behind
    // "+N more". `getByText(title, { exact: true })` could not match any of those — and the first
    // run this assertion ever took (pr-compare run 35757524209) hit a day carrying 27 leaked test
    // pencils, so it was stacked to the hilt. Every chip and every stacked button carries the title
    // in its `title` attribute (joined with ', ' when stacked), and a substring match reaches both.
    // The grid re-fetches its month on `refreshKey` after the save: one more server round trip, same ceiling.
    await expect(calendarPanel.getByTitle(title).first()).toBeVisible({ timeout: SAVE_ROUND_TRIP_MS })

    await page.getByRole('button', { name: 'List', exact: true }).click()
    const listPanel = page.locator('[data-calendar-panel="list"]')
    await expect(listPanel.getByRole('button', { name: new RegExp(title) })).toBeVisible()
    await expect(page).toHaveURL(/[?&]view=list(?:&|$)/)

    await page.getByRole('button', { name: 'Workflow', exact: true }).click()
    const workflowPanel = page.locator('[data-calendar-panel="workflow"]')
    await expect(workflowPanel.locator('[data-workflow-card]').filter({ hasText: title })).toBeVisible()
    await expect(page).toHaveURL(/[?&]view=workflow(?:&|$)/)

    // The title is unique so afterEach can find this Plan in the List and archive it (HYG-120).
  })

  test('Guest preview hides the private Plan while preserving operator controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The mutating privacy journey runs once.')
    await openOperatorCalendar(page)
    const privateTitle = uniquePlanTitle()

    await page.getByRole('button', { name: 'Pencil it in' }).click()
    await page.locator('#entry-title').fill(privateTitle)
    await page.locator('#entry-start-date').fill(new Date().toLocaleDateString('en-CA'))
    await pencilDate(page)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    await page.getByRole('button', { name: 'Guest preview' }).click()
    await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'guest')
    await expect(page.getByRole('button', { name: 'Guest preview' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-calendar-panel="guest"]').getByText(privateTitle, { exact: true })).toHaveCount(0)

  })

  test('legacy calendar view URLs resolve to their current controls', async ({ page }) => {
    await page.goto(`${calendarPath}?view=timeline`)
    await skipUnlessOperator(page)
    await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'admin')
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await page.goto(`${calendarPath}?view=projects`)
    await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'workflow')
    await expect(page.getByRole('button', { name: 'Workflow', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('mobile keeps Guest, Calendar, List, and Workflow controls usable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'This assertion is for the 390px mobile project.')
    await openOperatorCalendar(page)

    for (const name of ['Guest preview', 'Calendar', 'List', 'Workflow']) {
      const control = page.getByRole('button', { name, exact: true })
      await expect(control).toBeVisible()
      await expect(control).toBeInViewport()
    }

    await page.getByRole('button', { name: 'Workflow', exact: true }).click()
    await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'workflow')
  })

  test('the same Plan opens one drawer from Calendar, List, Workflow, and a direct link', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The mutating Plan journey runs once.')

    const title = uniquePlanTitle()
    await openOperatorCalendar(page)

    await page.getByRole('button', { name: 'Pencil it in' }).click()
    await page.locator('#entry-title').fill(title)
    await page.locator('#entry-start-date').fill(new Date().toLocaleDateString('en-CA'))
    await pencilDate(page)

    const drawer = page.getByRole('dialog').filter({ has: page.locator('#plan-title') })
    const summary = drawer.locator('[data-plan-production-summary]')
    const assertSharedDrawer = async () => {
      await expect(drawer.locator('#plan-title')).toHaveValue(title)
      await expect(summary).toContainText(title)
      await expect(summary).toContainText('production record')
      await expect(summary).toContainText('Stage')
      await expect(summary).toContainText('Owner')
      await expect(summary).toContainText('Readiness')
      await expect(page).toHaveURL(/[?&]plan=[^&]+/)
    }
    const closeAndKeepView = async (view: 'admin' | 'list' | 'workflow') => {
      await drawer.getByRole('button', { name: 'Close' }).click()
      await expect(drawer).toHaveCount(0)
      await expect(page).not.toHaveURL(/[?&]plan=/)
      await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', view)
    }

    await page.getByRole('button', { name: 'Open Plan' }).click()
    await assertSharedDrawer()
    const planId = new URL(page.url()).searchParams.get('plan')
    expect(planId).toBeTruthy()
    await closeAndKeepView('admin')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    await page.getByRole('button', { name: 'List', exact: true }).click()
    const listPanel = page.locator('[data-calendar-panel="list"]')
    await listPanel.getByRole('button', { name: new RegExp(title) }).click()
    await listPanel.getByRole('button', { name: 'Open Plan' }).click()
    await assertSharedDrawer()
    expect(new URL(page.url()).searchParams.get('plan')).toBe(planId)
    await closeAndKeepView('list')

    await page.getByRole('button', { name: 'Workflow', exact: true }).click()
    const workflowCard = page.locator(`[data-workflow-card="${planId}"]`)
    await workflowCard.getByRole('button', { name: 'Open Plan' }).click()
    await assertSharedDrawer()
    expect(new URL(page.url()).searchParams.get('plan')).toBe(planId)
    await closeAndKeepView('workflow')

    await page.goto(`${calendarPath}?view=workflow&plan=${planId}`)
    await assertSharedDrawer()
    await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'workflow')

    await page.goBack()
    await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'workflow')
    await expect(drawer).toHaveCount(0)
    await expect(page).not.toHaveURL(/[?&]plan=/)

    await page.goForward()
    await assertSharedDrawer()
    await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'workflow')
    await drawer.getByRole('button', { name: 'Close' }).click()
    await expect(page).toHaveURL(new RegExp(`[?&]view=workflow(?:&|$)`))
    await expect(page).not.toHaveURL(/[?&]plan=/)
  })

  test('a drawer stage change moves the Plan everywhere without a reload', async ({ page }) => {
    test.skip(!process.env.PW_SHARED_PLAN_DRAWER, 'Enable after synchronized stage transitions land.')
    await openOperatorCalendar(page)
    await page.getByRole('button', { name: 'Workflow', exact: true }).click()

    const card = page.locator('[data-workflow-card]').first()
    await card.click()
    const drawer = page.getByRole('dialog')
    const title = await drawer.locator('#plan-title').inputValue()
    await drawer.locator('#plan-stage').selectOption('production')
    await drawer.getByRole('button', { name: 'Save Plan' }).click()

    await expect(page.locator('[data-workflow-column="production"]').getByText(title, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'List', exact: true }).click()
    await expect(page.locator('[data-calendar-panel="list"]').getByText(title, { exact: true })).toBeVisible()
  })
})

test.describe('operator calendar privacy and redirects', { tag: '@smoke' }, () => {
  test.skip(!baseURL, 'PW_BASE_URL is required for real-browser calendar acceptance coverage.')

  test('an anonymous guest never receives operator calendar controls', async ({ page }) => {
    test.skip(!spaceSlug, 'PW_SPACE_SLUG is required to exercise a real public Space calendar.')
    await page.goto(calendarPath)

    await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'guest')
    await expect(page.locator('[data-calendar-admin-grid]')).toHaveCount(0)
    await expect(page.locator('[data-calendar-workflow-view]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Guest preview' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Pencil it in' })).toHaveCount(0)
  })

  for (const [legacy, current] of [
    ['/onboarding/beta', '/join'],
    ['/onboarding/beta/operator-calendar', '/join'],
  ] as const) {
    test(`${legacy} redirects to ${current}`, async ({ page }) => {
      const response = await page.goto(legacy)
      expect(response!.ok(), `expected redirect chain for ${legacy} to end in 2xx`).toBe(true)
      expect(new URL(page.url()).pathname).toBe(current)
    })
  }
})
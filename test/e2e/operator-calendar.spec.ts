import { existsSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const baseURL = process.env.PW_BASE_URL
const spaceSlug = process.env.PW_SPACE_SLUG
const storageState = process.env.PW_STORAGE_STATE
const hasSession = !!storageState && existsSync(storageState)
const calendarPath = spaceSlug ? `/spaces/${spaceSlug}/calendar` : '/spaces/missing/calendar'

function uniquePlanTitle(): string {
  return `Browser pencil ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

test.describe('operator calendar acceptance', { tag: ['@smoke', '@shell'] }, () => {
  test.use({ storageState })
  test.skip(!baseURL, 'PW_BASE_URL is required for real-browser calendar acceptance coverage.')
  test.skip(!spaceSlug, 'PW_SPACE_SLUG must name a Space the e2e member can manage.')
  test.skip(!hasSession, 'PW_STORAGE_STATE must point to a saved member session.')

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
    await page.getByRole('button', { name: 'Pencil date', exact: true }).click()

    await expect(page.getByRole('button', { name: 'Open Plan' })).toBeVisible()
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
    await expect(calendarPanel.getByText(title, { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'List', exact: true }).click()
    const listPanel = page.locator('[data-calendar-panel="list"]')
    await expect(listPanel.getByRole('button', { name: new RegExp(title) })).toBeVisible()
    await expect(page).toHaveURL(/[?&]view=list(?:&|$)/)

    await page.getByRole('button', { name: 'Workflow', exact: true }).click()
    const workflowPanel = page.locator('[data-calendar-panel="workflow"]')
    await expect(workflowPanel.locator('[data-workflow-card]').filter({ hasText: title })).toBeVisible()
    await expect(page).toHaveURL(/[?&]view=workflow(?:&|$)/)

    // The test title is unique because deleting only the date would leave its canonical Plan behind.
  })

  test('Guest preview hides the private Plan while preserving operator controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The mutating privacy journey runs once.')
    await openOperatorCalendar(page)
    const privateTitle = uniquePlanTitle()

    await page.getByRole('button', { name: 'Pencil it in' }).click()
    await page.locator('#entry-title').fill(privateTitle)
    await page.locator('#entry-start-date').fill(new Date().toLocaleDateString('en-CA'))
    await page.getByRole('button', { name: 'Pencil date', exact: true }).click()
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
    await page.getByRole('button', { name: 'Pencil date', exact: true }).click()

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
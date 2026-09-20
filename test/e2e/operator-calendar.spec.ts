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

async function openOperatorCalendar(page: Page) {
  const response = await page.goto(calendarPath)
  expect(response, `navigation to ${calendarPath} returned a response`).toBeTruthy()
  expect(response!.ok(), `expected 2xx for ${calendarPath}, got ${response!.status()}`).toBe(true)
  await expect(page.locator('[data-calendar-workspace]')).toBeVisible()
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
    await page.getByRole('button', { name: 'Cancel' }).click()

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
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('button', { name: 'Guest preview' }).click()
    await expect(page.locator('[data-calendar-workspace]')).toHaveAttribute('data-calendar-view', 'guest')
    await expect(page.getByRole('button', { name: 'Guest preview' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-calendar-panel="guest"]').getByText(privateTitle, { exact: true })).toHaveCount(0)

  })

  test('legacy calendar view URLs resolve to their current controls', async ({ page }) => {
    await page.goto(`${calendarPath}?view=timeline`)
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
    await page.getByRole('button', { name: 'Cancel' }).click()

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
    ['/onboarding/beta/operator-calendar', '/join/operator-calendar'],
  ] as const) {
    test(`${legacy} redirects to ${current}`, async ({ page }) => {
      const response = await page.goto(legacy)
      expect(response!.ok(), `expected redirect chain for ${legacy} to end in 2xx`).toBe(true)
      expect(new URL(page.url()).pathname).toBe(current)
    })
  }
})
// The signed-out Create a Space wizard (LIVE-1971, ADR-1933): the walk from a door to the contact step, anonymous
// and read-only like funnel.spec.ts. It skips itself without PW_BASE_URL and mocks nothing.
//
// What it proves, and no more: /spaces/new opens the wizard for a visitor with no account and carries the door's
// hints; the builder walks name, accent and the offer mock-up on the keyboard and the pointer; the two anonymous
// sinks answer 204 to junk. It stops before the contact step is submitted, because that step writes a lead on the
// target's own database; the save and the hand-over are covered by vitest (lib/create-space, the actions test).
import { test, expect } from './fixtures'

const baseURL = process.env.PW_BASE_URL

test.describe('create a space, signed out', { tag: '@smoke' }, () => {
  test.skip(!baseURL, 'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to walk the wizard.')

  test('/spaces/new opens the wizard for a visitor with no account, carrying the door', async ({ page }) => {
    const response = await page.goto('/spaces/new?mode=business:membership&name=Limewell%20Studio&theme=designer')
    expect(response!.ok(), `expected the /spaces/new hop to end in a 2xx, got ${response!.status()} at ${page.url()}`).toBe(true)
    const url = new URL(page.url())
    expect(url.pathname).toBe('/create-a-space')
    // The door's query rides along as the door spelled it (`theme=` from /spaces/new, `kit=` from a /themes page).
    expect(url.searchParams.get('kit') ?? url.searchParams.get('theme')).toBe('designer')
    expect(url.searchParams.get('mode')).toBe('business:membership')
    expect(url.searchParams.get('name')).toBe('Limewell Studio')
    await expect(page.locator('#cs-h1')).toBeVisible()
    await expect(page.locator('.cs-hero-building')).toBeVisible()
    await expect(page.locator('#cs-name')).toHaveValue('Limewell Studio')
  })

  // Owner 2026-11-02: every logged-out launch, build, Spotlight or website click opens the wizard. A cold /launch
  // and the Free Spotlight buttons' /launch/start make the same hop as /spaces/new, query intact.
  for (const door of ['/launch', '/launch/start?utm_source=site&utm_medium=landing']) {
    test(`${door} opens the wizard for a visitor with no account`, async ({ page }) => {
      const response = await page.goto(door)
      expect(response!.ok(), `expected the ${door} hop to end in a 2xx, got ${response!.status()} at ${page.url()}`).toBe(true)
      const url = new URL(page.url())
      expect(url.pathname).toBe('/create-a-space')
      if (door.includes('?')) expect(url.searchParams.get('utm_medium')).toBe('landing')
      await expect(page.locator('#cs-h1')).toBeVisible()
    })
  }

  test('the builder walks name, accent and the offer mock-up', async ({ page }) => {
    const response = await page.goto('/create-a-space?kit=designer')
    expect(response!.ok()).toBe(true)
    await expect(page.locator('h1#cs-h1')).toBeVisible()

    // Step 1: the name, then an accent, then Next.
    const name = page.locator('#cs-name')
    await name.click()
    await page.keyboard.type('Limewell Studio')
    await expect(page.locator('.cs-hero-building')).toBeVisible()
    // Locked until an accent is picked (aria-disabled, so Enter and the pointer both wait).
    const next = page.getByRole('button', { name: /^Next/ }).first()
    await expect(next).toHaveAttribute('aria-disabled', 'true')
    await expect(page.locator('.cs-swatch').first()).toBeVisible()
    await page.locator('.cs-swatch').nth(1).click()
    await expect(next).toHaveAttribute('aria-disabled', 'false')
    await next.click()
    await expect(page.locator('.cs-toast')).toContainText(/accent saved/i)

    // Step 2: an example sentence starts the mock-up itself; the lines play and the offer step closes.
    const example = page.locator('.cs-chip-btn').first()
    await expect(example).toBeVisible()
    await example.click()
    await expect(page.locator('.cs-toast')).toContainText(/mock-up ready/i, { timeout: 15_000 })

    // Step 3 opens with its fine print; nothing is submitted here.
    await expect(page.getByText(/We save your draft to this address/)).toBeVisible()
    const ways = page.locator('a[href*="/privacy"]')
    expect(await ways.count(), 'the contact step links Privacy').toBeGreaterThan(0)
  })

  test('the anonymous sinks answer 204 to junk and store nothing from it', async ({ request }) => {
    for (const path of ['/api/create-space/signal', '/api/create-space/draft']) {
      const r = await request.post(path, { data: { event: 'nav.page_view', props: { text: 'typed words' }, draft: 'x' } })
      expect(r.status(), path).toBe(204)
      expect(await r.text(), path).toBe('')
    }
  })
})

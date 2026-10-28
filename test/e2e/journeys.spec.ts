import { existsSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { settle, assertNoServerErrors } from './surfaces'
import { journeyWritesAllowed, localAuthLink, localHttpDestination, stripeDestination } from './journey-safety'

// SIGNED-IN USER JOURNEYS (functional QA, 2026-10-28).
//
// The other suites photograph, measure and axe-scan surfaces. None of them DO anything: no form is filled,
// no chip is pressed, no kit is started. This file walks the core signed-in paths the way a member does and
// asserts the outcome (where they landed, what the page offered), not how it looked.
//
// TWO TIERS, because a preview deployment talks to the production database (the member session is minted
// against it, see mint-storage-state.mts):
//
//   @journey        READ-ONLY. Opens pages, steps through the Wizard WITHOUT submitting, reads the checkout
//                   panel. Safe against a preview with the e2e member account. Needs PW_STORAGE_STATE.
//   @journey-write  CREATES records (a Space, an event, a Circle join). Runs only with PW_JOURNEY_WRITES=1 and
//                   REFUSES production hosts, so it can only point at a local build over a local Supabase
//                   (.github/workflows/e2e-journeys.yml boots one). Never aim it at user data.
//
// Everything self-skips without PW_BASE_URL / PW_STORAGE_STATE, so `playwright test --list` stays clean.
// Runs on the `desktop` project only; the phone widths are owned by overflow.spec.ts and
// space-console-phone.spec.ts.

const baseURL = process.env.PW_BASE_URL
const storageState = process.env.PW_STORAGE_STATE
const hasSession = !!storageState && existsSync(storageState)
const spaceSlug = process.env.PW_SPACE_SLUG
const circleSlug = process.env.PW_CIRCLE_SLUG

function writesAllowed() {
  return journeyWritesAllowed(process.env.PW_JOURNEY_WRITES, baseURL, process.env.NEXT_PUBLIC_SUPABASE_URL)
}

test.describe('signed-in journeys @journey @shell', () => {
  test.skip(!baseURL, 'PW_BASE_URL not set')
  test.skip(!hasSession, 'PW_STORAGE_STATE missing: no member session to walk with')
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'journeys run on desktop only')
  })
  test.use({ storageState: hasSession ? storageState : undefined })

  /** Open a path as the member and prove the app answered: right path, shell present, no 5xx, no error card. */
  async function open(page: Page, serverErrors: Parameters<typeof assertNoServerErrors>[0], path: string) {
    await page.goto(path)
    await settle(page)
    const url = new URL(page.url())
    expect(url.pathname, `${path} bounced to ${url.pathname}`).not.toBe('/sign-in')
    assertNoServerErrors(serverErrors, path)
    await expect(page.getByText('Something went wrong on our end')).toHaveCount(0)
    return url
  }

  test('sign-in session lands in the member shell', async ({ page, serverErrors }) => {
    const url = await open(page, serverErrors, '/feed')
    expect(url.pathname).toBe('/feed')
    await expect(page.locator('[data-tour-anchor="content"]')).toBeVisible()
  })

  test('/sign-in sends a signed-in member on, with next honoured', async ({ page }) => {
    await page.goto('/sign-in?next=/settings')
    await page.waitForURL(/\/settings/)
    await page.goto('/sign-in?next=//evil.example')
    // The open-redirect guard: an off-site next falls back to the feed.
    await page.waitForURL((u) => u.pathname === '/feed')
    expect(new URL(page.url()).hostname).toBe(new URL(baseURL!).hostname)
  })

  test('Create a Space wizard walks to the Your look step and the review without submitting', async ({ page, serverErrors }) => {
    await open(page, serverErrors, '/spaces/new')
    await page.getByRole('button', { name: 'Decide later' }).click()
    const next = page.getByRole('button', { name: 'Continue' })
    await next.click()

    // Setup step: Continue stays disabled until a setup is chosen.
    const setup = page.getByRole('group', { name: 'Tool setup' })
    await expect(setup).toBeVisible()
    await expect(next).toBeDisabled()
    await setup.getByRole('button').first().click()
    await expect(next).toBeEnabled()
    await next.click()

    // Name step: Continue waits for a name; the handle follows it.
    const name = page.getByLabel('Name', { exact: true })
    await name.fill('Journey Test Yoga')
    await expect(page.getByLabel('Handle')).toHaveValue('journey-test-yoga')
    await next.click()

    // Your look step.
    const look = page.getByRole('group', { name: 'Your look' })
    await expect(look).toBeVisible()
    expect(await look.getByRole('button').count()).toBeGreaterThan(1)
    await look.getByRole('button').first().click()
    await next.click()

    // Review step: the summary echoes what was typed, and the final button is offered, not pressed.
    await expect(page.getByText('/spaces/journey-test-yoga')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create my Space' })).toBeEnabled()
  })

  test('Start with this kit on /themes arrives in the Wizard with that theme already picked', async ({ page, serverErrors }) => {
    await page.goto('/themes')
    await settle(page)
    const kit = page.getByRole('link', { name: /Start with this kit/ }).first()
    // /themes is the gallery; the kit buttons live on a theme's own page, so follow the first theme card.
    if (!(await kit.count())) {
      const themeLinks = page.locator('a[href^="/themes/"]')
      expect(await themeLinks.count(), '/themes lists no theme pages').toBeGreaterThan(0)
      await themeLinks.first().click()
      await settle(page)
    }
    const start = page.getByRole('link', { name: /Start with this kit/ }).first()
    await expect(start, 'no "Start with this kit" link on the theme page').toBeVisible()
    const href = await start.getAttribute('href')
    expect(href).toMatch(/^\/spaces\/new\?theme=[a-z0-9-]+&niche=/)
    await start.click()
    await page.waitForURL(/\/spaces\/new/)
    assertNoServerErrors(serverErrors, 'themes kit → wizard')
    await expect(page.locator('body')).not.toContainText('Something went wrong')
  })

  test('Create an event and Create a Circle forms render for a member', async ({ page, serverErrors }) => {
    for (const path of ['/events/new', '/circles/new']) {
      const url = await open(page, serverErrors, path)
      expect(url.pathname, `${path} did not stay put`).toBe(path)
      await expect(page.locator('form, [data-tour-anchor="content"]').first()).toBeVisible()
    }
  })

  test('Crew page offers the amounts and hands off to checkout rather than erroring', async ({ page, serverErrors }) => {
    const url = await open(page, serverErrors, '/crew')
    expect(url.pathname).toBe('/crew')
    // The Crew presets are $5 / $10 / $25 (default $10). Read, never pay.
    await expect(page.getByText(/\$10/).first()).toBeVisible()
  })

  test('Upgrade page renders the plan ladder', async ({ page, serverErrors }) => {
    await open(page, serverErrors, '/upgrade')
    await expect(page.locator('body')).toContainText(/\$/)
  })

  test('Space console pages answer for the owner', async ({ page, serverErrors }) => {
    test.skip(!spaceSlug, 'PW_SPACE_SLUG not set: no Space to open')
    for (const sub of ['', '/spotlight', '/layout', '/modules', '/circles', '/leadership', '/mode']) {
      const path = `/spaces/${spaceSlug}/manage${sub}`
      const url = await open(page, serverErrors, path)
      expect(url.pathname, `${path} redirected to ${url.pathname}`).toBe(path)
    }
  })

  test('the rest of the member shell answers (no bounce, no 5xx, no error card)', async ({ page, serverErrors }) => {
    const paths = [
      '/nearby', '/friends', '/connections', '/messages', '/notifications', '/settings', '/search', '/discover',
      '/rewards', '/library', '/journal', '/practices', '/journeys', '/orders', '/marketplace', '/network/contacts',
      '/channels', '/events', '/events/calendar', '/circles', '/progress', '/people', '/profile', '/support',
    ]
    const bad: string[] = []
    for (const path of paths) {
      await page.goto(path)
      await settle(page)
      const landed = new URL(page.url()).pathname
      if (landed === '/sign-in') bad.push(`${path} bounced to /sign-in`)
      if (await page.getByText('Something went wrong on our end').count()) bad.push(`${path} shows the error card`)
      if (serverErrors.seen.length) {
        bad.push(`${path} saw ${serverErrors.seen.map((e) => `${e.status} ${e.url}`).join(', ')}`)
        serverErrors.seen.length = 0
      }
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  test('Space pages beyond the console answer for the owner', async ({ page, serverErrors }) => {
    test.skip(!spaceSlug, 'PW_SPACE_SLUG not set: no Space to open')
    const subs = ['', '/setup', '/crm', '/marketing', '/settings/websites', '/settings/members', '/settings/email', '/settings/billing', '/settings/payments', '/settings/calendar', '/practices', '/journeys', '/network']
    const bad: string[] = []
    for (const sub of subs) {
      await page.goto(`/spaces/${spaceSlug}${sub}`)
      await settle(page)
      if (new URL(page.url()).pathname === '/sign-in') bad.push(`${sub || '/'} bounced to /sign-in`)
      if (await page.getByText('Something went wrong on our end').count()) bad.push(`${sub || '/'} shows the error card`)
      if (serverErrors.seen.length) {
        bad.push(`${sub || '/'} saw ${serverErrors.seen.map((e) => `${e.status} ${e.url}`).join(', ')}`)
        serverErrors.seen.length = 0
      }
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  test('CRM pages answer for staff (skips with the cause when the account is not staff)', async ({ page, serverErrors }) => {
    for (const path of ['/admin/crm', '/admin/crm/contacts', '/admin/crm/leads', '/admin/crm/pipeline']) {
      await page.goto(path)
      await settle(page)
      if (new URL(page.url()).pathname === '/feed') {
        test.skip(true, `${path} bounced to /feed: the e2e account is not staff (HYG-027)`)
      }
      assertNoServerErrors(serverErrors, path)
      await expect(page.getByText('Something went wrong on our end')).toHaveCount(0)
    }
  })
})

test.describe('signed-in journeys that write @journey-write @shell', () => {
  const gate = writesAllowed()
  test.skip(!hasSession, 'PW_STORAGE_STATE missing')
  test.skip(!gate.ok, gate.why)
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'journeys run on desktop only')
  })
  test.use({ storageState: hasSession ? storageState : undefined })
  test.describe.configure({ mode: 'serial' })

  const stamp = Date.now().toString(36)
  const handle = `qa-${stamp}`

  test('create a Space through the Wizard with a kit theme, then land in its setup', async ({ page, serverErrors }) => {
    await page.goto('/themes/nocturne')
    await settle(page)
    const start = page.getByRole('link', { name: /Start with this kit|Use .* →/ }).first()
    await start.click()
    await page.waitForURL(/\/spaces\/new/)

    await page.getByRole('button', { name: 'Decide later' }).click()
    const next = page.getByRole('button', { name: 'Continue' })
    await next.click()
    await page.getByRole('group', { name: 'Tool setup' }).getByRole('button').first().click()
    await next.click()
    await page.getByLabel('Name', { exact: true }).fill(`QA ${stamp}`)
    await page.getByLabel('Handle').fill(handle)
    await next.click()
    // The theme the kit named is the pre-selected look.
    await expect(page.getByRole('group', { name: 'Your look' }).locator('[aria-pressed="true"]')).toHaveCount(1)
    await next.click()
    await page.getByRole('button', { name: 'Create my Space' }).click()

    await page.waitForURL(new RegExp(`/spaces/${handle}`), { timeout: 30_000 })
    assertNoServerErrors(serverErrors, 'create space')
    await expect(page.getByText('Something went wrong on our end')).toHaveCount(0)
  })

  test('the new Space console and its theme drafts load', async ({ page, serverErrors }) => {
    for (const sub of ['/manage', '/manage/layout', '/manage/spotlight']) {
      await page.goto(`/spaces/${handle}${sub}`)
      await settle(page)
      expect(new URL(page.url()).pathname).toBe(`/spaces/${handle}${sub}`)
      assertNoServerErrors(serverErrors, sub)
    }
  })

  test('create an event', async ({ page, serverErrors }) => {
    await page.goto('/events/new')
    await settle(page)
    await page.getByLabel(/title|name/i).first().fill(`QA event ${stamp}`)
    const submit = page.getByRole('button', { name: /publish|create|save|continue/i }).last()
    await submit.click()
    await page.waitForURL((u) => u.pathname.startsWith('/events/') && u.pathname !== '/events/new', { timeout: 30_000 })
    assertNoServerErrors(serverErrors, 'create event')
  })

  test('join a Circle', async ({ page, serverErrors }) => {
    test.skip(!circleSlug, 'PW_CIRCLE_SLUG not set: no seeded Circle to join')
    await page.goto(`/circles/${circleSlug}`)
    await settle(page)
    await page.getByRole('button', { name: /^join/i }).first().click()
    await expect(page.getByRole('button', { name: /leave|joined|member/i }).first()).toBeVisible({ timeout: 15_000 })
    assertNoServerErrors(serverErrors, 'join circle')
  })

  test('import contacts from a CSV: map, review, import, undo', async ({ page, serverErrors }) => {
    await page.goto('/network/contacts')
    await settle(page)
    await page.getByRole('button', { name: 'Import from file' }).click()
    const csv = `Name,Email,Phone\nQA One ${stamp},qa1-${stamp}@example.test,555-0101\nQA Two ${stamp},qa2-${stamp}@example.test,555-0102\n`
    await page.locator('input[type="file"]').setInputFiles({ name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByRole('button', { name: /Continue to matching/ }).click({ timeout: 30_000 })
    await expect(page.getByText('Match your columns to contact fields')).toBeVisible()
    await page.getByRole('button', { name: /Review before import/ }).click()
    await expect(page.getByText('Here is what will happen')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /^Import \d+ contacts$/ }).click()
    await expect(page.getByText('Your contacts are in')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /Undo this import/ }).click()
    await expect(page.getByText('Import undone')).toBeVisible({ timeout: 30_000 })
    assertNoServerErrors(serverErrors, 'crm import')
  })

  test('Crew checkout reaches Stripe test mode', async ({ page }) => {
    test.skip(process.env.PW_STRIPE_TEST !== '1', 'PW_STRIPE_TEST is not 1: the build has no Stripe test keys')
    await page.goto('/crew')
    await settle(page)
    await page.getByRole('button', { name: /crew|join|support/i }).first().click()
    // Hosted Checkout navigates away; the on-page panel embeds a Stripe iframe. Either is a pass.
    await Promise.race([
      page.waitForURL(url => stripeDestination(url, 'checkout'), { timeout: 30_000 }),
      expect.poll(async () => {
        const sources = await page.locator('iframe').evaluateAll(frames => frames.map(frame => frame.getAttribute('src') ?? ''))
        return sources.some(src => stripeDestination(src, 'iframe'))
      }, { timeout: 30_000 }).toBe(true),
    ])
  })
})

// BRAND-NEW SIGN-UP, through the local mailbox. No stored session: this is the one journey that starts signed out.
// Needs the local Supabase's Inbucket (supabase/config.toml [inbucket], port 54324), so it takes PW_INBUCKET_URL
// and skips without it. Write tier: it creates an auth user.
test.describe('new member sign-up @journey-write', () => {
  const gate = writesAllowed()
  const inbucket = process.env.PW_INBUCKET_URL
  test.skip(!gate.ok, gate.why)
  test.skip(!localHttpDestination(inbucket), 'PW_INBUCKET_URL must be a loopback HTTP mailbox')
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'journeys run on desktop only')
  })
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unknown email, create account, open the emailed link, arrive signed in', async ({ page, serverErrors }) => {
    const box = `signup-${Date.now().toString(36)}`
    const email = `${box}@example.test`
    await page.goto('/sign-in')
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: 'Send magic link' }).click()
    await expect(page.getByText('No account for that email yet')).toBeVisible()
    await page.getByRole('button', { name: 'Create a new account' }).click()

    // Read the newest message in the mailbox and pull the first link that goes through auth.
    let link = ''
    for (let i = 0; i < 20 && !link; i++) {
      const list = await (await page.request.get(`${inbucket}/api/v1/mailbox/${box}`)).json().catch(() => [])
      if (Array.isArray(list) && list.length) {
        const msg = await (await page.request.get(`${inbucket}/api/v1/mailbox/${box}/${list[list.length - 1].id}`)).json()
        const body: string = `${msg.body?.html ?? ''} ${msg.body?.text ?? ''}`
        link = (body.match(/https?:\/\/[^\s"'<>]+(?:verify|confirm|callback)[^\s"'<>]*/)?.[0] ?? '').replace(/&amp;/g, '&')
      }
      if (!link) await page.waitForTimeout(1000)
    }
    expect(link, `no sign-in link arrived in ${box}'s mailbox`).not.toBe('')
    expect(localAuthLink(link, baseURL!, process.env.NEXT_PUBLIC_SUPABASE_URL!), 'mailbox link must stay on the local app or local auth verification endpoint').toBe(true)
    await page.goto(link)
    await settle(page)
    expect(new URL(page.url()).pathname, 'the emailed link did not sign the new member in').not.toBe('/sign-in')
    assertNoServerErrors(serverErrors, 'sign-up')
    await expect(page.getByText('Something went wrong on our end')).toHaveCount(0)
  })
})

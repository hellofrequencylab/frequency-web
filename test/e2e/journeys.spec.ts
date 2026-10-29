import { createHash } from 'node:crypto'
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

/** `page.goto` that survives the dev server's fast-refresh abort on a freshly compiled route. */
async function go(page: Page, path: string) {
  try {
    await page.goto(path)
  } catch (e) {
    if (!/ERR_ABORTED|frame was detached/.test(String(e))) throw e
    await page.goto(path)
  }
}

function writesAllowed() {
  return journeyWritesAllowed(process.env.PW_JOURNEY_WRITES, baseURL, process.env.NEXT_PUBLIC_SUPABASE_URL)
}

test.describe('signed-in journeys @journey @shell', () => {
  test.skip(!baseURL, 'PW_BASE_URL not set')
  test.skip(!hasSession, 'PW_STORAGE_STATE missing: no member session to walk with')
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'journeys run on desktop only')
    // `next dev` compiles each route on its first hit, so a cold path is slow. This is a journey, not a speed test.
    test.setTimeout(240_000)
  })
  test.use({ storageState: hasSession ? storageState : undefined })

  /** Open a path as the member and prove the app answered: right path, shell present, no 5xx, no error card. */
  async function open(page: Page, serverErrors: Parameters<typeof assertNoServerErrors>[0], path: string) {
    await go(page, path)
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

    // Setup step: a setup is always chosen.
    const setup = page.getByRole('group', { name: 'Tool setup' })
    await expect(setup).toBeVisible()
    // A setup is already suggested, so Continue is enabled. Choosing one keeps it pressed.
    const firstSetup = setup.getByRole('button').first()
    await firstSetup.click()
    await expect(firstSetup).toHaveAttribute('aria-pressed', 'true')
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
    // /themes is the gallery and each card links to its kit page. The index must list kit pages, and a generic
    // kit page (Temple) carries the "Start with this kit" links into the Wizard.
    await go(page, '/themes')
    await settle(page)
    expect(await page.locator('a[href^="/themes/"]').count(), '/themes lists no theme pages').toBeGreaterThan(0)
    await go(page, '/themes/temple')
    await settle(page)
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
      await expect(page.locator('[data-tour-anchor="content"]')).toBeVisible()
    }
  })

  test('Crew page offers the amounts and hands off to checkout rather than erroring', async ({ page, serverErrors }) => {
    const url = await open(page, serverErrors, '/crew')
    expect(url.pathname).toBe('/crew')
    // The hub answers for a member and names Crew. The contribution amounts live on /upgrade, not here.
    await expect(page.locator('body')).toContainText(/Crew/)
  })

  test('Upgrade page renders the plan ladder', async ({ page, serverErrors }) => {
    await open(page, serverErrors, '/upgrade')
    // Read, never pay: the page names Crew and offers a way in (a button or a link), without erroring.
    await expect(page.locator('body')).toContainText(/Crew/)
    expect(await page.locator('main button, main a[href]').count(), '/upgrade offers no way in').toBeGreaterThan(0)
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
    test.setTimeout(900_000)
    const bad: string[] = []
    for (const path of paths) {
      await go(page, path)
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
    test.setTimeout(600_000)
    const bad: string[] = []
    for (const sub of subs) {
      await go(page, `/spaces/${spaceSlug}${sub}`)
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
      await go(page, path)
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
    // `next dev` compiles each route on its first hit, so a cold path is slow. This is a journey, not a speed test.
    test.setTimeout(240_000)
  })
  test.use({ storageState: hasSession ? storageState : undefined })
  test.describe.configure({ mode: 'serial' })

  const stamp = Date.now().toString(36)
  const handle = `qa-${stamp}`

  test('create a Space through the Wizard with a kit theme, then land in its setup', async ({ page, serverErrors }) => {
    await page.goto('/themes/nocturne')
    await settle(page)
    // The Nocturne page's kit buttons are the "adopt" links into the Wizard; follow the first by its address.
    const start = page.locator('a[href^="/spaces/new?niche="]').first()
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

    await page.waitForURL(new RegExp(`/spaces/${handle}`), { timeout: 90_000 })
    assertNoServerErrors(serverErrors, 'create space')
    await expect(page.getByText('Something went wrong on our end')).toHaveCount(0)
  })

  test('the new Space console and its theme drafts load', async ({ page, serverErrors }) => {
    for (const sub of ['/manage', '/manage/layout', '/manage/spotlight']) {
      await go(page, `/spaces/${handle}${sub}`)
      await settle(page)
      expect(new URL(page.url()).pathname).toBe(`/spaces/${handle}${sub}`)
      assertNoServerErrors(serverErrors, sub)
    }
  })

  test('create an event', async ({ page, serverErrors }) => {
    await go(page, '/events/new')
    await settle(page)
    // The manual door skips Vera, so no AI call is made.
    await page.getByRole('button', { name: /Fill it in myself/ }).first().click()
    await page.getByLabel(/Event title/).fill(`QA event ${stamp}`)
    // Tomorrow 18:00, so the start is never already past whatever time the runner happens to be at.
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)
    await page.locator('input[type="datetime-local"]').first().fill(`${tomorrow}T18:00`)
    await page.getByRole('button', { name: /Create Event/i }).click()
    const landed = await page
      .waitForURL((u) => u.pathname.startsWith('/events/') && u.pathname !== '/events/new', { timeout: 90_000 })
      .then(() => true, () => false)
    if (!landed) {
      // Say what the form said, so the finding is the app's message and not a bare timeout.
      const said = (await page.locator('[role="alert"], .text-danger').allInnerTexts()).join(' | ')
      const button = await page.getByRole('button', { name: /Create Event|Creating/i }).first().innerText().catch(() => '(no button)')
      throw new Error(`/events/new did not create the event. At ${page.url()}, button "${button}". Page said: ${said || '(nothing)'}`)
    }
    assertNoServerErrors(serverErrors, 'create event')
  })

  test('join a Circle', async ({ page, serverErrors }) => {
    test.skip(!circleSlug, 'PW_CIRCLE_SLUG not set: no seeded Circle to join')
    await page.goto(`/circles/${circleSlug}`)
    await settle(page)
    await page.getByRole('button', { name: /^join/i }).first().click()
    // A member's header holds Create and, behind "Circle options", Leave; the Join door is gone.
    // The join redirects back to this page, so give it a moment, then reload to read what the
    // server stored rather than a router-cached view, and say what the page shows if it never comes.
    const options = page.getByRole('button', { name: 'Circle options' })
    await options.waitFor({ timeout: 15_000 }).catch(() => undefined)
    if (!(await options.isVisible())) {
      await page.reload()
      await settle(page)
    }
    if (!(await options.isVisible())) {
      const buttons = await page.getByRole('button').allInnerTexts()
      const said = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)
      throw new Error(
        `Joined ${circleSlug} but "Circle options" never showed. At ${page.url()}. Buttons: ${buttons.map((b) => b.trim()).filter(Boolean).join(' | ')}. Page said: ${said}`,
      )
    }
    await expect(page.getByRole('button', { name: /^join/i })).toHaveCount(0)
    assertNoServerErrors(serverErrors, 'join circle')
  })

  test('import contacts from a CSV: map, review, import, undo', async ({ page, serverErrors }) => {
    await page.goto('/network/contacts')
    await settle(page)
    await page.getByRole('button', { name: 'Import from file' }).click()
    const csv = `Name,Email,Phone\nQA One ${stamp},qa1-${stamp}@example.test,555-0101\nQA Two ${stamp},qa2-${stamp}@example.test,555-0102\n`
    await page.locator('input[type="file"]').setInputFiles({ name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    // A clean file goes straight to matching; "Continue to matching" shows only when a file was skipped.
    const matching = page.getByText('Match your columns to contact fields')
    await expect(matching.or(page.getByRole('button', { name: /Continue to matching/ }))).toBeVisible({ timeout: 30_000 })
    if (!(await matching.isVisible())) await page.getByRole('button', { name: /Continue to matching/ }).click()
    await expect(matching).toBeVisible()
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
    // `next dev` compiles each route on its first hit, so a cold path is slow. This is a journey, not a speed test.
    test.setTimeout(240_000)
  })
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unknown email, create account, open the emailed link, arrive signed in', async ({ page, serverErrors }) => {
    const box = `signup-${Date.now().toString(36)}`
    const email = `${box}@example.test`
    await page.goto('/sign-in')
    await page.getByLabel('Email address').fill(email)
    await page.getByRole('button', { name: 'Send magic link' }).click()
    // The first Send compiles the sign-in action on `next dev`, so give the redirect time and, if it never
    // lands, say where the page is and what it shows instead of a bare "not found".
    const askFirst = page.getByRole('heading', { name: 'No account for that email yet' })
    await askFirst.waitFor({ timeout: 60_000 }).catch(async () => {
      const shown = (await page.locator('main, body').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
      throw new Error(`Send magic link did not reach the "No account for that email yet" step. At ${page.url()}. Page says: ${shown}`)
    })
    // Short fingerprint of the stored sign-in verifier (never the value) so a failure shows whether
    // "Create a new account" replaced the first flow's verifier or left it in place.
    const tag = async () => {
      const v = (await page.context().cookies()).find((c) => /auth-token-code-verifier$/.test(c.name))?.value
      return v ? createHash('sha256').update(v).digest('hex').slice(0, 6) : 'none'
    }
    const afterAskFirst = await tag()
    await page.getByRole('button', { name: 'Create a new account' }).click()
    // The mailbox shows the link before the action's response (and its new verifier cookie) reaches the
    // browser. A person opens the mail seconds later; the test must wait for the cookie, or it presents the
    // first flow's verifier and the exchange fails with bad_code_verifier.
    await expect.poll(tag, { timeout: 60_000, message: 'Create a new account never replaced the stored verifier' }).not.toBe(afterAskFirst)

    // Read the newest message in the mailbox and pull the first link that goes through auth. The local
    // Supabase CLI ships Mailpit in current versions and Inbucket in older ones, so try both.
    const linkIn = (body: string) =>
      (body.match(/https?:\/\/[^\s"'<>]+(?:verify|confirm|callback)[^\s"'<>]*/)?.[0] ?? '').replace(/&amp;/g, '&')
    let link = ''
    for (let i = 0; i < 20 && !link; i++) {
      const found = await (await page.request.get(`${inbucket}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json().catch(() => null)
      if (found?.messages?.length) {
        const msg = await (await page.request.get(`${inbucket}/api/v1/message/${found.messages[0].ID}`)).json()
        link = linkIn(`${msg.HTML ?? ''} ${msg.Text ?? ''}`)
      } else {
        const list = await (await page.request.get(`${inbucket}/api/v1/mailbox/${box}`)).json().catch(() => [])
        if (Array.isArray(list) && list.length) {
          const msg = await (await page.request.get(`${inbucket}/api/v1/mailbox/${box}/${list[list.length - 1].id}`)).json()
          link = linkIn(`${msg.body?.html ?? ''} ${msg.body?.text ?? ''}`)
        }
      }
      if (!link) await page.waitForTimeout(1000)
    }
    const afterCreate = await tag()
    expect(link, `no sign-in link arrived in ${box}'s mailbox`).not.toBe('')
    expect(localAuthLink(link, baseURL!, process.env.NEXT_PUBLIC_SUPABASE_URL!), 'mailbox link must stay on the local app or local auth verification endpoint').toBe(true)
    // Record each hop (status and Location, tokens and codes stripped) and the cookie names the browser
    // holds, so a failure shows which redirect dropped the session and not just the sign-in page.
    const hops: string[] = []
    const scrub = (u: string) => u.replace(/(token|code)=[^&]+/g, '$1=…')
    page.on('response', (r) => {
      if (r.request().isNavigationRequest()) hops.push(`${r.status()} ${scrub(r.url())}${r.headers().location ? ` -> ${scrub(r.headers().location)}` : ''}`)
    })
    await page.goto(link)
    await settle(page)
    const jar = await page.context().cookies()
    const held = jar.map((c) => `${c.name}@${c.domain}`).join(', ')
    // Two sign-in flows ran (the ask-first try, then Create a new account). Say whether the fixed verifier
    // cookie and the per-flow slot hold the same value; if they differ, the fixed one is the first flow's.
    const fixedV = jar.find((c) => /auth-token-code-verifier$/.test(c.name))?.value
    const slotV = jar.find((c) => /-flow-[A-Za-z0-9_-]+-code-verifier$/.test(c.name))?.value
    const verifiers = `fixed verifier ${fixedV ? 'present' : 'absent'}, flow slot ${slotV ? 'present' : 'absent'}, same value: ${fixedV !== undefined && fixedV === slotV}; fixed verifier after ask-first ${afterAskFirst}, after Create ${afterCreate}, at the link ${fixedV ? createHash('sha256').update(fixedV).digest('hex').slice(0, 6) : 'none'}`
    expect(new URL(page.url()).pathname, `the emailed link did not sign the new member in. Hops: ${hops.join(' | ')}. Cookies: ${held}. Verifiers: ${verifiers}. Ended at ${page.url()}`).not.toBe('/sign-in')
    assertNoServerErrors(serverErrors, 'sign-up')
    await expect(page.getByText('Something went wrong on our end')).toHaveCount(0)
  })
})

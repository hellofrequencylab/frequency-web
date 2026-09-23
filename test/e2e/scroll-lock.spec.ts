// Opening an overlay must not resize the page underneath it.
//
// ── THE DEFECT THIS MEASURES ─────────────────────────────────────────────────────────────────
//
// The DOCUMENT scrolls in the authed shell (components/layout/app-shell.tsx: "The document itself
// scrolls (not an inner pane) ... The header + side rails stay put via `sticky`"). Six overlays
// lock that scroll by setting `document.body.style.overflow = 'hidden'` — components/ui/dialog.tsx,
// the search overlay, Mindless, the gallery lightbox, the page-editor bottom sheet and the shell's
// own mobile drawer — and none of them compensates for the scrollbar. With no gutter reserved, the
// lock DELETES the root scrollbar, so the viewport widens by its width the moment a dialog opens
// and narrows again when it closes. The sticky full-width header and the `shrink-0` right-rail
// column ride that change, and because the rail column carries `transition-[width] duration-200`
// it ANIMATES the shift rather than jumping it. That is the owner's report: a blink "with the pop
// up and the top + right rail".
//
// The fix is one declaration — `scrollbar-gutter: stable` on `html` in app/globals.css — and this
// is the instrument that can see it. It is a browser test because it has to be: jsdom has no
// scrollbar, no layout and no `scrollbar-gutter` support, so a unit test can assert the CSS is
// PRESENT (components/layout/chrome-reserves.test.tsx does exactly that) and can never assert it
// WORKS. `document.documentElement.clientWidth` is the viewport width excluding the scrollbar, so
// it is the number that used to move and the number that must not.
//
// 🔴 NOT A PIXEL COMPARISON, deliberately. A visual baseline would catch this only if the shutter
// happened to fall while the 200ms rail transition was mid-flight, which is a coin toss, and it
// would report it as "the rail looks different" rather than "the viewport changed width". This
// measures the box, the way the @overflow suite does (ADR-1035), so it fails for the right reason.
import { existsSync } from 'node:fs'
import { test, expect } from './fixtures'

const baseURL = process.env.PW_BASE_URL
const spaceSlug = process.env.PW_SPACE_SLUG
const storageState = process.env.PW_STORAGE_STATE
const hasSession = !!storageState && existsSync(storageState)
const calendarPath = spaceSlug ? `/spaces/${spaceSlug}/calendar` : '/spaces/missing/calendar'

test.describe('a scroll lock never resizes the document', { tag: ['@smoke', '@shell'] }, () => {
  test.use({ storageState })
  test.skip(!baseURL, 'PW_BASE_URL is required to measure a real viewport.')
  test.skip(!spaceSlug, 'PW_SPACE_SLUG must name a Space the e2e member can manage.')
  test.skip(!hasSession, 'PW_STORAGE_STATE must point to a saved member session.')

  test('opening and closing a dialog leaves the viewport width unchanged', async ({ page }, testInfo) => {
    // Desktop only, and that is the measurement rather than a convenience: a mobile browser draws
    // an overlay scrollbar that occupies no layout width, so there is nothing for the lock to
    // remove and the case cannot reproduce there. The defect lives where the scrollbar has a box.
    test.skip(testInfo.project.name !== 'desktop', 'A classic scrollbar with layout width is a desktop condition.')

    const response = await page.goto(calendarPath)
    expect(response, `navigation to ${calendarPath} returned a response`).toBeTruthy()
    expect(response!.ok(), `expected 2xx for ${calendarPath}, got ${response!.status()}`).toBe(true)

    await expect(page.locator('[data-calendar-workspace]')).toBeVisible()
    // The same role guard the calendar suite uses, and for the same reason: a viewer the Space does
    // not let manage gets the guest view and no operator controls, which is an ACCOUNT fact and
    // must skip rather than turn into somebody's red pull request.
    if ((await page.getByRole('button', { name: 'Calendar', exact: true }).count()) === 0) {
      test.skip(true, `The saved e2e member cannot manage ${calendarPath}; point PW_SPACE_SLUG at a Space this account can manage.`)
    }
    await page.getByRole('button', { name: 'Calendar', exact: true }).click()
    await expect(page.locator('[data-calendar-admin-grid]')).toBeVisible()

    // The page must actually be scrollable, or there is no scrollbar to delete and the assertion
    // below would pass on a page that proves nothing. This is the control.
    const scrollable = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight,
    )
    expect(scrollable, 'the calendar page overflows the viewport, so the root scrollbar is present').toBe(true)

    const widthOf = () =>
      page.evaluate(() => ({
        doc: document.documentElement.clientWidth,
        header: Math.round(document.querySelector('header')?.getBoundingClientRect().width ?? -1),
        rail: Math.round(document.querySelector('[data-rail-column]')?.getBoundingClientRect().right ?? -1),
      }))

    const before = await widthOf()

    // A real dialog through a real control — components/ui/dialog.tsx is the lock site, and this is
    // the one this member can reach without writing anything.
    await page.getByRole('button', { name: 'Pencil it in' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Past the rail column's `duration-200` width transition, so a shift that is merely ANIMATED
    // rather than instant is still caught. `waitForTimeout` is the right tool here: the thing being
    // waited for is a CSS duration, not a state change anything announces.
    await page.waitForTimeout(400)

    const during = await widthOf()
    expect(during.doc, 'the document width is unchanged while the dialog is open').toBe(before.doc)
    expect(during.header, 'the sticky header has not moved while the dialog is open').toBe(before.header)
    expect(during.rail, 'the right-rail column has not moved while the dialog is open').toBe(before.rail)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await page.waitForTimeout(400)

    const after = await widthOf()
    expect(after.doc, 'the document width is unchanged after the dialog closes').toBe(before.doc)
    expect(after.header, 'the sticky header is back where it started').toBe(before.header)
    expect(after.rail, 'the right-rail column is back where it started').toBe(before.rail)
  })
})

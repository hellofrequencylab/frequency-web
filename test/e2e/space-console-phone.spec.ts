import { existsSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { settle } from './surfaces'

// THE SPACE CONSOLE IN ONE HAND (LIVE-704, ADR-1639). The /manage console measured on a phone, at the
// narrowest width we support, the width the visual suite photographs, and a large phone. It MEASURES
// boxes (like overflow.spec.ts, ADR-1035) rather than comparing pixels, so it needs no baseline.
//
// What "usable one-handed" means here, as four readings:
//   1. nothing runs off the side: the document is no wider than the viewport;
//   2. every console control this row owns is a 44px target: the section pills, the tool rows and the
//      thumb bar's doors (WCAG 2.5.5; --tap-min is 44 under a coarse pointer, app/globals.css);
//   3. the daily doors sit in the reachable band, the bottom 35dvh the stacking contract names
//      (components/sidebar/game-stats-dock.tsx), and above the tab bar rather than under it;
//   4. no hover-only affordance: each tool row's description is on screen, not in a title tooltip.
//
// Runs on the `mobile` project only: its iPhone profile is what makes `(pointer: coarse)` match, and a
// coarse pointer is the condition every one of these readings is about.

const baseURL = process.env.PW_BASE_URL
const spaceSlug = process.env.PW_SPACE_SLUG
const storageState = process.env.PW_STORAGE_STATE
const hasSession = !!storageState && existsSync(storageState)

const WIDTHS = [320, 390, 430] as const
const TAP_MIN = 44
/** The reachable band: bottom-0 to 35dvh (game-stats-dock.tsx, THUMB ZONE). */
const REACH_BAND = 0.35

type Box = { what: string; w: number; h: number; top: number; bottom: number }

async function boxes(page: Page, selector: string, what: string): Promise<Box[]> {
  return page.locator(selector).evaluateAll(
    (els, label) =>
      els
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => {
          const r = el.getBoundingClientRect()
          return {
            what: `${label} "${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`,
            w: Math.round(r.width),
            h: Math.round(r.height),
            top: r.top,
            bottom: r.bottom,
          }
        }),
    what,
  )
}

async function openConsole(page: Page, section: string): Promise<boolean> {
  await page.goto(`/spaces/${spaceSlug}/manage?section=${section}`)
  await settle(page)
  // The console notFound()s for anyone who cannot manage the Space; that is a harness gap, not a defect.
  return (await page.locator('nav[aria-label="Manage areas"]').count()) > 0
}

test.describe('space console on a phone', { tag: '@overflow' }, () => {
  test.use({ storageState })
  test.skip(!baseURL, 'PW_BASE_URL is required.')
  test.skip(!spaceSlug, 'PW_SPACE_SLUG must name a Space the e2e member can manage.')
  test.skip(!hasSession, 'PW_STORAGE_STATE must point to a saved member session.')

  for (const width of WIDTHS) {
    test(`/manage is one-handed at ${width}px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'A coarse pointer is the premise; the mobile project emulates one.')
      await page.setViewportSize({ width, height: 844 })

      // Profile and Settings always lists tool rows for a manager (Team, Plan and billing), so it is the
      // tab that exercises every reading at once; Home is metrics and lists none.
      if (!(await openConsole(page, 'settings'))) test.skip(true, 'The e2e member cannot manage PW_SPACE_SLUG.')

      // 1. No horizontal scroll.
      const { scrollW, innerW } = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }))
      expect(scrollW, `the console is ${scrollW - innerW}px wider than a ${width}px phone`).toBeLessThanOrEqual(innerW)

      // 2. Every console control is a 44px target.
      const controls = [
        ...(await boxes(page, 'nav[aria-label="Manage areas"] a', 'section pill')),
        ...(await boxes(page, '[data-console-row]', 'tool row')),
        ...(await boxes(page, '[data-console-thumb-bar] a', 'thumb door')),
      ]
      expect(controls.length, 'no console controls rendered').toBeGreaterThan(0)
      const small = controls.filter((b) => b.w < TAP_MIN || b.h < TAP_MIN)
      expect(small, `under ${TAP_MIN}px:\n${small.map((b) => `  ${b.what} ${b.w}x${b.h}`).join('\n')}`).toEqual([])

      // 3. The daily doors are in the reachable band, above the tab bar.
      const doors = await boxes(page, '[data-console-thumb-bar] a', 'thumb door')
      expect(doors.length, 'the thumb bar rendered no doors').toBeGreaterThan(0)
      const vh = page.viewportSize()!.height
      // The lane's top, read from the token rather than a literal: the tab bar PLUS its tallest riser
      // (the Zap catch or the chat tab's hit band). A door below it would sit under one of them.
      const laneTop = await page.evaluate(() => {
        const probe = document.createElement('div')
        probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:var(--tab-bar-clearance);pointer-events:none'
        document.body.appendChild(probe)
        const top = probe.getBoundingClientRect().top
        probe.remove()
        return top
      })
      for (const d of doors) {
        expect(d.top, `${d.what} is above the reachable band`).toBeGreaterThanOrEqual(vh * (1 - REACH_BAND))
        expect(d.bottom, `${d.what} sits under the tab bar's lane`).toBeLessThanOrEqual(laneTop + 1)
      }

      // 4. No hover-only affordance: every visible tool row shows its description.
      const rows = await page.locator('[data-console-row]').count()
      const shown = await page.locator('[data-console-row-desc]:visible').count()
      expect(shown, 'a tool row keeps its description in a hover tooltip').toBe(rows)
    })
  }
})

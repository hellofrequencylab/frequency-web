// Automated accessibility gate (UX maturity plan, Lift 3b): axe-core over the same
// surfaces the visual suite covers, in the same four render states.
//
// ── What fails the build ──────────────────────────────────────────────────────
// SERIOUS and CRITICAL violations only. `moderate` and `minor` are recorded as test
// ANNOTATIONS (visible in the list reporter and the HTML report) so the red signal stays
// worth acting on and the long tail is still counted. The plan's metric is "0 serious+",
// which is exactly this line.
//
// Failure messages name the rule, its impact, the help URL and the offending selector, so
// a developer can fix the violation from the CI log alone — no report artifact download,
// which matters because artifact downloads are unreachable from agent sandboxes.
//
// ── Why it runs in the DEFAULT smoke run ──────────────────────────────────────
// `pnpm test:e2e` is `playwright test --grep-invert @visual`, i.e. everything that is not
// the snapshot suite. @a11y deliberately stays IN that default run and the invert pattern
// is left alone. The reason @visual is excluded is that it has a committed-baseline
// dependency: without baselines it fails with "snapshot doesn't exist", which is noise,
// not signal. axe has no such dependency — it needs exactly what the smoke suite already
// needs (a reachable PW_BASE_URL), its failures are always real, and an a11y regression
// that only surfaces in an opt-in suite is an a11y regression nobody sees. Run it alone
// with `pnpm exec playwright test --grep @a11y`.
//
// ── Why the state matrix is shaped the way it is ──────────────────────────────
// A full axe pass is state-INSENSITIVE for almost every rule (roles, names, order,
// labels): re-running the whole rule set in four states would quadruple the wall time to
// re-report the same violations four times. The one family that genuinely differs per
// state is CONTRAST, because both the mode axis and the skin axis re-map colour tokens.
// So: full pass in the canonical state on both viewports; `color-contrast` only in the
// other three states, on desktop only (colour tokens do not vary by viewport, and the
// full desktop+mobile pass already covers the canonical state at both widths). That is
// Lift 3's "contrast pairs all green ×4 states" made permanent, at a quarter of the cost.
import { AxeBuilder } from '@axe-core/playwright'
import { test, type TestInfo, type Page } from '@playwright/test'
import type { Result } from 'axe-core'
import {
  DEFAULT_STATE,
  RENDER_STATES,
  SHELL_RENDER_STATES,
  STORAGE_STATE,
  appSurfaces,
  applyRenderState,
  assertNotProtectionWall,
  currentPathname,
  publicSurfaces,
  settle,
  type RenderState,
  type Surface,
} from './surfaces'

const baseURL = process.env.PW_BASE_URL

/** The standard we hold ourselves to. Deliberately NOT `best-practice`: several of those
 *  rules report at `serious` impact while encoding a preference rather than a barrier, and
 *  a gate that fails on preferences gets muted. WCAG 2.0/2.1/2.2 level A + AA only. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Impacts that fail the run. Everything below this is annotated, not thrown. */
const BLOCKING_IMPACTS = new Set(['serious', 'critical'])

function describeNode(node: Result['nodes'][number]): string {
  const selector = node.target.map((part) => (Array.isArray(part) ? part.join(' >>> ') : part)).join(', ')
  // failureSummary is axe's own "Fix any of the following" prose — the most actionable
  // single string it produces. Collapse it onto indented lines so CI logs stay readable.
  const summary = (node.failureSummary ?? '').trim().split('\n').map((line) => `        ${line.trim()}`)
  return [`      · ${selector}`, ...summary].join('\n')
}

function describeViolation(violation: Result, index: number): string {
  const nodes = violation.nodes.slice(0, 5).map(describeNode)
  const overflow =
    violation.nodes.length > nodes.length
      ? [`      … and ${violation.nodes.length - nodes.length} more element(s)`]
      : []
  return [
    `  ${index + 1}. [${violation.impact ?? 'unknown'}] ${violation.id} — ${violation.help}`,
    `     ${violation.helpUrl}`,
    `     ${violation.nodes.length} element(s):`,
    ...nodes,
    ...overflow,
  ].join('\n')
}

/** Throw on serious+critical, annotate the rest. */
function report(
  violations: Result[],
  context: string,
  testInfo: TestInfo,
): void {
  const blocking = violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''))
  const advisory = violations.filter((v) => !BLOCKING_IMPACTS.has(v.impact ?? ''))

  for (const violation of advisory) {
    const first = violation.nodes[0]?.target?.[0]
    testInfo.annotations.push({
      type: `a11y-${violation.impact ?? 'unknown'}`,
      description: `${violation.id} × ${violation.nodes.length} — ${String(first ?? 'n/a')} — ${violation.helpUrl}`,
    })
  }

  if (blocking.length === 0) return

  const total = blocking.reduce((sum, v) => sum + v.nodes.length, 0)
  throw new Error(
    [
      `${blocking.length} serious+ accessibility violation(s) (${total} element(s)) on ${context}:`,
      '',
      ...blocking.map(describeViolation),
      '',
      advisory.length > 0
        ? `(plus ${advisory.length} moderate/minor violation(s) recorded as annotations — not failing this run.)`
        : '(no moderate/minor violations.)',
    ].join('\n'),
  )
}

/** Navigate + settle. Returns false when the surface is not actually available. */
async function open(page: Page, surface: Surface, state: RenderState): Promise<boolean> {
  await applyRenderState(page, state)
  await page.goto(surface.path, { waitUntil: 'load' })
  await assertNotProtectionWall(page)

  const landed = currentPathname(page)
  if (surface.audience === 'anon' && landed.startsWith('/sign-in') && surface.path !== '/sign-in') {
    test.skip(true, `${surface.path} redirected to ${landed} for an anonymous visitor — nothing to audit.`)
    return false
  }

  await settle(page)
  return true
}

async function auditFull(page: Page, surface: Surface, state: RenderState, testInfo: TestInfo): Promise<void> {
  if (!(await open(page, surface, state))) return
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  report(results.violations, `${surface.path} [${state.id}, ${testInfo.project.name}]`, testInfo)
}

async function auditContrast(page: Page, surface: Surface, state: RenderState, testInfo: TestInfo): Promise<void> {
  if (!(await open(page, surface, state))) return
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  report(results.violations, `${surface.path} [${state.id}, contrast only, ${testInfo.project.name}]`, testInfo)
}

/* ── Full WCAG A/AA pass, canonical state, both viewports ───────────────────── */

test.describe('a11y', { tag: '@a11y' }, () => {
  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the a11y suite.',
  )

  for (const surface of publicSurfaces()) {
    test(`${surface.path} has no serious+ violations (${DEFAULT_STATE.id})`, async ({ page }, testInfo) => {
      await auditFull(page, surface, DEFAULT_STATE, testInfo)
    })
  }
})

/* ── Contrast pass in the other three render states ─────────────────────────── */

test.describe('a11y · contrast', { tag: '@a11y' }, () => {
  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the a11y suite.',
  )

  for (const state of RENDER_STATES.filter((s) => s.id !== DEFAULT_STATE.id)) {
    test.describe(state.id, () => {
      for (const surface of publicSurfaces()) {
        test(`${surface.path} contrast holds`, async ({ page }, testInfo) => {
          // Colour tokens are viewport-independent; running this on both projects would
          // report every violation twice. Desktop carries the state sweep.
          test.skip(
            testInfo.project.name !== 'desktop',
            'Contrast is viewport-independent — the desktop project carries the render-state sweep.',
          )
          await auditContrast(page, surface, state, testInfo)
        })
      }
    })
  }
})

/* ── The member shell ───────────────────────────────────────────────────────── */

test.describe('a11y · member shell', { tag: '@a11y' }, () => {
  test.use({ storageState: STORAGE_STATE })

  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the a11y suite.',
  )
  test.skip(
    !STORAGE_STATE,
    'PW_STORAGE_STATE is not set (or the file is missing). Point it at a saved storage state for the beta member account to audit the app shell.',
  )

  for (const surface of appSurfaces()) {
    test(`${surface.path} has no serious+ violations (${DEFAULT_STATE.id})`, async ({ page }, testInfo) => {
      await auditFull(page, surface, DEFAULT_STATE, testInfo)
    })
  }

  // The shell owns only the mode axis (the skin is server-rendered on the shell root), so
  // the extra contrast state here is dark mode.
  for (const state of SHELL_RENDER_STATES.filter((s) => s.id !== DEFAULT_STATE.id)) {
    test.describe(state.id, () => {
      for (const surface of appSurfaces()) {
        test(`${surface.path} contrast holds`, async ({ page }, testInfo) => {
          test.skip(
            testInfo.project.name !== 'desktop',
            'Contrast is viewport-independent — the desktop project carries the render-state sweep.',
          )
          await auditContrast(page, surface, state, testInfo)
        })
      }
    })
  }
})

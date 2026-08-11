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
// ── Two instruments, and the two different things they hold ───────────────────
// `test/e2e/a11y-baselines.json` is a per-context COUNT: how much serious+ debt a surface is
// allowed to carry today. `test/e2e/a11y-waivers.ts` is a named list of DECISIONS: specific
// painted colour pairs somebody with the authority has already accepted, each with its citation.
// They are not interchangeable. A count cannot say "this one known thing"; a waiver cannot say
// "and N other things I have not looked at". Waived elements are subtracted before the count is
// compared, so the ratchet only ever measures what nobody has decided about. ADR-985.
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
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AxeBuilder } from '@axe-core/playwright'
import { test, type TestInfo, type Page } from '@playwright/test'
import type { Result } from 'axe-core'
import { describeWaived, partitionWaived } from './a11y-waivers'
import {
  DEFAULT_STATE,
  RENDER_STATES,
  SHELL_RENDER_STATES,
  STORAGE_STATE,
  appSurfaces,
  applyRenderState,
  assertMemberSession,
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

// Every failing element gets printed, up to a cap that only exists so a catastrophically broken
// page cannot bury the log. The cap used to be 5, and that was too tight to work with: when the
// member shell first reported 12 elements on /feed, the log showed 5 and "… and 6 more", so the
// only way to tell an accepted palette pair from a live defect was to download the report
// artifact — which is unreachable from an agent sandbox, the exact constraint the file header
// says these messages exist to route around. A number you cannot decompose is not a finding.
const MAX_NODES_PRINTED = 40

function describeViolation(violation: Result, index: number): string {
  const nodes = violation.nodes.slice(0, MAX_NODES_PRINTED).map(describeNode)
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

// The frozen per-surface debt. Read once; a missing entry means "must be clean" ($defaultMax 0),
// so a NEW surface joins the suite at zero tolerance rather than inheriting somebody else's debt.
interface A11yBaselines {
  $defaultMax?: number
  surfaces?: Record<string, number>
}

let baselinesCache: A11yBaselines | null = null

function baselines(): A11yBaselines {
  if (baselinesCache) return baselinesCache
  try {
    // Resolved from the project root (Playwright's cwd), not import.meta — this spec is
    // transpiled to CJS, where import.meta is unavailable.
    const raw = readFileSync(join(process.cwd(), 'test', 'e2e', 'a11y-baselines.json'), 'utf8')
    baselinesCache = JSON.parse(raw) as A11yBaselines
  } catch {
    baselinesCache = {}
  }
  return baselinesCache
}

/** How many serious+ ELEMENTS this (surface, state, project) context is allowed to carry today. */
function baselineFor(context: string): number {
  const b = baselines()
  return b.surfaces?.[context] ?? b.$defaultMax ?? 0
}

function report(
  violations: Result[],
  context: string,
  testInfo: TestInfo,
): void {
  const serious = violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ''))
  const advisory = violations.filter((v) => !BLOCKING_IMPACTS.has(v.impact ?? ''))

  // WAIVERS come off BEFORE the count, and they are the only thing that does.
  //
  // A waiver is a decision that was already made and recorded elsewhere (the owner's 2026-08-06
  // palette call, frozen in scripts/check-contrast.mjs). The ratchet below is a measure of DEBT,
  // and a decision is not debt — leaving it in the count would have meant raising nine marketing
  // baselines to absorb it, which is what ADR-980 forbids: a raised count also permits any
  // unrelated serious violation up to that number, forever, with nothing recording what was
  // meant. See test/e2e/a11y-waivers.ts for why the match is on the painted colour pair rather
  // than on a selector, and for the guarantee that this mechanism cannot waive anything but a
  // colour (the tap-target failures on the member shell were fixed, not waived).
  const { kept: blocking, keptCount: total, waived, waivedCount } = partitionWaived(serious)

  for (const group of waived) {
    testInfo.annotations.push({ type: 'a11y-waived', description: `${context} — ${describeWaived(group)}` })
  }

  for (const violation of advisory) {
    const first = violation.nodes[0]?.target?.[0]
    testInfo.annotations.push({
      type: `a11y-${violation.impact ?? 'unknown'}`,
      description: `${violation.id} × ${violation.nodes.length} — ${String(first ?? 'n/a')} — ${violation.helpUrl}`,
    })
  }

  // CAPTURE MODE. The baselines have to come from a real run against a real deployment —
  // a hand-typed number is a guess, and a guessed ratchet is a lie with a version history.
  // Each worker appends one JSON line; scripts/a11y-baselines.mjs merges them. Append is
  // used rather than a shared write because workers run in parallel.
  //
  // `total` here is the POST-waiver count, deliberately: a capture should freeze what the ratchet
  // will compare, so a re-freeze never silently re-imports a decision as debt.
  if (process.env.PW_A11Y_UPDATE) {
    appendFileSync(
      join(process.cwd(), 'test', 'e2e', '.a11y-observed.jsonl'),
      JSON.stringify({ context, total }) + '\n',
    )
    return
  }

  const allowed = baselineFor(context)

  // A RATCHET, not a wall. The first honest run against real pages found violations older
  // than this suite (the brand amber used as text, ~1,842 sites), which is a judgment-heavy
  // sweep of its own. Blocking on day one would either stall unrelated work or get the suite
  // muted, and a muted gate is worse than no gate. So the frozen count is the bar: a RISE
  // fails loudly, a fall is reported and should be re-frozen. Same contract as the adoption
  // baselines. See test/e2e/a11y-baselines.json.
  if (total <= allowed) {
    if (blocking.length > 0) {
      testInfo.annotations.push({
        type: 'a11y-debt',
        description:
          `${total}/${allowed} known serious+ element(s) on ${context} — ` +
          blocking.map((v) => `${v.id}×${v.nodes.length}`).join(', '),
      })
    }
    // A fall is news: say so, so the baseline gets tightened instead of drifting upward.
    //
    // This deliberately does NOT require `blocking.length > 0`. The waivers land most of the
    // marketing contexts on exactly zero remaining elements against a non-zero baseline, and a
    // fall all the way to clean is the most re-freezable news there is — the old shape would
    // have printed nothing precisely then.
    if (total < allowed) {
      testInfo.annotations.push({
        type: 'a11y-improved',
        description: `${context} is now ${total} (baseline ${allowed}) — lower the baseline in test/e2e/a11y-baselines.json.`,
      })
    }
    return
  }

  throw new Error(
    [
      `Accessibility REGRESSION on ${context}: ${total} serious+ element(s), baseline allows ${allowed}.`,
      waivedCount > 0
        ? `(${waivedCount} further element(s) matched a named waiver and are NOT counted above — see the a11y-waived annotations.)`
        : '',
      '',
      ...blocking.map(describeViolation),
      '',
      advisory.length > 0
        ? `(plus ${advisory.length} moderate/minor violation(s) recorded as annotations — not failing this run.)`
        : '(no moderate/minor violations.)',
      '',
      'Three remedies, in the order you should reach for them:',
      '  1. FIX the element. Always first. Everything above is a real barrier until proven otherwise.',
      '  2. WAIVE it, if and only if it is a decision somebody with the authority already made and',
      '     recorded. Add a named entry to test/e2e/a11y-waivers.ts with the ADR/decision reference',
      '     and the reason. A waiver names WHAT is accepted; it cannot hide anything else.',
      '  3. Raise the entry in test/e2e/a11y-baselines.json — LAST, and only for a surface being',
      '     measured for the first time. Raising it to swallow a known thing also permits every',
      '     unknown thing up to that number (ADR-980). Baselines are debt, and debt gets a name.',
    ].join('\n'),
  )
}

/** Navigate + settle. Returns false when the surface is not actually available. */
async function open(page: Page, surface: Surface, state: RenderState): Promise<boolean> {
  await applyRenderState(page, state)
  await page.goto(surface.path, { waitUntil: 'load' })
  await assertNotProtectionWall(page)
  // Auditing the sign-in page under `/feed`'s name would report someone else's contrast as
  // the shell's, and auditing the marketing home page under the room's name would do the
  // same (it is exactly what the app-room baselines caught). A member surface that lands
  // anywhere but its own path is a dead credential or a mis-pointed surface — say so.
  await assertMemberSession(page, surface)

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

// @shell: counted by test/e2e/shell-reporter.ts, which turns "these skipped" into a job
// summary naming each unaudited surface. A new member-shell describe needs the tag too.
test.describe('a11y · member shell', { tag: ['@a11y', '@shell'] }, () => {
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

// THE SKIP THAT SAYS SOMETHING — a Playwright reporter that reports on what was NOT tested.
//
// Playwright's summary line ends `12 skipped · 64 passed`, and those two numbers sit at the
// same weight. On PR #2048 the 12 were the whole member shell and the 64 were marketing
// pages, and the board was green (see shell-coverage.ts's header for the full account). This
// reporter turns that arithmetic back into a sentence, in `$GITHUB_STEP_SUMMARY` where the
// result is actually read, naming every surface that went unphotographed.
//
// ── WHY A REPORTER, RATHER THAN A CI STEP THAT CHECKS THE ENV ──────────────────────────
// A step that greps for `PW_STORAGE_STATE` would only know what CI *intended*. This runs
// inside the same process as the tests, so it reports what the run actually DID: it counts
// the `@shell`-tagged tests, sees which ones executed, and can tell "no credential" apart
// from "credential present, tests still skipped" and from "credential present, ran, and the
// baselines have never been captured". Those three need three different answers.
//
// ── WHAT IT DOES *NOT* DO ──────────────────────────────────────────────────────────────
// It does not fail the build when the credential is absent. A missing owner-held secret is
// not this PR's fault, and a red X that means "nobody has created a secret yet" trains
// people to ignore the check — the exact reasoning in e2e.yml's own header. It downgrades
// the RESULT to PARTIAL in words and annotations, and leaves the exit code alone.
//
// The one exception is deliberate and opt-in: set `PW_REQUIRE_SHELL=1` (a repo variable)
// AFTER the credential and the shell baselines exist, and a partial run becomes a failure.
// That is the ratchet: before the credential, silence is loud; after it, silence is red, so
// a credential that quietly expires cannot re-open the blind spot the same way.
import { appendFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import {
  renderShellCoverage,
  summarizeShellCoverage,
  type ShellObservation,
} from './shell-coverage'
import { STORAGE_STATE, appSurfaces } from './surfaces'

/** The tag that marks a test as covering the member shell. Applied to the `member shell`
 *  describes in visual.spec.ts and a11y.spec.ts. */
const SHELL_TAG = '@shell'

/** Playwright's message when a baseline PNG has never been captured. */
const MISSING_SNAPSHOT = /snapshot doesn't exist|snapshot does not exist|is missing in snapshots/i

export default class ShellCoverageReporter implements Reporter {
  /** Keyed by test id so retries collapse to their final attempt. */
  private readonly seen = new Map<string, ShellObservation>()
  private readonly specs = new Set<string>()

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!test.tags.includes(SHELL_TAG)) return

    const surfaces = appSurfaces().map((s) => s.path)
    // Longest first: `/spaces/x/manage` must not be attributed to `/spaces`.
    const surface =
      [...surfaces].sort((a, b) => b.length - a.length).find((path) => test.title.startsWith(path)) ??
      ''

    const errors = [result.error?.message ?? '', ...result.errors.map((e) => e.message ?? '')].join('\n')

    this.specs.add(basename(test.location.file))
    this.seen.set(test.id, {
      title: test.titlePath().filter(Boolean).join(' › '),
      surface,
      status: result.status === 'skipped' ? 'skipped' : 'ran',
      missingBaseline: MISSING_SNAPSHOT.test(errors),
    })
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | void> {
    const coverage = summarizeShellCoverage({
      baseURL: process.env.PW_BASE_URL,
      storageStateVar: process.env.PW_STORAGE_STATE,
      storageState: STORAGE_STATE,
      surfaces: appSurfaces().map((s) => s.path),
      observations: [...this.seen.values()],
      specs: [...this.specs].sort(),
      spaceSlug: process.env.PW_SPACE_SLUG,
    })

    const report = renderShellCoverage(coverage)
    if (coverage.verdict === 'idle') return

    // Terminal first: a local run gets the same sentence CI does.
    if (report.console) process.stdout.write(`${report.console}\n`)
    for (const annotation of report.annotations) process.stdout.write(`${annotation}\n`)

    const summaryPath = process.env.GITHUB_STEP_SUMMARY
    if (summaryPath && report.markdown) {
      try {
        appendFileSync(summaryPath, `\n${report.markdown}\n`)
      } catch (error) {
        // Never let the messenger take the run down.
        process.stdout.write(`::warning title=Shell coverage::could not write the job summary (${String(error)})\n`)
      }
    }

    // The opt-in ratchet. Only ever TIGHTENS: without the variable this returns nothing and
    // the run's own status stands.
    const required = (process.env.PW_REQUIRE_SHELL ?? '').trim()
    if (coverage.verdict === 'partial' && required && required !== '0' && required !== 'false') {
      process.stdout.write(
        `::error title=App shell not photographed::PW_REQUIRE_SHELL is set, so a run that photographs 0 app surfaces fails. ${coverage.reason}\n`,
      )
      return { status: 'failed' }
    }

    return { status: result.status }
  }
}

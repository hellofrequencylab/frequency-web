// WHAT THE GREEN BOARD LEAVES OUT — the member-shell coverage ledger.
//
// WHY THIS FILE EXISTS. On 2026-08-05, PR #2048 removed the rail fill from all four rail
// branches, moved the fold control to an edge handle, and resized both dock heads. Every
// one of those is visible on every page of the app shell. `pr-compare` reported:
//
//     12 skipped
//     64 passed (3.5m)
//
// Green. The 12 skips were the ENTIRE member shell (`/feed`, the room, `/settings`, the
// Space console) — the only captured surfaces that HAVE a rail — skipped because
// `PW_STORAGE_STATE` was unset. The 64 passes were anonymous marketing pages, which render
// outside the `(main)` shell and have no rail, dock or fold control to photograph.
//
// The gate was not broken. It was pointed somewhere else, and a skip is not a failure, so a
// green board and a green board with the whole product missing from it are indistinguishable.
// Playwright's own summary line is the problem: `12 skipped` is a NUMBER, in a run that also
// says `64 passed`, and no reader converts that into "the app was never looked at".
//
// So this module answers one question in words: WAS THE APP SHELL PHOTOGRAPHED, AND IF NOT,
// WHICH SURFACES WENT UNSEEN. `shell-reporter.ts` feeds it what actually happened in a run
// and prints the verdict into `$GITHUB_STEP_SUMMARY`; this half is pure so it can be unit
// tested — including the negative control that a covered run does NOT claim to be partial
// (ADR-949: a guard is not trusted until it has been observed failing).
//
// Nothing here imports @playwright/test at run time (types only), so vitest can load it.

/** Did a shell test actually execute, or did the runner walk past it? */
export type ShellStatus = 'ran' | 'skipped'

/** One shell test, as observed by the reporter. */
export interface ShellObservation {
  /** Full title path, for the "which one" line in the report. */
  title: string
  /** The member surface this test covers (`/feed`, `/channels`, …), or '' if unmatched. */
  surface: string
  status: ShellStatus
  /** True when the test failed with Playwright's "snapshot doesn't exist" — a baseline that
   *  has never been captured, which is a different problem from a pixel regression. */
  missingBaseline?: boolean
  /** True when the test SKIPPED because the session bounced off the /admin role floor: the skip
   *  annotation carried `ROLE_FLOOR_MARKER` (surfaces.ts). The reporter reads it off the test's
   *  own annotations, so it is a fact about the run rather than an inference from the env. */
  roleFloor?: boolean
}

export interface ShellCoverageInput {
  /** `PW_BASE_URL`. Absent means the whole suite is inert, not just the shell. */
  baseURL?: string
  /** The RAW `PW_STORAGE_STATE` value, so "unset" and "set but missing on disk" differ. */
  storageStateVar?: string
  /** The RESOLVED storage-state path (the file exists), or undefined. */
  storageState?: string
  /** Every member surface this run intended to cover, from `appSurfaces()`. */
  surfaces: readonly string[]
  /** What the run did with the `@shell` tests. */
  observations: readonly ShellObservation[]
  /** Which suites contributed, e.g. `['visual.spec.ts']`. Used in the heading only. */
  specs?: readonly string[]
  /** `PW_SPACE_SLUG`. Without it the Space console is not in the matrix AT ALL — a second,
   *  quieter absence than a skip, because there is no test row to notice missing. */
  spaceSlug?: string
  /** The OPERATOR surface paths in this run's matrix, from `operatorSurfaces()`.
   *
   *  🔴 Why the reason needs this. An operator surface behind the /admin role floor skips for a
   *  cause this repo has already NAMED and FILED — `operatorDenialReason()` in surfaces.ts, backlog
   *  HYG-027: the account behind PW_MEMBER_EMAIL is a member, not staff, so requireAdminFloor()
   *  bounces it to /feed. Without this list, `reasonFor()` could only see "a session existed and
   *  things still skipped" and told the reader "That is not the known blind spot; read the run
   *  log" — pointing away from the one row that explains it. Observed on the 2026-08-31 run that
   *  named all seven operator routes under exactly that sentence. */
  operatorSurfaces?: readonly string[]
}

/**
 * `covered`  — at least one shell test ran. The app was looked at.
 * `partial`  — shell tests exist and EVERY ONE of them skipped. This is #2048's silence.
 * `idle`     — this run collected no shell tests at all (e.g. `--grep @smoke`). Say nothing.
 */
export type ShellVerdict = 'covered' | 'partial' | 'idle'

export interface ShellCoverage {
  verdict: ShellVerdict
  total: number
  ran: number
  skipped: number
  /** Member surfaces with at least one test that ran. */
  photographed: readonly string[]
  /** Member surfaces named individually — the thing a reader needs and never gets. */
  unphotographed: readonly string[]
  /** Titles that failed because a baseline has never been captured. */
  missingBaselines: readonly string[]
  /** True when the Space console is missing from the matrix because no slug is configured. */
  spaceConsoleAbsent: boolean
  /**
   * OPERATOR surfaces this run collected and could not look at because the session bounced off
   * the /admin role floor. Empty when the operator half ran, when it was never collected, or when
   * the member shell ALSO skipped (that is a missing session, reported as `partial`, not this).
   *
   * 🔴 This list is why `covered` is no longer the whole verdict. Until 2026-09-07 a run whose
   * member shell ran and whose seven /admin routes all bounced printed `✅ App shell covered` with
   * a one-line "Still unphotographed" footnote — a tick over a console nobody had looked at, for
   * a cause that was known, named and filed (HYG-027). The headline now says so, the annotation
   * is an `::error`, and `PW_REQUIRE_OPERATOR` turns it into a failure (`requiredFailure`).
   */
  operatorsDenied: readonly string[]
  /** One sentence naming the cause, derived from the env rather than guessed. */
  reason: string
  /** The fix, as an instruction rather than a hint. */
  remedy: string
  specs: readonly string[]
}

const RUNBOOK = 'test/e2e/README.md § The member shell'

/** Is every surface that went unphotographed an OPERATOR surface? Then the cause is not a
 *  mystery — it is the /admin role floor, and it has a row. */
function onlyOperatorsMissing(input: ShellCoverageInput, unphotographed: readonly string[]): boolean {
  const operators = input.operatorSurfaces ?? []
  if (operators.length === 0 || unphotographed.length === 0) return false
  return unphotographed.every((path) => operators.includes(path))
}

function reasonFor(
  input: ShellCoverageInput,
  unphotographed: readonly string[] = [],
): { reason: string; remedy: string } {
  if (!input.baseURL) {
    return {
      reason: 'PW_BASE_URL is not set, so NOTHING ran in this suite — the shell is only the loudest part of that.',
      remedy: 'Point PW_BASE_URL at a Vercel preview or a running dev server.',
    }
  }
  if (!input.storageStateVar) {
    return {
      reason:
        'PW_STORAGE_STATE is not set, so the suite has no member session and every app-shell surface was skipped.',
      remedy: `Mint one with \`pnpm e2e:session\` (service-role-minted, no email round trip) and export PW_STORAGE_STATE. See ${RUNBOOK}.`,
    }
  }
  if (!input.storageState) {
    return {
      reason: `PW_STORAGE_STATE points at \`${input.storageStateVar}\`, which does not exist on disk, so the suite fell back to no session at all.`,
      remedy: `Re-mint it with \`pnpm e2e:session\` — the path is created fresh each run and is never committed. See ${RUNBOOK}.`,
    }
  }
  const saidSo = input.observations.some((o) => o.status === 'skipped' && o.roleFloor)
  if (saidSo || onlyOperatorsMissing(input, unphotographed)) {
    // The one case the old fall-through actively mis-described. Every missing surface is an
    // operator route, which means requireAdminFloor() bounced the session to /feed — a known,
    // named, already-filed account fact, not something to go hunting for in the run log.
    return {
      reason:
        'Every unphotographed surface is an OPERATOR route, so the session bounced off the /admin role floor: the account behind PW_MEMBER_EMAIL is signed in but is not platform staff. This IS a known blind spot (backlog HYG-027), not a defect in this pull request.',
      remedy:
        'Give that account web_role admin (or a staff role that sees an admin group) and these captures start running — see backlog HYG-027.',
    }
  }
  return {
    reason:
      'A member session WAS available and the app-shell tests still did not run. That is not the known blind spot; read the run log.',
    remedy: `Check the skip annotations in the Playwright output, then ${RUNBOOK}.`,
  }
}

export function summarizeShellCoverage(input: ShellCoverageInput): ShellCoverage {
  const observations = input.observations
  const ran = observations.filter((o) => o.status === 'ran')
  const skipped = observations.filter((o) => o.status === 'skipped')
  const photographed = input.surfaces.filter((path) => ran.some((o) => o.surface === path))
  const unphotographed = input.surfaces.filter((path) => !photographed.includes(path))
  const { reason, remedy } = reasonFor(input, unphotographed)

  const verdict: ShellVerdict =
    observations.length === 0 ? 'idle' : ran.length === 0 ? 'partial' : 'covered'

  // Two ways to know the floor was hit, and the precise one wins. (1) A skipped observation whose
  // annotation carried ROLE_FLOOR_MARKER — the run SAID so. (2) The older inference: a session
  // existed, the member half ran, and every missing surface is an operator route. (2) is kept so
  // a reporter that lost the annotation (a retry, a future Playwright) still names the cause.
  const flagged = new Set(skipped.filter((o) => o.roleFloor).map((o) => o.surface))
  const operatorsDenied =
    verdict === 'covered'
      ? (input.operatorSurfaces ?? []).filter(
          (path) =>
            unphotographed.includes(path) &&
            (flagged.has(path) || onlyOperatorsMissing(input, unphotographed)),
        )
      : []

  return {
    verdict,
    total: observations.length,
    ran: ran.length,
    skipped: skipped.length,
    photographed,
    unphotographed,
    spaceConsoleAbsent: !input.spaceSlug,
    operatorsDenied,
    missingBaselines: observations.filter((o) => o.missingBaseline).map((o) => o.title),
    reason,
    remedy,
    specs: input.specs ?? [],
  }
}

export interface ShellReport {
  /** Markdown for `$GITHUB_STEP_SUMMARY`. Empty string when the verdict is `idle`. */
  markdown: string
  /** GitHub workflow-command lines (`::warning …`). Empty when there is nothing to say. */
  annotations: readonly string[]
  /** A short block for the terminal, so a local run gets the same message. */
  console: string
}

function suiteLabel(specs: readonly string[]): string {
  if (specs.length === 0) return 'e2e'
  return specs.join(' + ')
}

/**
 * Render the verdict. The shape is deliberate:
 *   · the HEADLINE says partial or covered, in words, before any number;
 *   · every unphotographed surface is NAMED — "12 skipped" is what we are replacing;
 *   · the cause and the fix are one line each, so nobody has to go looking.
 */
export function renderShellCoverage(coverage: ShellCoverage): ShellReport {
  if (coverage.verdict === 'idle') {
    return { markdown: '', annotations: [], console: '' }
  }

  const label = suiteLabel(coverage.specs)
  const surfaceCount = coverage.photographed.length + coverage.unphotographed.length
  const lines: string[] = []
  const annotations: string[] = []

  if (coverage.verdict === 'partial') {
    lines.push(
      `### ⚠️ PARTIAL RESULT — the app shell was not looked at (${label})`,
      '',
      `**${coverage.photographed.length} of ${surfaceCount} member-shell surfaces were photographed.** ` +
        `All ${coverage.total} app-shell checks skipped, so a green result here covers the ` +
        'marketing site only. The rail, the dock, the fold control and every page inside the ' +
        '`(main)` shell were not rendered, not captured and not compared.',
      '',
      '**Unphotographed surfaces**',
      '',
      '| Surface | Covered? |',
      '| :--- | :--- |',
      ...coverage.unphotographed.map((path) => `| \`${path}\` | 🔴 not photographed |`),
      ...coverage.photographed.map((path) => `| \`${path}\` | ✅ photographed |`),
      '',
      `**Why.** ${coverage.reason}`,
      '',
      `**Fix.** ${coverage.remedy}`,
      '',
      'Read the rest of this run as: *the surfaces it can reach are green, and the surfaces it ' +
        'can reach exclude the product.*',
    )
    annotations.push(
      `::warning title=App shell not photographed (${label})::` +
        `0 of ${surfaceCount} member-shell surfaces were captured — ${coverage.unphotographed.join(', ')}. ` +
        `${coverage.reason} This result is PARTIAL, not a pass.`,
    )
  } else if (coverage.operatorsDenied.length > 0) {
    // The member shell ran; the operator console did not, and the run knows why. This is NOT a
    // tick with a footnote: the console is product an operator uses every day, and a headline
    // that says "covered" over seven unaudited /admin routes is the HYG-026 silence in a new
    // coat. Name every route, name the cause, name the grant.
    const member = coverage.photographed.length
    const memberTotal = surfaceCount - coverage.operatorsDenied.length
    lines.push(
      `### ⚠️ App shell covered, operator console NOT looked at (${label})`,
      '',
      `${member} of ${memberTotal} member-shell surfaces ran (${coverage.ran} of ${coverage.total} ` +
        `checks). Photographed: ${coverage.photographed.map((p) => `\`${p}\``).join(', ')}.`,
      '',
      `**${coverage.operatorsDenied.length} operator surface(s) bounced off the /admin role floor** ` +
        'and were neither photographed nor audited. A green result here covers the member shell ' +
        'and the marketing site; the operator console was not rendered, not captured and not compared.',
      '',
      '| Operator surface | Covered? |',
      '| :--- | :--- |',
      ...coverage.operatorsDenied.map((path) => `| \`${path}\` | 🔴 denied by requireAdminFloor() |`),
      '',
      `**Why.** ${coverage.reason}`,
      '',
      `**Fix.** ${coverage.remedy}`,
    )
    annotations.push(
      `::error title=Operator console not audited (${label})::` +
        `${coverage.operatorsDenied.join(', ')} bounced off the /admin role floor. ${coverage.reason} ` +
        'This result covers the member shell only; the operator half is NOT a pass.',
    )
    const others = coverage.unphotographed.filter((p) => !coverage.operatorsDenied.includes(p))
    if (others.length > 0) {
      lines.push('', `⚠️ Also unphotographed: ${others.map((p) => `\`${p}\``).join(', ')}.`)
    }
  } else {
    lines.push(
      `### ✅ App shell covered (${label})`,
      '',
      `${coverage.photographed.length} of ${surfaceCount} member-shell surfaces ran ` +
        `(${coverage.ran} of ${coverage.total} checks). Photographed: ` +
        `${coverage.photographed.map((p) => `\`${p}\``).join(', ')}.`,
    )
    if (coverage.unphotographed.length > 0) {
      lines.push(
        '',
        `⚠️ Still unphotographed: ${coverage.unphotographed.map((p) => `\`${p}\``).join(', ')}.`,
      )
      annotations.push(
        `::warning title=Some app-shell surfaces were not photographed (${label})::` +
          `${coverage.unphotographed.join(', ')} did not run. ${coverage.reason}`,
      )
    }
  }

  if (coverage.spaceConsoleAbsent) {
    // Not a skip: with no slug, `appSurfaces()` never creates the row, so nothing in the run
    // output would hint that an operator console exists and is uncovered.
    lines.push(
      '',
      '⚠️ The Space console is **not in this matrix at all** — `PW_SPACE_SLUG` is unset, so ' +
        '`appSurfaces()` never creates the row. Set it to a Space the e2e member can manage to ' +
        'add `/spaces/<slug>/manage`.',
    )
  }

  if (coverage.missingBaselines.length > 0) {
    lines.push(
      '',
      `**${coverage.missingBaselines.length} app-shell baseline(s) have never been captured.** ` +
        'The member shell had no PNGs before the credential existed, so the first run after it ' +
        'lands fails with "snapshot doesn\'t exist" until they are taken. This is expected once, ' +
        'and it is a capture step, not a regression:',
      '',
      '```',
      'e2e-manual.yml → Run workflow → base_url = <this preview>, capture_shell ✔, update_baselines ✔',
      '```',
      '',
      ...coverage.missingBaselines.slice(0, 12).map((t) => `- \`${t}\``),
    )
    annotations.push(
      `::warning title=App-shell baselines missing::${coverage.missingBaselines.length} shell snapshot(s) have never been captured. ` +
        'Dispatch e2e-manual.yml with capture_shell + update_baselines against this preview.',
    )
  }

  const markdown = `${lines.join('\n')}\n`
  const consoleLines =
    coverage.verdict === 'partial'
      ? [
          '',
          '  ⚠️  PARTIAL RESULT — the app shell was not looked at.',
          `      0 of ${surfaceCount} member-shell surfaces photographed: ${coverage.unphotographed.join(', ')}`,
          `      ${coverage.reason}`,
          `      ${coverage.remedy}`,
          '',
        ]
      : coverage.operatorsDenied.length > 0
        ? [
            '',
            '  ⚠️  App shell covered; the OPERATOR CONSOLE was not looked at.',
            `      ${coverage.operatorsDenied.length} /admin surface(s) bounced off the role floor: ${coverage.operatorsDenied.join(', ')}`,
            `      ${coverage.reason}`,
            `      ${coverage.remedy}`,
            '',
          ]
        : [
            '',
            `  ✅  App shell covered: ${coverage.photographed.length}/${surfaceCount} surfaces, ${coverage.ran}/${coverage.total} checks.`,
            '',
          ]

  return { markdown, annotations, console: consoleLines.join('\n') }
}

/** A flag value that means "on". `0` and `false` are off so a variable can be parked, not deleted. */
function flagOn(value: string | undefined): boolean {
  const v = (value ?? '').trim()
  return v !== '' && v !== '0' && v !== 'false'
}

/**
 * Should this run FAIL for what it could not look at? Returns the `::error` line, or null.
 *
 * Two opt-in ratchets, one per owner precondition, because the two silences have different fixes:
 *   · `PW_REQUIRE_SHELL`    — the CREDENTIAL exists, so a run that photographs zero app surfaces
 *                             (`partial`) is red rather than announced.
 *   · `PW_REQUIRE_OPERATOR` — the account CLEARS THE FLOOR, so a run whose operator surfaces bounce
 *                             off requireAdminFloor() is red rather than announced.
 * Neither is on by default: before the precondition, silence is loud (the banner above); after it,
 * silence is red, so a grant that is later revoked cannot quietly re-open the blind spot. Pure so
 * `shell-coverage.test.ts` can prove both directions without a Playwright run.
 */
export function requiredFailure(
  coverage: ShellCoverage,
  env: { requireShell?: string; requireOperator?: string },
): string | null {
  if (coverage.verdict === 'partial' && flagOn(env.requireShell)) {
    return (
      '::error title=App shell not photographed::PW_REQUIRE_SHELL is set, so a run that photographs ' +
      `0 app surfaces fails. ${coverage.reason}`
    )
  }
  if (coverage.operatorsDenied.length > 0 && flagOn(env.requireOperator)) {
    return (
      '::error title=Operator console not audited::PW_REQUIRE_OPERATOR is set, so a run whose operator ' +
      `surfaces bounce off the /admin role floor fails (${coverage.operatorsDenied.join(', ')}). ${coverage.reason}`
    )
  }
  return null
}

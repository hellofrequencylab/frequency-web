// ADR-949: a guard is not trusted until it has been OBSERVED failing. This one exists to
// announce a silence, so the test that matters most is the negative control — a run that did
// photograph the shell must NOT be able to print the partial banner. Without that, the banner
// is decoration that reads like evidence.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  renderShellCoverage,
  requiredFailure,
  summarizeShellCoverage,
  type ShellObservation,
} from './shell-coverage'
import {
  captureFlipMessage,
  capturedHeights,
  operatorLandedElsewhere,
  ROLE_FLOOR_MARKER,
  smallestEnclosing,
  unsettledMessage,
  type MovedBox,
  type SettleReport,
  type ViewportBox,
} from './surfaces'

/** The four member-shell surfaces, exactly as appSurfaces() yields them with a Space slug. */
const SURFACES = ['/feed', '/channels', '/settings', '/spaces/demo/manage']

/** #2048's run: every shell test collected, every one skipped. */
function skippedRun(): ShellObservation[] {
  return SURFACES.flatMap((surface) =>
    ['dawn-light', 'dawn-dark'].flatMap((state) =>
      ['desktop', 'mobile'].map((project) => ({
        title: `visual · member shell › ${state} › ${surface} matches baseline › ${project}`,
        surface,
        status: 'skipped' as const,
      })),
    ),
  )
}

function ranRun(): ShellObservation[] {
  return skippedRun().map((o) => ({ ...o, status: 'ran' as const }))
}

describe('member-shell coverage', () => {
  it('calls a run that photographed nothing PARTIAL, and names every surface', () => {
    const coverage = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      surfaces: SURFACES,
      observations: skippedRun(),
      specs: ['visual.spec.ts'],
      spaceSlug: 'demo',
    })

    expect(coverage.verdict).toBe('partial')
    expect(coverage.ran).toBe(0)
    expect(coverage.skipped).toBe(16)
    expect(coverage.photographed).toEqual([])
    expect(coverage.unphotographed).toEqual(SURFACES)

    const { markdown, annotations } = renderShellCoverage(coverage)
    expect(markdown).toContain('PARTIAL RESULT')
    expect(markdown).toContain('0 of 4 member-shell surfaces were photographed')
    // The whole point: each surface NAMED, not summarised as a count of skips.
    for (const surface of SURFACES) expect(markdown).toContain(surface)
    expect(annotations.join('\n')).toContain('::warning title=App shell not photographed')
  })

  // THE NEGATIVE CONTROL. If this passes while the assertion above also passes, the banner
  // is responding to the run rather than always firing.
  it('cannot call a covered run partial', () => {
    const coverage = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      storageStateVar: '/tmp/member.json',
      storageState: '/tmp/member.json',
      surfaces: SURFACES,
      observations: ranRun(),
      specs: ['visual.spec.ts'],
      spaceSlug: 'demo',
    })

    expect(coverage.verdict).toBe('covered')
    expect(coverage.unphotographed).toEqual([])

    const { markdown, annotations } = renderShellCoverage(coverage)
    expect(markdown).toContain('App shell covered')
    expect(markdown).not.toContain('PARTIAL')
    expect(annotations).toEqual([])
  })

  it('stays silent when a run collected no shell tests at all', () => {
    // `--grep @smoke` collects none of them; a banner there would be noise, and noise is how
    // a real warning gets ignored.
    const coverage = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      surfaces: SURFACES,
      observations: [],
    })
    expect(coverage.verdict).toBe('idle')
    expect(renderShellCoverage(coverage)).toEqual({ markdown: '', annotations: [], console: '' })
  })

  it('says so when the Space console is not even in the matrix', () => {
    // Without PW_SPACE_SLUG there is no test row for the console, so nothing in the run
    // output would hint that it exists. A missing row is quieter than a skip.
    const coverage = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      storageStateVar: '/tmp/member.json',
      storageState: '/tmp/member.json',
      surfaces: ['/feed', '/channels', '/settings'],
      observations: ranRun().filter((o) => o.surface !== '/spaces/demo/manage'),
    })
    expect(coverage.spaceConsoleAbsent).toBe(true)
    expect(renderShellCoverage(coverage).markdown).toContain('PW_SPACE_SLUG')
  })

  it('flags a partly-covered run rather than reporting it as a clean pass', () => {
    const observations = skippedRun().map((o) =>
      o.surface === '/spaces/demo/manage' ? o : { ...o, status: 'ran' as const },
    )
    const coverage = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      storageStateVar: '/tmp/member.json',
      storageState: '/tmp/member.json',
      surfaces: SURFACES,
      observations,
    })

    expect(coverage.verdict).toBe('covered')
    expect(coverage.unphotographed).toEqual(['/spaces/demo/manage'])
    const { markdown, annotations } = renderShellCoverage(coverage)
    expect(markdown).toContain('Still unphotographed')
    expect(annotations).toHaveLength(1)
  })

  it('tells the three causes apart, because they need three different fixes', () => {
    const unset = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      surfaces: SURFACES,
      observations: skippedRun(),
    })
    expect(unset.reason).toContain('PW_STORAGE_STATE is not set')
    expect(unset.remedy).toContain('pnpm e2e:session')

    const missingFile = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      storageStateVar: '/tmp/gone.json',
      surfaces: SURFACES,
      observations: skippedRun(),
    })
    expect(missingFile.reason).toContain('does not exist on disk')

    const noTarget = summarizeShellCoverage({
      surfaces: SURFACES,
      observations: skippedRun(),
    })
    expect(noTarget.reason).toContain('PW_BASE_URL is not set')
  })

  it('turns a never-captured baseline into a capture instruction, not a regression report', () => {
    const observations = ranRun().map((o, i) =>
      i < 3 ? { ...o, missingBaseline: true } : o,
    )
    const coverage = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      storageStateVar: '/tmp/member.json',
      storageState: '/tmp/member.json',
      surfaces: SURFACES,
      observations,
    })

    expect(coverage.missingBaselines).toHaveLength(3)
    const { markdown } = renderShellCoverage(coverage)
    expect(markdown).toContain('have never been captured')
    expect(markdown).toContain('capture_shell')
  })
})

// ── THE REASON MUST NAME THE /admin ROLE FLOOR, NOT SEND THE READER AWAY ─────────────────────────
//
// 🔴 THE BUG (2026-08-31, off the pr-compare run on #2323). Seven operator routes went
// unphotographed and the banner said: "A member session WAS available and the app-shell tests
// still did not run. That is not the known blind spot; read the run log."
//
// It IS the known blind spot. `operatorDenialReason()` (surfaces.ts) exists for exactly this case
// and names it: requireAdminFloor() bounces a signed-in non-staff viewer to /feed, so no operator
// surface can be photographed with that account, and it cites backlog HYG-027. `reasonFor()` simply
// never consulted it — the three branches above it only knew about a MISSING session — so the one
// diagnostic sentence a reader gets pointed away from the row that explains it.
//
// ADR-949 again: the negative control is the assertion that matters. A reason that always blamed
// the role floor would be the same defect wearing the other face.
const OPERATORS = ['/admin', '/admin/library', '/admin/qr']

function run(surface: string, status: 'ran' | 'skipped'): ShellObservation {
  return { title: `visual · operator console › dawn-light › ${surface}`, surface, status }
}

describe('the reason tells the two blind spots apart', () => {
  const base = {
    baseURL: 'https://preview.example.vercel.app',
    storageStateVar: '/tmp/state.json',
    storageState: '/tmp/state.json',
    specs: ['visual.spec.ts'],
    spaceSlug: 'demo',
    operatorSurfaces: OPERATORS,
  }

  it('🔴 names the /admin role floor and HYG-027 when ONLY operator routes are missing', () => {
    const coverage = summarizeShellCoverage({
      ...base,
      surfaces: [...SURFACES, ...OPERATORS],
      observations: [
        ...ranRun(),
        ...OPERATORS.map((s) => run(s, 'skipped')),
      ],
    })
    expect(coverage.verdict).toBe('covered')
    expect(coverage.unphotographed).toEqual(OPERATORS)
    expect(coverage.reason).toContain('/admin role floor')
    expect(coverage.reason).toContain('HYG-027')
    // The sentence that was actively wrong must be gone in this case.
    expect(coverage.reason).not.toContain('That is not the known blind spot')
    // And the remedy has to be the ACTION, not "go read the log".
    expect(coverage.remedy).toContain('web_role admin')
  })

  it('does NOT blame the role floor when a MEMBER surface is also missing', () => {
    // The negative control. A member surface skipping is not explained by requireAdminFloor(), so
    // the honest answer there is still "read the run log".
    const coverage = summarizeShellCoverage({
      ...base,
      surfaces: [...SURFACES, ...OPERATORS],
      observations: [
        ...ranRun().map((o) => (o.surface === '/settings' ? { ...o, status: 'skipped' as const } : o)),
        ...OPERATORS.map((s) => run(s, 'skipped')),
      ],
    })
    expect(coverage.unphotographed).toContain('/settings')
    expect(coverage.reason).not.toContain('HYG-027')
    expect(coverage.reason).toContain('That is not the known blind spot')
  })

  it('does NOT blame the role floor when the run never collected an operator surface', () => {
    // An a11y run carries the member shell and not the console. With no operator list, a skip has
    // to fall through to the honest unknown rather than borrowing an explanation.
    const coverage = summarizeShellCoverage({
      ...base,
      operatorSurfaces: [],
      surfaces: SURFACES,
      observations: ranRun().map((o) =>
        o.surface === '/channels' ? { ...o, status: 'skipped' as const } : o,
      ),
    })
    expect(coverage.reason).not.toContain('HYG-027')
  })

  it('still reports a MISSING session as the missing session, not as the role floor', () => {
    // The three original branches must keep winning: no credential is a different problem with a
    // different fix, and it is the one the reporter was built for.
    const coverage = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      surfaces: [...SURFACES, ...OPERATORS],
      observations: [...skippedRun(), ...OPERATORS.map((s) => run(s, 'skipped'))],
      operatorSurfaces: OPERATORS,
      specs: ['visual.spec.ts'],
      spaceSlug: 'demo',
    })
    expect(coverage.reason).toContain('PW_STORAGE_STATE is not set')
    expect(coverage.reason).not.toContain('HYG-027')
  })
})

// ── A COVERED MEMBER SHELL OVER A DENIED OPERATOR CONSOLE IS NOT A TICK (HYG-027, ADR-1239) ────
//
// The run above ("names the /admin role floor") got the REASON right on 2026-08-31 and still
// printed `### ✅ App shell covered` over it, with the seven /admin routes in a one-line footnote.
// That is the #2048 silence at a different altitude: a headline that says covered, over a console
// that was not looked at, for a cause the repo had already filed. The headline now says so, the
// annotation is an `::error`, and PW_REQUIRE_OPERATOR turns it into a failure. ADR-949 applies
// twice over: the negative control (operators RAN → no banner, no failure) is the assertion that
// keeps this from being decoration.
function deniedRun(surface: string): ShellObservation {
  return {
    title: `a11y · operator console › ${surface} has no serious+ violations (dawn-light)`,
    surface,
    status: 'skipped',
    roleFloor: true,
  }
}

describe('a denied operator console changes the verdict, not just the footnote', () => {
  const base = {
    baseURL: 'https://preview.example.vercel.app',
    storageStateVar: '/tmp/state.json',
    storageState: '/tmp/state.json',
    specs: ['a11y.spec.ts'],
    spaceSlug: 'demo',
    operatorSurfaces: OPERATORS,
    surfaces: [...SURFACES, ...OPERATORS],
  }

  it('🔴 names every denied /admin route in the headline and raises an ::error annotation', () => {
    const coverage = summarizeShellCoverage({
      ...base,
      observations: [...ranRun(), ...OPERATORS.map(deniedRun)],
    })
    expect(coverage.verdict).toBe('covered')
    expect(coverage.operatorsDenied).toEqual(OPERATORS)

    const { markdown, annotations, console: terminal } = renderShellCoverage(coverage)
    expect(markdown).toContain('operator console NOT looked at')
    expect(markdown).not.toContain('✅ App shell covered')
    for (const surface of OPERATORS) expect(markdown).toContain(`| \`${surface}\` | 🔴`)
    expect(markdown).toContain('HYG-027')
    expect(annotations).toHaveLength(1)
    expect(annotations[0]).toContain('::error title=Operator console not audited')
    expect(terminal).toContain('OPERATOR CONSOLE was not looked at')
  })

  it('reads the role floor off the skip annotation even when a MEMBER surface also skipped', () => {
    // The heuristic alone ("only operators missing") cannot see this case; the flagged
    // observation can, which is why the reporter records it from the test's own annotation.
    const coverage = summarizeShellCoverage({
      ...base,
      observations: [
        ...ranRun().map((o) => (o.surface === '/settings' ? { ...o, status: 'skipped' as const } : o)),
        ...OPERATORS.map(deniedRun),
      ],
    })
    expect(coverage.operatorsDenied).toEqual(OPERATORS)
    expect(coverage.reason).toContain('/admin role floor')
    expect(renderShellCoverage(coverage).markdown).toContain('Also unphotographed: `/settings`')
  })

  it('NEGATIVE CONTROL: operators that RAN produce no denial, no ::error and no failure', () => {
    const coverage = summarizeShellCoverage({
      ...base,
      observations: [...ranRun(), ...OPERATORS.map((s) => run(s, 'ran'))],
    })
    expect(coverage.operatorsDenied).toEqual([])
    const { markdown, annotations } = renderShellCoverage(coverage)
    expect(markdown).toContain('✅ App shell covered')
    expect(annotations).toEqual([])
    expect(requiredFailure(coverage, { requireOperator: '1', requireShell: '1' })).toBeNull()
  })

  it('does not call a PARTIAL run an operator denial: no session is a different problem', () => {
    const coverage = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      surfaces: [...SURFACES, ...OPERATORS],
      observations: [...skippedRun(), ...OPERATORS.map(deniedRun)],
      operatorSurfaces: OPERATORS,
    })
    expect(coverage.verdict).toBe('partial')
    expect(coverage.operatorsDenied).toEqual([])
    expect(coverage.reason).toContain('PW_STORAGE_STATE is not set')
  })

  it('does not blame the floor when the run never collected an operator surface', () => {
    const coverage = summarizeShellCoverage({
      ...base,
      operatorSurfaces: [],
      surfaces: SURFACES,
      observations: ranRun(),
    })
    expect(coverage.operatorsDenied).toEqual([])
  })
})

describe('requiredFailure: two opt-in ratchets, one per owner precondition', () => {
  const denied = summarizeShellCoverage({
    baseURL: 'https://preview.example.vercel.app',
    storageStateVar: '/tmp/state.json',
    storageState: '/tmp/state.json',
    surfaces: [...SURFACES, ...OPERATORS],
    observations: [...ranRun(), ...OPERATORS.map(deniedRun)],
    operatorSurfaces: OPERATORS,
  })
  const partial = summarizeShellCoverage({
    baseURL: 'https://preview.example.vercel.app',
    surfaces: SURFACES,
    observations: skippedRun(),
  })

  it('is silent by default: before the grant, silence is loud, not red', () => {
    expect(requiredFailure(denied, {})).toBeNull()
    expect(requiredFailure(denied, { requireOperator: '0' })).toBeNull()
    expect(requiredFailure(denied, { requireOperator: 'false' })).toBeNull()
  })

  it('PW_REQUIRE_OPERATOR turns a denied console into a failure that names the routes', () => {
    const failure = requiredFailure(denied, { requireOperator: '1' })
    expect(failure).toContain('::error title=Operator console not audited')
    expect(failure).toContain('PW_REQUIRE_OPERATOR')
    for (const surface of OPERATORS) expect(failure).toContain(surface)
  })

  it('PW_REQUIRE_SHELL governs the missing session, and ONLY that', () => {
    expect(requiredFailure(partial, { requireShell: '1' })).toContain('PW_REQUIRE_SHELL')
    // A denied console with the member shell covered is not `partial`, so the shell knob alone
    // must not fire on it — the two silences have two fixes and two switches.
    expect(requiredFailure(denied, { requireShell: '1' })).toBeNull()
    expect(requiredFailure(partial, { requireOperator: '1' })).toBeNull()
  })
})

// ── "PHOTOGRAPHED, ADVISORY, LIVE-476" IS A THIRD ANSWER, AND THE LEDGER HAD ONLY TWO ──────────
//
// 🔴 THE BUG THIS PREVENTS, stated before it can happen. /admin/qr blocked four consecutive pull
// requests that touched nothing it renders, so the owner moved it to the advisory tier: the
// capture still runs, in the @advisory step, and it no longer votes. That describe is NOT tagged
// @shell, deliberately: a running advisory capture must not make this reporter call the authed
// app covered, which is the same rule /discover follows.
//
// The consequence is that the BLOCKING shell run collects no observation for that path. With two
// buckets the banner would have called it unphotographed, which is false in the other direction:
// it IS photographed, one step later. Worse, `operatorsDenied` would have picked it up and
// PW_REQUIRE_OPERATOR would have turned a surface the run DID look at into a red run, teaching
// everybody that the ratchet means nothing, which is the disease, not the cure.
//
// ADR-949 again: the assertion that makes this more than decoration is the NEGATIVE CONTROL at
// the bottom. An operator route that is NOT on the advisory roster must still read as
// unphotographed, still be denied, and still fire the ratchet. Otherwise this is a silencer.
describe('an advisory surface is photographed elsewhere, not unphotographed', () => {
  const ADVISORY = { '/admin/qr': 'LIVE-476' }
  const base = {
    baseURL: 'https://preview.example.vercel.app',
    storageStateVar: '/tmp/state.json',
    storageState: '/tmp/state.json',
    specs: ['visual.spec.ts'],
    spaceSlug: 'demo',
    operatorSurfaces: OPERATORS,
    surfaces: [...SURFACES, ...OPERATORS],
    advisorySurfaces: ADVISORY,
  }

  /** The blocking shell run after the move: the member shell ran, the two voting operator routes
   *  ran, and /admin/qr was never collected because its describe carries @advisory. */
  function blockingShellRun(): ShellObservation[] {
    return [
      ...ranRun(),
      ...OPERATORS.filter((p) => p !== '/admin/qr').map((s) => run(s, 'ran')),
    ]
  }

  it('🔴 calls it advisory with its row, and NEVER unphotographed', () => {
    const coverage = summarizeShellCoverage({ ...base, observations: blockingShellRun() })

    expect(coverage.verdict).toBe('covered')
    expect(coverage.unphotographed).toEqual([])
    expect(coverage.advisory).toEqual([{ path: '/admin/qr', row: 'LIVE-476' }])

    const { markdown, annotations, console: terminal } = renderShellCoverage(coverage)
    expect(markdown).toContain('photographed, advisory, LIVE-476')
    expect(markdown).not.toContain('Still unphotographed')
    expect(markdown).not.toContain('not photographed')
    expect(annotations).toHaveLength(1)
    expect(annotations[0]).toContain('::notice title=Photographed in the advisory tier')
    expect(annotations[0]).toContain('LIVE-476')
    expect(terminal).toContain('ADVISORY tier')
    expect(terminal).toContain('/admin/qr (LIVE-476)')
  })

  it('keeps it in the DENOMINATOR: the roster is not quietly shrunk to make a count line up', () => {
    const coverage = summarizeShellCoverage({ ...base, observations: blockingShellRun() })
    const total = SURFACES.length + OPERATORS.length
    expect(coverage.photographed).toHaveLength(total - 1)
    // 6 of 7, not 6 of 6. The seventh is named on its own line with the row that owns it.
    expect(renderShellCoverage(coverage).markdown).toContain(`${total - 1} of ${total}`)
  })

  it('does NOT read as a denied operator console, and PW_REQUIRE_OPERATOR does not fire on it', () => {
    const coverage = summarizeShellCoverage({ ...base, observations: blockingShellRun() })
    expect(coverage.operatorsDenied).toEqual([])
    expect(coverage.reason).not.toContain('/admin role floor')
    expect(requiredFailure(coverage, { requireOperator: '1', requireShell: '1' })).toBeNull()
    expect(renderShellCoverage(coverage).markdown).toContain('✅ App shell covered')
  })

  it('names it in a PARTIAL run too, where every other surface really was missed', () => {
    const coverage = summarizeShellCoverage({
      baseURL: 'https://preview.example.vercel.app',
      surfaces: [...SURFACES, ...OPERATORS],
      observations: [...skippedRun(), ...OPERATORS.filter((p) => p !== '/admin/qr').map((s) => run(s, 'skipped'))],
      operatorSurfaces: OPERATORS,
      advisorySurfaces: ADVISORY,
    })
    expect(coverage.verdict).toBe('partial')
    const { markdown } = renderShellCoverage(coverage)
    expect(markdown).toContain('| `/admin/qr` | 🟡 photographed, advisory, LIVE-476 |')
    expect(markdown).toContain('| `/feed` | 🔴 not photographed |')
  })

  it('🔴 NEGATIVE CONTROL: an operator route NOT on the roster is still denied, still red', () => {
    // If this passed, the mechanism would be a blanket silencer rather than a per-surface,
    // row-backed downgrade, and that is the failure mode worth a test of its own.
    const coverage = summarizeShellCoverage({
      ...base,
      observations: [...ranRun(), ...OPERATORS.map(deniedRun)],
    })
    expect(coverage.advisory).toEqual([{ path: '/admin/qr', row: 'LIVE-476' }])
    expect(coverage.operatorsDenied).toEqual(['/admin', '/admin/library'])
    expect(coverage.reason).toContain('HYG-027')
    const failure = requiredFailure(coverage, { requireOperator: '1' })
    expect(failure).toContain('::error title=Operator console not audited')
    expect(failure).toContain('/admin/library')
    expect(failure).not.toContain('/admin/qr')
  })

  // 🔴 THE POSITIVE CONTROL ON THE BUG ITSELF. Drop the roster and the SAME run reports the
  // surface as unphotographed, headlines the operator console as not looked at, and
  // PW_REQUIRE_OPERATOR turns it red, for a surface that was photographed in the advisory step.
  // This is what the three assertions above are worth, measured rather than asserted.
  it('without the roster, the very same run announces it unseen and the ratchet goes red', () => {
    const coverage = summarizeShellCoverage({
      ...base,
      advisorySurfaces: undefined,
      observations: blockingShellRun(),
    })
    expect(coverage.advisory).toEqual([])
    expect(coverage.unphotographed).toEqual(['/admin/qr'])
    expect(coverage.operatorsDenied).toEqual(['/admin/qr'])
    const { markdown } = renderShellCoverage(coverage)
    expect(markdown).toContain('operator console NOT looked at')
    expect(markdown).toContain('| `/admin/qr` | 🔴')
    expect(requiredFailure(coverage, { requireOperator: '1' })).toContain('/admin/qr')
  })
})

// The pure half is proven above. This is the wiring: a roster nothing passes to the summarizer
// changes nothing, and the surface would be announced as unseen on every run.
describe('the reporter and the surface list actually carry the advisory roster', () => {
  const dir = join(__dirname)

  it('shell-reporter.ts hands ADVISORY_OPERATOR_SURFACES to the summarizer', () => {
    const src = readFileSync(join(dir, 'shell-reporter.ts'), 'utf8')
    expect(src).toContain('ADVISORY_OPERATOR_SURFACES')
    expect(src).toMatch(/advisorySurfaces:\s*ADVISORY_OPERATOR_SURFACES/)
  })

  it('surfaces.ts keeps /admin/qr in the operator roster while naming it advisory', () => {
    const src = readFileSync(join(dir, 'surfaces.ts'), 'utf8')
    expect(src).toContain("{ path: '/admin/qr',")
    expect(src).toMatch(/ADVISORY_OPERATOR_SURFACES[\s\S]{0,1200}'\/admin\/qr':\s*'LIVE-476'/)
    expect(src).toContain('export const ADVISORY_OPERATOR_PATHS')
  })
})

// ── THE PURE FUNCTION IS PROVEN ABOVE; THIS IS THE PROOF THAT THE WORKFLOWS FEED IT ──────────────
//
// 🔴 requiredFailure() cannot fire on a value nothing passes it, and for a year one of the two
// workflows that run this suite passed neither. Measured against production on 2026-09-08, run
// 34174895830 (e2e-manual.yml, capture_shell on):
//
//     ##[warning]*** is signed in but is NOT platform staff: /admin redirected to /feed,
//                which is requireAdminFloor()'s denial target.
//     ⚠️  App shell covered; the OPERATOR CONSOLE was not looked at.
//     ##[error]/admin, /admin/library, … bounced off the /admin role floor.
//     smoke → SUCCESS
//
// Everything the reporter is supposed to say, said — and a green job over it. The PR gate
// (e2e.yml) reads both ratchets, so the owner's `PW_REQUIRE_OPERATOR=1` would have turned THAT
// path red while leaving the CAPTURE path — the dispatch the owner is asked to make to take the
// operator baselines in the first place — green over a capture that photographed none of them.
//
// So the switch has to reach every step that runs a suite, and something has to notice when it
// stops. AGENTS.md: "Every fail-safe needs a gate that notices it fired." This is that gate one
// level up — it reads the workflow SOURCE, so it fails on the shape rather than on a CI run it
// would have to dispatch to observe. HYG-027, ADR-1266.
describe('both e2e workflows hand the ratchets to every step that runs a suite', () => {
  /** Steps are 6-space list items; a step "runs a suite" iff its own `run:` invokes one. */
  function suiteSteps(source: string): string[] {
    return source
      .split(/\n(?= {6}- (?:name|uses):)/)
      .filter((step) => /^ +run: pnpm test:e2e/m.test(step))
  }

  const prGate = readFileSync('.github/workflows/e2e.yml', 'utf8')
  const manual = readFileSync('.github/workflows/e2e-manual.yml', 'utf8')

  it('e2e.yml: all four suite steps read both ratchets, from either tab', () => {
    const steps = suiteSteps(prGate)
    // Smoke + a11y, then three visual tiers: blocking public, blocking member-shell
    // (LIVE-313), and advisory live-index (LIVE-373). The ratchets matter MORE per tier
    // now, not less: they turn "the shell could not be photographed" into a named skip
    // instead of a silent pass.
    expect(steps).toHaveLength(4)
    for (const step of steps) {
      expect(step).toContain('vars.PW_REQUIRE_SHELL || secrets.PW_REQUIRE_SHELL')
      expect(step).toContain('vars.PW_REQUIRE_OPERATOR || secrets.PW_REQUIRE_OPERATOR')
    }
  })

  it('e2e-manual.yml: ALL FOUR suite steps read both ratchets — the half that was missing', () => {
    const steps = suiteSteps(manual)
    // smoke, update-baselines, update-a11y, visual. A fifth suite-running step added without the
    // pass-through is exactly the regression this asserts against.
    expect(steps).toHaveLength(4)
    for (const step of steps) {
      expect(step).toContain('vars.PW_REQUIRE_SHELL || secrets.PW_REQUIRE_SHELL')
      expect(step).toContain('vars.PW_REQUIRE_OPERATOR || secrets.PW_REQUIRE_OPERATOR')
    }
  })

  it('and gates them on capture_shell, so a marketing-only dispatch cannot go red for a half it never asked for', () => {
    for (const step of suiteSteps(manual)) {
      expect(step).toMatch(/PW_REQUIRE_SHELL: \$\{\{ inputs\.capture_shell &&/)
      expect(step).toMatch(/PW_REQUIRE_OPERATOR: \$\{\{ inputs\.capture_shell &&/)
    }
  })

  it('POSITIVE CONTROL: the reader finds the suite steps, and notices when the wiring is removed', () => {
    // ADR-949 — a guard is not trusted until it has been observed failing. Both halves: the
    // splitter must actually find steps (a broken regex would vacuously pass every loop above),
    // and a tree with the pass-through deleted must be detected.
    expect(suiteSteps(manual).length).toBeGreaterThan(0)
    const blinded = manual.replace(/^ +PW_REQUIRE_(SHELL|OPERATOR):.*$/gm, '')
    expect(
      suiteSteps(blinded).every((step) => step.includes('PW_REQUIRE_OPERATOR:')),
    ).toBe(false)
  })
})

// ── THE LATE BOUNCE: a capture must never carry one route's name over another page ───────────────
//
// MEASURED 2026-09-10 (e2e-manual run 34517618524): eight of sixteen committed operator baselines
// were photographs of /feed. `operatorDenialReason` had already passed — it reads the path right
// after `goto`, and requireAdmin() denies at the PAGE, inside the window `settle()` then waits in.
// `assertMemberSession` cannot catch it either: /feed HAS the member shell, so that guard proves a
// session and not a destination. Only baseline-distinctness noticed, and only for the one pair that
// collided byte-for-byte.
describe('operatorLandedElsewhere: the check that runs at the shutter', () => {
  const surface = { path: '/admin/qr', slug: 'admin-qr', audience: 'operator' as const }
  const at = (url: string) => ({ url: () => url }) as unknown as Parameters<typeof operatorLandedElsewhere>[0]

  it('fires when an operator surface has drifted to the role floor target', () => {
    const reason = operatorLandedElsewhere(at('https://x.test/feed'), surface)
    expect(reason).toContain('/admin/qr')
    expect(reason).toContain('/feed')
    expect(reason).toContain(ROLE_FLOOR_MARKER)
  })

  it('fires for ANY other page, not just /feed — the misattribution is the defect, not the target', () => {
    expect(operatorLandedElsewhere(at('https://x.test/admin'), surface)).toContain('/admin')
    expect(operatorLandedElsewhere(at('https://x.test/'), surface)).not.toBeNull()
  })

  it('stays quiet on the route itself and on its children', () => {
    expect(operatorLandedElsewhere(at('https://x.test/admin/qr'), surface)).toBeNull()
    expect(operatorLandedElsewhere(at('https://x.test/admin/qr/new'), surface)).toBeNull()
  })

  it('never speaks for a non-operator surface — the member half has its own guard', () => {
    const feed = { path: '/feed', slug: 'app-feed', audience: 'member' as const }
    expect(operatorLandedElsewhere(at('https://x.test/sign-in'), feed)).toBeNull()
  })

  it('is wired into BOTH suites, after settle() rather than before it', () => {
    for (const spec of ['test/e2e/visual.spec.ts', 'test/e2e/a11y.spec.ts']) {
      const src = readFileSync(join(process.cwd(), spec), 'utf8')
      expect(src).toContain('operatorLandedElsewhere(page, surface)')
      // The whole point is the ORDER: before settle() it is the check that already failed.
      expect(src.indexOf('await settle(page)')).toBeLessThan(src.indexOf('operatorLandedElsewhere(page, surface)'))
    }
  })
})
// ── THE HEIGHT THAT NEVER STOPPED: the fail-safe that used to fire in silence ───────────────
//
// MEASURED (2026-09-23): `[mobile] visual · operator console › /admin/qr matches baseline` went
// red on two unrelated pull requests with byte-identical numbers — the full-page height flipping
// between 14521 and 14567, a diff of 46,975 pixels every time. `settleHeight` in surfaces.ts kept
// ONE previous height and a quiet clock, so it could only see monotonic growth: an alternation
// whose plateaus outlast the quiet window reads as settled. And when its 15s budget expired it
// returned with no throw, no annotation and no counter, so the page reached the camera unsettled
// and the failure surfaced several frames later as `Failed to take two consecutive stable
// screenshots`, naming neither the surface's height nor the wait that had given up.
//
// `settleReport` now carries the distinct heights and whether the height came BACK to one it had
// already left; `unsettledMessage` turns that into the sentence. It is pure, so it is tested the
// way `operatorLandedElsewhere` is — no browser, on every PR — and per ADR-949 the test that
// matters most is the negative control: a page that really did come to rest must stay quiet.
describe('unsettledMessage: the gate that notices settleHeight gave up', () => {
  const report = (over: Partial<SettleReport> = {}): SettleReport => ({
    settled: true,
    oscillated: false,
    heights: [14521],
    distinct: 1,
    final: 14521,
    waitedMs: 800,
    moved: [],
    movers: [],
    ...over,
  })

  /** The real one, as `settleHeight` would hand it back for /admin/qr. */
  const flip = (): SettleReport =>
    report({
      settled: true,
      oscillated: true,
      heights: [14521, 14567],
      distinct: 2,
      waitedMs: 15_000,
      movers: [
        {
          path: 'body>div[1]>main[0]>div[2]>section[1]>div[1]',
          desc: 'div.mt-4.flex "No scans yet in this window."',
          from: 80.75,
          to: 136,
        },
      ],
    })

  it('NEGATIVE CONTROL: a height that came to rest on one value says nothing', () => {
    expect(unsettledMessage(report(), '/admin/qr')).toBeNull()
    // Monotonic growth that then settled is the normal case: every `<Suspense fallback={null}>`
    // on the surface appends, so several distinct heights on the way to one is not a defect.
    expect(unsettledMessage(report({ heights: [8497, 9272, 9390], distinct: 3 }), '/feed')).toBeNull()
  })

  it('names the surface and BOTH heights when the page alternated', () => {
    const message = unsettledMessage(flip(), '/admin/qr')
    expect(message).toContain('/admin/qr never settled: 14521 and 14567 over 15s')
    // The two numbers are the whole point: without them the next person re-derives them by
    // arithmetic over the committed PNG, which is what actually happened twice.
    expect(message).toContain('came BACK to a value it had already left')
  })

  it('\u{1F534} NAMES THE ELEMENT, which is the only reason this gate pays for itself', () => {
    // The heights alone are what we ALREADY KNEW after two red pull requests. A message that
    // stops there blocks the surface deterministically and still sends the next person to a
    // calculator and a committed PNG. The box, its two sizes and its text are the deliverable.
    const message = unsettledMessage(flip(), '/admin/qr')
    expect(message).toContain('The box that changed:')
    expect(message).toContain('div.mt-4.flex "No scans yet in this window." 80.75px then 136px')
  })

  it('reports a box that exists on only ONE plateau as absent, not as 0px', () => {
    // The branch-swap shape: the two halves are different nodes, so one side has no box at all.
    // "0px" would read as a box that collapsed, which is a different defect.
    const message = unsettledMessage(
      report({
        oscillated: true,
        heights: [14521, 14567],
        distinct: 2,
        movers: [{ path: 'body>p[0]', desc: 'p.text-meta "No scans yet"', from: 0, to: 55.25 }],
      }),
      '/admin/qr',
    )
    expect(message).toContain('p.text-meta "No scans yet" absent then 55.25px')
  })

  it('says so honestly when it could NOT name a box, instead of implying it found nothing', () => {
    const message = unsettledMessage(
      report({ oscillated: true, heights: [14521, 14567], distinct: 2, movers: [] }),
      '/admin/qr',
    )
    expect(message).toContain('No box could be named')
    expect(message).not.toContain('The box that changed')
  })

  it('fires on an oscillation EVEN WHEN the quiet window was satisfied', () => {
    // The defect the old helper could not see. `settled` is true — the camera looked during one
    // plateau — and the page still renders at two sizes for one commit.
    expect(unsettledMessage(report({ settled: true, oscillated: true, heights: [10, 20], distinct: 2 }), '/x'))
      .not.toBeNull()
  })

  it('fires when the budget simply ran out, and says which of the two it was', () => {
    const message = unsettledMessage(
      report({ settled: false, oscillated: false, heights: [100, 200, 300], distinct: 3, waitedMs: 15_000 }),
      '/x',
    )
    expect(message).toContain('100, 200 and 300')
    expect(message).toContain('still moving when the wait ran out')
    expect(message).not.toContain('came BACK')
  })

  it('says so rather than lying when the sample list was capped', () => {
    const message = unsettledMessage(
      report({ settled: false, heights: [1, 2], distinct: 40, waitedMs: 15_000 }),
      '/x',
    )
    expect(message).toContain('and 38 more')
  })

  it('is wired into the visual suite at the shutter, and throws there', () => {
    const src = readFileSync(join(process.cwd(), 'test/e2e/visual.spec.ts'), 'utf8')
    expect(src).toContain('unsettledMessage(settleReport, label)')
    expect(src).toContain('throw new Error(unsettled)')
    // AFTER settle(), or it would be reading a report that does not exist yet; and BEFORE the
    // shutter, or the opaque screenshot timeout has already happened.
    expect(src.indexOf('await settle(page)')).toBeLessThan(src.indexOf('unsettledMessage(settleReport, label)'))
    expect(src.indexOf('unsettledMessage(settleReport, label)')).toBeLessThan(src.indexOf('await expect(page).toHaveScreenshot('))
    // 🔴 And it must stay OFF the viewportOnly surfaces: /feed is an infinite stream that
    // deliberately never settles, and gating it here would fail four green captures on day one.
    expect(src).toContain('surface.viewportOnly')
    expect(src).toContain("type: 'unsettled-height'")
  })

  it('settleHeight still reports instead of asserting, and still never touches the page', () => {
    const src = readFileSync(join(process.cwd(), 'test/e2e/surfaces.ts'), 'utf8')
    const helper = src.slice(src.indexOf('async function settleHeight'), src.indexOf('function seconds('))
    expect(helper.length).toBeGreaterThan(0)
    // The observation-only rule (the 🔴 scroll-pass note in settle()): a scroll pass here cost
    // 46 passing tests once, and the report must not have bought it back by another name.
    // The element pass added reads — getBoundingClientRect, getComputedStyle, textContent — and
    // this list is what keeps it to reads. `getComputedStyle` itself is ALLOWED and is used: it
    // is a read. `.style.` and `classList` are the write halves of the same idea, and either one
    // would repaint the page under the camera.
    //
    // Comments are stripped first, or the 🔴 note that tells the next person NOT to write to
    // `classList` would itself fail this test — and the fix for that would be to delete the
    // warning, which is precisely backwards.
    const code = helper.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ')
    for (const forbidden of [
      'scrollTo',
      'scrollIntoView',
      'scrollBy',
      'window.scroll',
      'click(',
      'focus(',
      '.style.',
      'classList',
      'setAttribute',
      'requestFullscreen',
    ]) {
      expect(code, `settleHeight must not change the page (${forbidden})`).not.toContain(forbidden)
    }
    // POSITIVE CONTROL for the stripper: it must not have blanked the body it is scanning.
    expect(code).toContain('getComputedStyle(kid).position')
    // And the cost guard: the tree is walked only on a page that has ALREADY flipped, so a
    // surface that settles normally pays nothing beyond the height polling it always paid.
    expect(code).toContain('if (oscillated && !diffed)')
    // It reports; the throw lives at the shutter where the surface is named.
    expect(helper).not.toContain('throw ')
  })
})
// ── WHICH BOX MADE THE CHANGE, out of the whole ancestor chain that carried it ────────────
//
// The raw in-page diff reports every element whose height differs between the two plateaus,
// which on a real page means html, body, the shell, main, the column, the section AND the one
// box that actually changed — all with the same delta. A message that prints that list is no
// better than the one that printed only two numbers. This is the rule that reduces it.
describe('smallestEnclosing: the box that made the change, not the ones carrying it', () => {
  const box = (path: string, from: number, to: number, desc = path): MovedBox => ({
    path,
    desc,
    from,
    to,
    delta: to - from,
  })

  it('drops a whole ancestor chain and keeps the one box that grew', () => {
    // The /admin/qr shape: five levels each +55.25, one inner box that went 80.75 → 136.
    const kept = smallestEnclosing([
      box('body>div[0]', 14400, 14455.25, 'div#shell'),
      box('body>div[0]>main[0]', 14300, 14355.25, 'main#main'),
      box('body>div[0]>main[0]>section[1]', 200, 255.25, 'section.rounded-2xl'),
      box('body>div[0]>main[0]>section[1]>div[1]', 80.75, 136, 'div.mt-4.h-28 "Daily scans"'),
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0]!.desc).toBe('div.mt-4.h-28 "Daily scans"')
    expect(kept[0]!.from).toBe(80.75)
    expect(kept[0]!.to).toBe(136)
  })

  it('handles the BRANCH SWAP, where one node leaves and a taller one takes its place', () => {
    // Different nodes at the same position, so neither child\'s delta equals the parent\'s; only
    // the SUM of the two explains it. This is the shape the qr empty state had.
    const kept = smallestEnclosing([
      box('body>div[0]', 14400, 14456.75, 'div#shell'),
      box('body>div[0]>p[1]', 55.25, 0, 'p.text-meta "No scans yet"'),
      box('body>div[0]>div[1]', 0, 112, 'div.mt-4.h-28 "Daily scans"'),
    ])
    expect(kept.map((k) => k.desc)).toEqual([
      'p.text-meta "No scans yet"',
      'div.mt-4.h-28 "Daily scans"',
    ])
    // 🔴 The shell is the ancestor CARRYING both, and dropping it is the whole point: with it
    // present the cap of three would have spent a third of the message on `div#shell`.
    expect(kept.some((k) => k.desc === 'div#shell')).toBe(false)
  })

  it('KEEPS an ancestor whose delta its children do not explain', () => {
    // A parent that grew 100 with only a 20px child inside it changed on its own account — its
    // own padding, gap or min-height. Dropping it would hide the real mover.
    const kept = smallestEnclosing([
      box('body>div[0]', 100, 200, 'div.parent'),
      box('body>div[0]>span[0]', 10, 30, 'span.child'),
    ])
    expect(kept.map((k) => k.desc)).toContain('div.parent')
  })

  it('reports the deepest first and caps the list', () => {
    const kept = smallestEnclosing(
      [
        box('body>a[0]', 1, 50),
        box('body>a[0]>b[0]>c[0]', 1, 90),
        box('body>x[1]', 1, 20),
        box('body>y[2]', 1, 30),
      ],
      2,
    )
    expect(kept).toHaveLength(2)
    expect(kept[0]!.path).toBe('body>a[0]>b[0]>c[0]')
  })

  it('NEGATIVE CONTROL: nothing moved, nothing named', () => {
    expect(smallestEnclosing([])).toEqual([])
  })

  it('does not mistake a SIBLING for a descendant on a shared path prefix', () => {
    // `body>div[1]` is not inside `body>div[1]0`, and a naive startsWith without the `>` would
    // say it was. Path prefixes are only containment at a separator.
    const kept = smallestEnclosing([box('body>div[1]', 10, 60), box('body>div[10]', 10, 60)])
    expect(kept).toHaveLength(2)
  })
})
// ── THE FLIP THAT ONLY HAPPENS WHILE THE SHUTTER IS OPEN (PR #2878, 2026-09-23) ──────────
//
// The height gate above measures the page at 390×844 and, on this surface, correctly found
// nothing: /admin/qr really is still at that viewport. `toHaveScreenshot` then flipped it
// 14521 ↔ 14567 by capturing past the viewport, and Playwright reported a bare timeout with
// the two heights buried in its call log. These are the pieces that turn that log into the
// same actionable message.
describe('capture-induced height flip: reading it out of Playwright own failure', () => {
  // 🔴 THE REAL LOG, pasted from the PR #2878 run. Testing the parser against invented
  // wording would prove only that the parser matches the invention.
  const REAL_LOG = [
    'Error: Timed out 5000ms waiting for expect(locator).toHaveScreenshot(expected)',
    '',
    'Call log:',
    '  - Expect "toHaveScreenshot" with timeout 5000ms',
    '    - taking page screenshot',
    '    - Expected an image 390px by 14521px, received 390px by 14567px.',
    '    - waiting 100ms before taking screenshot',
    '    - taking page screenshot',
    '    - Expected an image 390px by 14567px, received 390px by 14521px.',
    '    - waiting 250ms before taking screenshot',
    '    - Timeout 5000ms exceeded.',
  ].join('\n')

  it('reads BOTH heights out of the real call log', () => {
    expect(capturedHeights(REAL_LOG)).toEqual([14521, 14567])
  })

  it('NEGATIVE CONTROL: an ordinary pixel diff names one height and must not be claimed', () => {
    // This is the message for a real visual regression. Speaking for it would relabel every
    // genuine baseline diff on the suite as a viewport bug.
    const pixelDiff = [
      'Error: expect(page).toHaveScreenshot(admin-qr--dawn-light.png)',
      '',
      '  28139 pixels (ratio 0.01 of all image pixels) are different.',
      '  Expected an image 390px by 14521px, received 390px by 14521px.',
    ].join('\n')
    expect(capturedHeights(pixelDiff)).toEqual([14521])
    expect(capturedHeights('no images here at all')).toEqual([])
  })

  it('names the heights, the spread, and the boxes tied to the viewport', () => {
    const boxes: ViewportBox[] = [
      {
        path: 'body>div[0]>div[3]>div[0]>div[0]',
        desc: 'div.mx-auto.flex',
        rule: 'min-height: calc(100vh - 3.5rem)',
        height: 14415.5,
      },
    ]
    const message = captureFlipMessage('/admin/qr [dawn-light \u00b7 mobile]', [14521, 14567], boxes)
    expect(message).toContain('changed height DURING capture: 14521 and 14567, a 46px difference')
    expect(message).toContain('div.mx-auto.flex { min-height: calc(100vh - 3.5rem) } currently 14415.5px')
    // 🔴 It must explain the SILENCE, because "why did settle() not catch this" is the first
    // question anybody reading it will ask, and the answer is the finding itself.
    expect(message).toContain('INDUCED BY THE CAMERA')
  })

  it('says what to look at instead when no such box is in the stylesheets', () => {
    const message = captureFlipMessage('/admin/qr', [14521, 14567], [])
    expect(message).toContain('innerHeight')
    expect(message).not.toContain('Boxes on this surface')
  })

  it('is wired around the shutter, and leaves other failures alone', () => {
    const src = readFileSync(join(process.cwd(), 'test/e2e/visual.spec.ts'), 'utf8')
    expect(src).toContain('await explainCaptureFailure(page, error, label)')
    // The try must WRAP toHaveScreenshot, or the failure never reaches the diagnosis.
    expect(src.indexOf('try {')).toBeLessThan(src.indexOf('await expect(page).toHaveScreenshot('))
    expect(src.indexOf('await expect(page).toHaveScreenshot(')).toBeLessThan(
      src.indexOf('await explainCaptureFailure(page, error, label)'),
    )
  })

  it('the CSSOM scan is observation only, like the height wait', () => {
    const src = readFileSync(join(process.cwd(), 'test/e2e/surfaces.ts'), 'utf8')
    const helper = src.slice(
      src.indexOf('export async function viewportDependentBoxes'),
      src.indexOf('export function capturedHeights'),
    )
    expect(helper.length).toBeGreaterThan(0)
    const code = helper.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ')
    // 🔴 `setViewportSize` is the one that matters here. Resizing the page to reproduce what
    // the camera does would MUTATE it and would not revert, and taking a throwaway fullPage
    // screenshot to induce the condition is the camera firing early — the lazy-content hazard
    // the scroll-pass note in settle() records. This helper reads the CSSOM instead.
    for (const forbidden of [
      'setViewportSize',
      'screenshot(',
      'scrollTo',
      'scrollIntoView',
      'scrollBy',
      'click(',
      'classList',
      'setAttribute',
      'insertRule',
      'deleteRule',
      '.style.setProperty',
      '.style.removeProperty',
      '.style.cssText',
    ]) {
      expect(code, `viewportDependentBoxes must not change the page (${forbidden})`).not.toContain(
        forbidden,
      )
    }
    // 🔴 `.style.` cannot be banned outright HERE the way it is in the height wait, because
    // reading a rule\'s declarations is the entire job: `styleRule.style.getPropertyValue(...)`.
    // So the ban is on the WRITE forms above, plus assignment, which is the one that would
    // actually restyle the page under the camera.
    expect(code, 'no assignment to a style property').not.toMatch(/\.style\.[A-Za-z]+\s*=[^=]/)
    expect(code, 'the declarations are READ, which is the point').toContain('getPropertyValue')
    // POSITIVE CONTROL for the stripper.
    expect(code).toContain('document.styleSheets')
  })
})

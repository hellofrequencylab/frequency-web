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
import { operatorLandedElsewhere, ROLE_FLOOR_MARKER } from './surfaces'

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

  it('e2e.yml: both suite steps read both ratchets, from either tab', () => {
    const steps = suiteSteps(prGate)
    expect(steps).toHaveLength(2) // Smoke + a11y suite, Visual compare
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

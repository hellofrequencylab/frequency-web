// ADR-949: a guard is not trusted until it has been OBSERVED failing. This one exists to
// announce a silence, so the test that matters most is the negative control — a run that did
// photograph the shell must NOT be able to print the partial banner. Without that, the banner
// is decoration that reads like evidence.
import { describe, expect, it } from 'vitest'
import {
  renderShellCoverage,
  summarizeShellCoverage,
  type ShellObservation,
} from './shell-coverage'

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

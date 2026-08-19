// Non-triviality tests for the two one-list guards (ADR-1043).
//
// WHY THESE EXIST AND WHAT THEY ASSERT. A guard that only ever passes is this repo's named failure
// mode — `check:research-freshness` was described as a working advisory gate by four documents while
// running in no workflow and being structurally unable to fail (ADR-1011). So these tests do not
// check that the guards pass on the real tree, which proves almost nothing. They build deliberately
// broken fixtures and assert each guard FAILS, arm by arm.
//
// Both guards are CLIs with top-level side effects, so they are spawned as subprocesses against a
// fixture cwd rather than imported — the same technique `pixel-paths.test.ts` uses, and for the same
// reason: the thing under test is the exit code a workflow will read.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ROOT = process.cwd()
const BACKLOG_GUARD = path.join(ROOT, 'scripts/check-backlog.mjs')
const ONE_LIST_GUARD = path.join(ROOT, 'scripts/check-one-list.mjs')

/** Run a guard in `cwd`. Returns its exit code plus combined output. */
/** CPU milliseconds burned by this process's REAPED CHILDREN so far, or null where that cannot be
 *  read honestly (anything but Linux).
 *
 *  `/proc/self/stat` fields 15 and 16 (1-based) are cutime and cstime: the user and system time of
 *  children that have been waited for. execFileSync waits, so every probe the guard spawns lands
 *  here. That is the quantity a "did a probe get expensive?" gate wants, and unlike elapsed time it
 *  does not move when the box is busy.
 *
 *  Returns null rather than guessing: a gate that cannot measure on a platform should say nothing
 *  there. */
function childCpuMs(): number | null {
  if (process.platform !== 'linux') return null
  try {
    const stat = readFileSync('/proc/self/stat', 'utf8')
    // comm can contain spaces and parentheses, so fields are counted from the LAST ')'.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const cutime = Number(fields[13])
    const cstime = Number(fields[14])
    if (!Number.isFinite(cutime) || !Number.isFinite(cstime)) return null
    let tick = 100 // USER_HZ, 100 on every mainstream Linux; only scales the reading if wrong.
    try {
      const got = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim())
      if (Number.isFinite(got) && got > 0) tick = got
    } catch {
      /* keep the default */
    }
    return ((cutime + cstime) / tick) * 1000
  } catch {
    return null
  }
}

function run(guard: string, cwd: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [guard], { cwd, encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, out }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/** Resolve a binary from PATH without shelling out. The first version ran `command -v` and then
 *  `ln -sf`, which builds shell commands out of absolute paths CodeQL is right to flag — and which
 *  is a small instance of the very dependency this file exists to pin. */
function whichSync(bin: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, bin)
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      /* not in this directory */
    }
  }
  return null
}

/** The guard has a MIN_ENTRIES floor of 40, so every fixture needs ballast. Parked rows are never
 *  probed, which makes them the correct filler: they cannot accidentally satisfy an assertion. */
function ballast(n = 45) {
  return Array.from({ length: n }, (_, i) => ({
    id: `FILL-${String(i).padStart(3, '0')}`,
    title: `filler ${i}`,
    status: 'parked',
    lane: 'deferred',
    size: 'S',
    verify: { kind: 'manual', evidence: 'fixture', checked: '2026-08-17' },
  }))
}

function writeBacklog(dir: string, entries: unknown[]) {
  mkdirSync(path.join(dir, 'docs'), { recursive: true })
  writeFileSync(path.join(dir, 'docs/BUILD-BACKLOG.json'), JSON.stringify({ meta: {}, entries }, null, 2))
}

describe('check:backlog — the probe/status contract', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'backlog-'))
    mkdirSync(path.join(dir, 'src'), { recursive: true })
    writeFileSync(path.join(dir, 'src/present.ts'), 'export const SENTINEL_TOKEN = 1\n')
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('FAILS when a row is open but its probe says the work is done', () => {
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'STALE-1',
        title: 'a row nobody closed',
        status: 'open',
        lane: 'live',
        size: 'S',
        verify: { kind: 'grep-present', pattern: 'SENTINEL_TOKEN', paths: ['src/present.ts'] },
      },
    ])
    const { code, out } = run(BACKLOG_GUARD, dir)
    expect(code).toBe(1)
    expect(out).toContain('STALE-1')
    expect(out).toContain('says OPEN, tree says DONE')
  })

  it('FAILS the other way too: a row marked done whose probe no longer passes', () => {
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'REGRESSED-1',
        title: 'a row closed on a promise',
        status: 'done',
        lane: 'live',
        size: 'S',
        verify: { kind: 'grep-present', pattern: 'NEVER_APPEARS_ANYWHERE', paths: ['src/present.ts'] },
      },
    ])
    const { code, out } = run(BACKLOG_GUARD, dir)
    expect(code).toBe(1)
    expect(out).toContain('REGRESSED-1')
    expect(out).toContain('says DONE, tree says NOT DONE')
  })

  it('PASSES when status and probe agree in both directions', () => {
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'HONEST-OPEN',
        title: 'genuinely not done',
        status: 'open',
        lane: 'live',
        size: 'S',
        verify: { kind: 'grep-present', pattern: 'NEVER_APPEARS_ANYWHERE', paths: ['src/present.ts'] },
      },
      {
        id: 'HONEST-DONE',
        title: 'genuinely done',
        status: 'done',
        lane: 'live',
        size: 'S',
        verify: { kind: 'grep-present', pattern: 'SENTINEL_TOKEN', paths: ['src/present.ts'] },
      },
    ])
    expect(run(BACKLOG_GUARD, dir).code).toBe(0)
  })

  it('FAILS on a duplicate id, because two rows sharing an id means one is unreachable', () => {
    writeBacklog(dir, [
      ...ballast(),
      { id: 'DUPE', title: 'a', status: 'parked', lane: 'live', verify: { kind: 'manual', evidence: 'x', checked: '2026-08-17' } },
      { id: 'DUPE', title: 'b', status: 'parked', lane: 'live', verify: { kind: 'manual', evidence: 'x', checked: '2026-08-17' } },
    ])
    const { code, out } = run(BACKLOG_GUARD, dir)
    expect(code).toBe(1)
    expect(out).toContain('duplicate id')
  })

  it('FAILS a row with no verify block — every row states how it will be proven', () => {
    writeBacklog(dir, [...ballast(), { id: 'NOPROBE', title: 'unprovable', status: 'open', lane: 'live' }])
    const { code, out } = run(BACKLOG_GUARD, dir)
    expect(code).toBe(1)
    expect(out).toContain('no verify block')
  })

  it('FAILS a truncated file rather than printing a ✓ over nothing (ADR-962)', () => {
    writeBacklog(dir, [
      { id: 'ONLY', title: 'lonely', status: 'parked', lane: 'live', verify: { kind: 'manual', evidence: 'x', checked: '2026-08-17' } },
    ])
    const { code, out } = run(BACKLOG_GUARD, dir)
    expect(code).toBe(1)
    expect(out).toContain('looks truncated')
  })

  it('does NOT fail a stale manual row — it warns (ADR-970)', () => {
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'ANCIENT',
        title: 'a human decision nobody revisited',
        status: 'open',
        lane: 'owner',
        size: 'S',
        verify: { kind: 'manual', evidence: 'checked once, long ago', checked: '2020-01-01' },
      },
    ])
    const { code, out } = run(BACKLOG_GUARD, dir)
    expect(code, 'a recruiting decision must never be able to red the build').toBe(0)
    expect(out).toContain('ANCIENT')
    expect(out).toMatch(/manual row\(s\) with evidence older than/)
  })

  it('does not probe parked rows at all', () => {
    // A parked row whose probe WOULD pass must not be reported: "you could do this now" is true of
    // everything parked and therefore says nothing.
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'PARKED-PASSES',
        title: 'parked, and its probe would pass',
        status: 'parked',
        lane: 'deferred',
        size: 'S',
        verify: { kind: 'grep-present', pattern: 'SENTINEL_TOKEN', paths: ['src/present.ts'] },
      },
    ])
    expect(run(BACKLOG_GUARD, dir).code).toBe(0)
  })
})

describe('check:one-list — the frozen planning-doc set', () => {
  let dir: string

  beforeAll(() => {
    // The guard enumerates via `git ls-files`, so the fixture must be a real repo.
    dir = mkdtempSync(path.join(tmpdir(), 'onelist-'))
    mkdirSync(path.join(dir, 'docs'), { recursive: true })
    mkdirSync(path.join(dir, 'scripts'), { recursive: true })
    // A planning-shaped doc that DOES declare where its status lives.
    writeFileSync(path.join(dir, 'docs/SOME-PLAN.md'), '# Some plan\n\n> Status lives in docs/BUILD-BACKLOG.json.\n')
    const allow = ['# fixture allowlist', ...Array.from({ length: 45 }, (_, i) => `docs/FILLER-${i}-PLAN.md`), 'docs/SOME-PLAN.md']
    for (let i = 0; i < 45; i++) {
      writeFileSync(path.join(dir, `docs/FILLER-${i}-PLAN.md`), '# Filler\n\n> SUPERSEDED — history.\n')
    }
    writeFileSync(path.join(dir, 'scripts/planning-docs.txt'), allow.join('\n') + '\n')
    execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm fixture', { cwd: dir })
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('PASSES when the set matches and every doc declares its status source', () => {
    expect(run(ONE_LIST_GUARD, dir).code).toBe(0)
  })

  it('FAILS when a new planning doc appears outside the frozen set', () => {
    writeFileSync(path.join(dir, 'docs/SNEAKY-ROADMAP.md'), '# Sneaky\n\n> SUPERSEDED\n')
    execSync('git add -A', { cwd: dir })
    const { code, out } = run(ONE_LIST_GUARD, dir)
    rmSync(path.join(dir, 'docs/SNEAKY-ROADMAP.md'))
    execSync('git add -A', { cwd: dir })
    expect(code).toBe(1)
    expect(out).toContain('A NEW PLANNING DOC')
    expect(out).toContain('SNEAKY-ROADMAP.md')
  })

  it('FAILS a planning doc that does not say whether it is live or history', () => {
    writeFileSync(path.join(dir, 'docs/SOME-PLAN.md'), '# Some plan\n\nNo banner at all.\n')
    execSync('git add -A', { cwd: dir })
    const { code, out } = run(ONE_LIST_GUARD, dir)
    writeFileSync(path.join(dir, 'docs/SOME-PLAN.md'), '# Some plan\n\n> Status lives in docs/BUILD-BACKLOG.json.\n')
    execSync('git add -A', { cwd: dir })
    expect(code).toBe(1)
    expect(out).toContain('DO NOT SAY WHERE THEIR STATUS LIVES')
  })

  it('FAILS a truncated allowlist rather than silently permitting everything', () => {
    const real = path.join(dir, 'scripts/planning-docs.txt')
    const saved = readFileSync(real, 'utf8')
    writeFileSync(real, '# too short\ndocs/SOME-PLAN.md\n')
    const { code, out } = run(ONE_LIST_GUARD, dir)
    writeFileSync(real, saved)
    expect(code).toBe(1)
    expect(out).toContain('looks truncated')
  })
})

describe('a cmd probe that could not run is not a verdict', () => {
  // 🔴 THE REGRESSION THIS PINS — the ripgrep bug's mirror image, one probe kind over. The first
  // version ran the command in a try/catch and returned NOT DONE for anything that threw. But
  // "exited 1" and "was SIGKILLed by the OOM killer" and "the binary does not exist" are three
  // different facts, and only the first is an answer. Folding them together means a `done` row
  // whose probe got killed reads as a REGRESSION and fails the build — a confident accusation
  // against healthy code. It happened: a tsc probe killed by a concurrent `next build` made this
  // file's own ripgrep-parity test disagree with itself.
  //
  // A row that stays open is not the safe direction either. `check:backlog` fails BOTH ways by
  // design, so an unaskable probe has to land on "cannot tell" — counted as unprovable, never
  // converted into a claim about the tree.
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cmdprobe-'))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  // `kill -9 $$` makes the shell kill itself, so spawnSync reports signal SIGKILL with a null exit
  // status — the same shape the OOM killer produces, without needing to exhaust memory to get it.
  // The missing binary yields the shell's own 127.
  for (const [label, cmd] of [
    ['killed by a signal', 'kill -9 $$'],
    ['a command that does not exist', 'frequency-no-such-binary-8f3a1c'],
  ] as const) {
    it(`does not call a done row regressed when its probe was ${label}`, () => {
      writeBacklog(dir, [
        ...ballast(),
        {
          id: 'CMD-001',
          title: 'a row whose probe cannot be asked right now',
          status: 'done',
          lane: 'hygiene',
          size: 'S',
          verify: { kind: 'cmd', cmd },
        },
      ])
      const r = run(BACKLOG_GUARD, dir)
      expect(
        r.code,
        `An unaskable probe was converted into a verdict against a healthy row.\n${r.out}`,
      ).toBe(0)
      expect(r.out).not.toContain('CMD-001')
    })
  }

  it('lets a probe declare its own indeterminacy with exit 79', () => {
    // The engine can see a probe killed by a signal. It CANNOT see a probe whose own child was
    // killed — that arrives as the probe exiting non-zero, identical in shape to a real verdict.
    // LIVE-021's probe spawns tsc, so this is not hypothetical. Any probe that spawns something
    // reports indeterminacy itself, and 79 is the word for it.
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'CMD-003',
        title: 'a probe whose own child died',
        status: 'done',
        lane: 'hygiene',
        size: 'S',
        verify: { kind: 'cmd', cmd: `node -e "const{spawnSync}=require('child_process');const r=spawnSync('sh',['-c','kill -9 $$']);process.exit(r.signal!==null?79:0)"` },
      },
    ])
    const r = run(BACKLOG_GUARD, dir)
    expect(r.code, `exit 79 was treated as a verdict rather than a shrug.\n${r.out}`).toBe(0)
    expect(r.out).not.toContain('CMD-003')
  })

  it('still calls a done row regressed when its probe genuinely exits non-zero', () => {
    // The other half: making "cannot tell" cheap must not make the gate unable to fire. `exit 1` is
    // a real answer and has to keep failing the build, or the fix above would be a hole.
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'CMD-002',
        title: 'a row whose probe was asked and said no',
        status: 'done',
        lane: 'hygiene',
        size: 'S',
        verify: { kind: 'cmd', cmd: 'exit 1' },
      },
    ])
    const r = run(BACKLOG_GUARD, dir)
    expect(r.code).toBe(1)
    expect(r.out).toContain('CMD-002')
  })
})

describe('the probe engine does not depend on ambient tooling', () => {
  // 🔴 THE REGRESSION THIS PINS. The first version searched by shelling out to `rg`, which exists on
  // this repo's dev machines and NOT on the GitHub runner — and it caught the spawn failure the same
  // way it caught "no match". On CI every probe inverted at once: all six `grep-absent` rows reported
  // DONE and both `grep-present` rows reported NOT DONE. Eight confident wrong answers from one
  // missing binary, while the local run stayed green.
  //
  // The assertion is deliberately a COMPARISON rather than a fixed expectation: the guard must give
  // the SAME answer with and without ripgrep on PATH. That holds no matter how the backlog changes.
  // ⏱️ TIMEOUT, and why it is not the default 30s. This test runs the WHOLE guard twice — once with
  // ripgrep on PATH and once without. The guard costs ~6s (measured 2026-08-17, down from 23.9s: ten
  // closed rows carried a probe that spawned a vitest run to prove its consequence, and each now
  // measures the same consequence in-process instead). ~13s of real work, 60s of budget — headroom
  // for a loaded runner, without the allowance itself becoming the place a regression hides. That is
  // what GUARD_BUDGET_CPU_MS below is for: the timeout catches a hang, the budget catches a creep.
  it('gives identical results with and without ripgrep on PATH', { timeout: 60_000 }, () => {
    const stub = mkdtempSync(path.join(tmpdir(), 'nopath-'))
    // Everything a probe legitimately needs (node, git, a shell) — but deliberately not `rg`.
    for (const bin of ['node', 'git', 'sh', 'bash', 'env']) {
      const real = whichSync(bin)
      if (real) symlinkSync(real, path.join(stub, bin))
    }

    const cpuBefore = childCpuMs()
    const startedAt = Date.now()
    const withRg = run(BACKLOG_GUARD, ROOT)
    const guardWallMs = Date.now() - startedAt
    const cpuAfter = childCpuMs()
    const guardCpuMs = cpuBefore === null || cpuAfter === null ? null : cpuAfter - cpuBefore
    const withoutRg = (() => {
      try {
        const out = execFileSync('node', [BACKLOG_GUARD], {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: 'pipe',
          env: { ...process.env, PATH: stub },
        })
        return { code: 0, out }
      } catch (err) {
        const e = err as { status?: number; stdout?: string; stderr?: string }
        return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
      }
    })()

    rmSync(stub, { recursive: true, force: true })

    expect(
      withoutRg.code,
      `The guard changed its verdict when ripgrep left PATH (with: ${withRg.code}, without: ${withoutRg.code}).\n` +
        `A probe that cannot tell "I looked and found nothing" from "I could not look" reports\n` +
        `confident nonsense on any runner missing the tool. Search in pure node.\n\n${withoutRg.out}`,
    ).toBe(withRg.code)

    // Same verdict AND same counts — a matching exit code alone could hide compensating errors.
    const counts = (s: string) => s.match(/\d+ open\/blocked · \d+ parked · \d+ done/)?.[0]
    expect(counts(withoutRg.out)).toBe(counts(withRg.out))

    // ⏱️ THE WALL-CLOCK CEILING (LIVE-034), and why it lives here rather than in a probe.
    //
    // The guard reached 23.9s because ten closed rows each proved their consequence by spawning a
    // vitest run — honest, and +2s per row closed the same way, with 39 rows still open. LIVE-034's
    // first probe measured that by TIMING check:backlog, which meant running check:backlog: it
    // re-entered itself (55 orphaned processes were counted before it was fenced) and, even fenced,
    // doubled the cost of every invocation forever to report the cost of one.
    //
    // So the row probes the CAUSE in milliseconds — no `verify.cmd` may spawn a test runner — and the
    // CONSEQUENCE is measured here, where the guard is already being run twice for an unrelated
    // reason and the measurement is therefore free. A probe that starts costing seconds without
    // naming a test runner still shows up, as this assertion, instead of disappearing into the
    // 60s timeout as a slightly slower green.
    // 🔴 THE CLOCK IS CPU TIME, NOT ELAPSED TIME (LIVE-047), and the difference is the whole point.
    //
    // This assertion used to time the guard's WALL CLOCK from inside a suite that is at that moment
    // running 838 test files across 4 cores. What it read was CONTENTION, and contention is not a
    // property of any probe. It fired once on 2026-08-18 at 23.8s; the same tree measured 13.4s
    // unloaded, and the three probes added that day cost 110 ms between them. Its message then sent
    // the next reader hunting for expensive work that did not exist — on the one gate whose whole job
    // is telling a real regression from a noisy one.
    //
    // Measured on a 4-core box, 2026-08-19, with and without six spinning cores:
    //
    //             unloaded          6 spinners on 4 cores
    //   wall      9.26s / 9.61s     18.57s / 17.29s      <- nearly doubles
    //   childCPU  12.04s / 12.54s   12.50s / 12.11s      <- flat, within 4%
    //
    // 18.6s of wall against a 20s ceiling is exactly how a green tree failed. CPU does not move.
    //
    // WHY cutime/cstime AND NOT process.cpuUsage(): the guard spawns ~60 probe subprocesses and they
    // are where the cost lives. `process.cpuUsage()` reports only THIS process, which is asleep in
    // execFileSync the whole time. `/proc/self/stat`'s cutime+cstime are the CPU of REAPED CHILDREN,
    // so they capture the guard and every probe it ran, and nothing else this suite is doing.
    //
    // Linux-only, so it degrades to SKIPPING rather than to the wall clock. Asserting the wrong
    // quantity elsewhere is what produced the false failure in the first place; a gate that cannot
    // measure honestly on a platform should say nothing there (ADR-970).
    const GUARD_BUDGET_CPU_MS = 20_000
    if (guardCpuMs === null) {
      expect(guardWallMs, 'the guard should at least finish inside its own 60s timeout').toBeLessThan(60_000)
    } else {
      expect(
        guardCpuMs,
        `check:backlog burned ${(guardCpuMs / 1000).toFixed(1)}s of CPU, over its ${GUARD_BUDGET_CPU_MS / 1000}s budget.\n` +
          `(Wall clock was ${(guardWallMs / 1000).toFixed(1)}s, which is load-dependent and NOT what this asserts.)\n` +
          'Something added expensive work to a probe. Find it, and measure that consequence in-process\n' +
          'rather than by spawning a suite — see LIVE-034 in docs/BUILD-BACKLOG.json for the nine rows\n' +
          'that were converted and the pattern each used. Raising this number is not the fix.',
      ).toBeLessThan(GUARD_BUDGET_CPU_MS)
    }
  })
})

describe('the real tree', () => {
  it('satisfies both contracts', () => {
    expect(run(BACKLOG_GUARD, ROOT).code, 'pnpm check:backlog').toBe(0)
    expect(run(ONE_LIST_GUARD, ROOT).code, 'pnpm check:one-list').toBe(0)
  })

  it('keeps every backlog source pointing at a file that exists', () => {
    // A row whose source doc was deleted is a row that outlived its justification. The guard
    // enforces this; asserting it here as well makes the intent legible next to the fixtures.
    const doc = JSON.parse(readFileSync(path.join(ROOT, 'docs/BUILD-BACKLOG.json'), 'utf8'))
    const missing = doc.entries
      .filter((e: { source?: { file?: string } }) => e.source?.file)
      .filter((e: { source: { file: string } }) => {
        try {
          return !statSync(path.join(ROOT, e.source.file)).isFile()
        } catch {
          return true
        }
      })
    expect(missing.map((e: { id: string }) => e.id)).toEqual([])
  })
})

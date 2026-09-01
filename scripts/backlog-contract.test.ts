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

  // LIVE-007's probe threw `SyntaxError: Unexpected token 'for'` on EVERY invocation for six
  // enrolments, because its slug list was double-quoted inside a `node -e "…"` body and the shell
  // ate the quotes. A SyntaxError exits 1, which is indistinguishable from an honest "not done",
  // so an OPEN row's broken probe AGREED with it forever and the row read as measured. The
  // runProbe fence cannot catch this: the probe RUNS fine, the program inside it is what is broken.
  it('FAILS a cmd probe carrying a bare double quote, which the shell would eat', () => {
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'EATEN',
        title: 'a probe whose quotes the shell removes',
        status: 'open',
        lane: 'live',
        verify: { kind: 'cmd', cmd: 'node -e "const need=["a","b"];process.exit(need.length?0:1)"' },
      },
    ])
    const { code, out } = run(BACKLOG_GUARD, dir)
    expect(code).toBe(1)
    expect(out).toContain('opens its node -e body with a double quote')
  })

  // ⚠️ THE HAZARD IS WHICHEVER QUOTE OPENED THE BODY. The first version of the rule counted double
  // quotes unconditionally, so it was blind to this case AND it refused the safe style below —
  // the style its own failure message recommends. SCAN-509's probe was written that way, ran
  // clean, mutation-fired on all five of its arms, and was still rejected. Both directions are
  // pinned here so neither half can be lost again.
  it('FAILS a cmd probe carrying a bare single quote inside a single-quoted body', () => {
    const sq = String.fromCharCode(39)
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'EATENSQ',
        title: 'a single-quoted probe whose inner apostrophe ends the word',
        status: 'open',
        lane: 'live',
        verify: { kind: 'cmd', cmd: `node -e ${sq}const s=${sq}x${sq};process.exit(0)${sq}` },
      },
    ])
    const { code, out } = run(BACKLOG_GUARD, dir)
    expect(code).toBe(1)
    expect(out).toContain('opens its node -e body with a single quote')
  })

  // The style the rule tells authors to use must not be the style it rejects. A single-quoted
  // body may carry as many double quotes as it likes — the shell passes the word through
  // untouched — and needs no backslashes, which is exactly why it is the safer form.
  it('does NOT fail a cmd probe using double quotes inside a single-quoted body', () => {
    const sq = String.fromCharCode(39)
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'SAFESQ',
        title: 'the recommended style',
        status: 'open',
        lane: 'live',
        verify: { kind: 'cmd', cmd: `node -e ${sq}const need=["a","b"];process.exit(1)${sq}` },
      },
    ])
    const { out } = run(BACKLOG_GUARD, dir)
    expect(out).not.toContain('opens its node -e body')
  })

  // The positive control: a BACKSLASH-escaped quote survives the shell and must NOT be refused,
  // or the rule would force a rewrite of the eleven probes that legitimately use one.
  it('does NOT fail a cmd probe whose inner quotes are backslash-escaped', () => {
    writeBacklog(dir, [
      ...ballast(),
      {
        id: 'ESCAPED',
        title: 'a probe that escapes its inner quotes',
        status: 'open',
        lane: 'live',
        verify: { kind: 'cmd', cmd: 'node -e "const s=\\"x\\";process.exit(s?1:0)"' },
      },
    ])
    const { out } = run(BACKLOG_GUARD, dir)
    expect(out).not.toContain('carries a double quote inside')
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
  // ripgrep on PATH and once without. The guard cost ~6s when this was written (2026-08-17, down
  // from 23.9s: ten closed rows carried a probe that spawned a vitest run to prove its consequence,
  // and each now measures the same consequence in-process instead), so the note here read "~13s of
  // real work, 60s of budget — headroom for a loaded runner".
  //
  // 🔴 THAT HEADROOM IS LARGELY GONE AND THE OLD NUMBER IS RETIRED. Measured 2026-09-01 on an idle
  // machine: **46.7s against the 60s timeout — 78%**, with 226 probes now running twice. Under
  // full-suite contention it EXCEEDED 60s and failed the run. Adding one probe that imported the
  // TypeScript compiler (~1.7s per pass) was enough to tip it; that probe was then made 5x cheaper
  // and the failure went away, which postpones the problem rather than fixing it.
  //
  // ⚠️ The failure mode is the worst kind: a TIMEOUT, not an assertion. It names nothing, appears
  // only under load so it does not reproduce when re-run alone, and reads exactly like a flake —
  // which this repo's own rules correctly say is never a root cause. `HYG-042` carries the fix.
  // The CPU budget below is the healthier half: a number someone can watch. The timeout is a cliff.
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
    // ── HYG-012 step 2 (ADR-1107): A PER-PROBE CEILING, AND A TOTAL THAT SCALES WITH n ────
    //
    // The flat 20s failed FOUR builds (20.2s, 20.3s, 20.6s) and every one of them was an honest
    // backlog getting longer, not a probe getting slower. A fixed total does not measure the thing
    // this assertion's own message says it cares about ("something added expensive work to a
    // PROBE") — it measures HOW MANY ROWS THE LIST HAS, so closing rows honestly walks the list
    // into its own gate. Both cheap remedies were tried and measured and both failed (memoising
    // bought nothing; only 3 of the 11 expensive probes are greps, the other 8 are computations).
    // There was no waste left to remove.
    //
    // So the shape changed rather than the number, per the owner ruling of 2026-08-21:
    //
    //   (1) NO SINGLE PROBE may exceed PER_PROBE_CEILING_MS. That is the real regression signal and
    //       it stays valid however long the list gets.
    //   (2) The TOTAL is BASE + PER_PROBE_ALLOWANCE_MS x n, so a normal new row is free and only an
    //       abnormal one trips it.
    //
    // 📐 WHERE THE CONSTANTS COME FROM — a PAIRED CI/local reading, the way PACKED_PER_RAW was
    // settled, because CPU time is load-independent (LIVE-047) but NOT hardware-independent:
    //
    //                       n     totalCpuMs   maxCpuMs (PROG-DAWN9)
    //   CI, checks job     111       8530            2150            <- 2026-08-24, run 32753212940
    //   local, 3 runs      111    7690-8560      1960-2090
    //
    // CI:local is 1.00-1.11 on this pair, so the 1.6x this row's history recorded (CI 20.2s vs a
    // contemporaneous local 12.0-13.4s) is NOT a property of today's runners. The constants are
    // still set from the CI half, and generously, because that assumption is the one that expires.
    //
    // PROBES ARE 96% OF THE GUARD. Measured locally the same day: guardCpuMs 8360/8000 against a
    // probe total of 8080/7690 — about 300ms of non-probe work (node startup, the tree walk the
    // in-process kinds share). That is why a budget built from the probe reading can be asserted
    // against guardCpuMs at all, and why BASE is 2s rather than 300ms: it is the half NOT covered
    // by the per-probe reading, so it gets the loose end of the estimate.
    const PER_PROBE_CEILING_MS = 4_500 // 2.1x the worst CI probe (2150ms), 2.3x the worst local
    const BASE_CPU_MS = 2_000 // ~7x the measured 300ms of non-probe work
    const PER_PROBE_ALLOWANCE_MS = 180 // 2.3x the 77ms CI average; at n=111 the total is 22.0s

    // 🔎 THE LINE THIS ASSERTION IS BUILT FROM, PRINTED ON EVERY RUN — INCLUDING GREEN ONES.
    // A number that only prints on FAILURE cannot be read BEFORE the gate is set from it, and
    // AGENTS.md is explicit that a build-blocking gate which has never seen a real reading is the
    // 2026-08-11 incident with the roles reversed. This is how the CI half above was obtained and
    // how the next reader re-checks it without breaking a build to do so.
    const costLine = /probe-cost: n=(\d+) totalCpuMs=(\d+) maxCpuMs=(\d+) slowest=(\S+)/.exec(withRg.out)
    const selfReported = /guard-cost: guardCpuMs=(\d+)/.exec(withRg.out)
    console.log(
      `[backlog-budget] guardCpuMs=${guardCpuMs ?? 'n/a'} guardWallMs=${guardWallMs} ${costLine?.[0] ?? 'probe-cost=MISSING'}`,
    )

    // ⚠️ A STRUCTURAL FAILURE EXITS BEFORE ANY PROBE RUNS, so there is genuinely no cost to print
    // and demanding the line here would accuse the wrong thing. This was not hypothetical: deleting
    // a row's `source.file` (OWN-037, 2026-08-24) made the guard exit structurally, and the first
    // version of this assertion reported "check:backlog stopped printing its probe-cost line" —
    // sending the reader after the instrumentation instead of the broken row. A gate whose message
    // misdirects is worse than no gate, which is the whole lesson of the wall-clock budget it
    // replaced. So: the cost assertions apply to a run that REACHED the probes, and the structural
    // failure is surfaced on its own terms.
    if (/structural problem\(s\) in/.test(withRg.out)) {
      expect(
        withRg.out,
        'check:backlog failed STRUCTURALLY, so no probe ran and the cost assertions below cannot\n' +
          'apply. Fix the row it names — most often a `source.file` that was deleted without the\n' +
          'row being re-pointed.\n\n' + withRg.out,
      ).toBe('')
    }

    // The instrumentation is itself a fail-safe, so something has to notice when it stops firing
    // (AGENTS.md: "every fail-safe needs a gate that notices it fired"). Without this, deleting the
    // probe-cost line would silently retire the per-probe ceiling and leave a green build behind.
    expect(
      costLine,
      'check:backlog stopped printing its `probe-cost:` summary line, so the per-probe ceiling below\n' +
        'has nothing to measure. Restore the line in scripts/check-backlog.mjs rather than deleting\n' +
        'this assertion — a ceiling with no reading is not a weaker gate, it is no gate.',
    ).not.toBeNull()

    const probeCount = Number(costLine![1])
    const worstProbeMs = Number(costLine![3])
    const worstProbeId = costLine![4]

    // The guard SELF-REPORTS its total cost so a green CI run publishes the number (vitest's
    // default reporter swallows the console.log above on a passing test). A self-report nobody
    // checks is the shape-not-truth failure again, so it is cross-checked here against the same
    // quantity measured from OUTSIDE the process. The band is deliberately wide — these are two
    // different vantage points on one number (2026-08-24: 8375 self vs 8650 external, ~3% apart) —
    // and it is here to catch a self-report that has come UNSTUCK, not to re-measure the guard.
    expect(
      selfReported,
      'check:backlog stopped printing its `guard-cost:` line. That line is the only reading of this\n' +
        'gate\u2019s own cost that a GREEN ci run publishes, and ADR-1107\u2019s constants were set from it.',
    ).not.toBeNull()
    if (guardCpuMs !== null && selfReported) {
      const selfMs = Number(selfReported[1])
      expect(
        selfMs,
        `The guard reported ${selfMs}ms of CPU for itself while this test measured ${Math.round(guardCpuMs)}ms\n` +
          'from outside it. Those are two views of one quantity and they have drifted apart, so the\n' +
          'number a future budget gets set from is no longer the number the budget is asserted on.\n' +
          'Fix the self-report in scripts/check-backlog.mjs rather than widening this band.',
      ).toBeGreaterThan(guardCpuMs * 0.5)
      expect(selfMs).toBeLessThan(guardCpuMs * 2)
    }

    // (1) THE PER-PROBE CEILING. This is the assertion that survives the list getting longer.
    expect(
      worstProbeMs,
      `The single probe \`${worstProbeId}\` burned ${(worstProbeMs / 1000).toFixed(2)}s of CPU, over the\n` +
        `${PER_PROBE_CEILING_MS / 1000}s per-probe ceiling. This is the signal this gate exists for: ONE probe got\n` +
        'expensive. Measure that row\u2019s consequence in-process instead of spawning a suite — see LIVE-034\n' +
        'in docs/BUILD-BACKLOG.json for the nine rows that were converted and the pattern each used.\n' +
        'Raising this ceiling is not the fix; the total below is what absorbs an honestly longer list.',
    ).toBeLessThan(PER_PROBE_CEILING_MS)

    // (2) THE COUNT-SCALED TOTAL. Adding a normal row raises the budget by more than a normal row
    // costs, so the list can grow; a round of rows that are each quietly expensive still trips it.
    const budget = BASE_CPU_MS + PER_PROBE_ALLOWANCE_MS * probeCount
    if (guardCpuMs === null) {
      expect(guardWallMs, 'the guard should at least finish inside its own 60s timeout').toBeLessThan(60_000)
    } else {
      expect(
        guardCpuMs,
        `check:backlog burned ${(guardCpuMs / 1000).toFixed(1)}s of CPU, over its ${(budget / 1000).toFixed(1)}s budget\n` +
          `(${BASE_CPU_MS / 1000}s base + ${PER_PROBE_ALLOWANCE_MS}ms x ${probeCount} probes).\n` +
          `(Wall clock was ${(guardWallMs / 1000).toFixed(1)}s, which is load-dependent and NOT what this asserts.)\n` +
          `The worst single probe was ${worstProbeId} at ${(worstProbeMs / 1000).toFixed(2)}s, under the per-probe\n` +
          'ceiling — so this is COST SPREAD ACROSS PROBES, not one bad row. Several probes got more\n' +
          'expensive together, or the guard itself did. Find it, and measure the consequence in-process\n' +
          'rather than by spawning a suite (LIVE-034). Raising these constants is not the fix: they were\n' +
          'set from a paired CI/local reading recorded in ADR-1107, and moving them needs the same.',
      ).toBeLessThan(budget)
    }
  })
})

describe('the real tree', () => {
  // ⏱️ AN EXPLICIT BUDGET, because the default 30s was never a decision — it was the default, and
  // this test outgrew it. Measured 2026-09-01: `check:backlog` 23.66s (224 probes, run serially)
  // plus `check:one-list` 0.11s = 23.8s of real work, i.e. **79% of the default** on an idle
  // machine. Under full-suite contention it exceeded 30s and failed the run, with a bare
  // "Test timed out in 30000ms" that names nothing and passes when re-run alone.
  //
  // 🔴 RAISING THIS IS NOT THE FIX, it is what makes the failure legible while the fix is done.
  // `HYG-042` carries the real one: 224 probes run SERIALLY in a `for` loop of `spawnSync`, and the
  // sibling ripgrep-parity case below runs the whole set TWICE for the same reason. This is the
  // SECOND test in this file to hit the wall; the first is documented on that case. A budget that
  // is 3.8x the measured work leaves room for a loaded runner without becoming the place a real
  // regression hides — the CPU budget printed by the guard (`guardCpuMs`) is what catches creep.
  it('satisfies both contracts', { timeout: 90_000 }, () => {
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

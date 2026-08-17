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
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ROOT = process.cwd()
const BACKLOG_GUARD = path.join(ROOT, 'scripts/check-backlog.mjs')
const ONE_LIST_GUARD = path.join(ROOT, 'scripts/check-one-list.mjs')

/** Run a guard in `cwd`. Returns its exit code plus combined output. */
function run(guard: string, cwd: string): { code: number; out: string } {
  try {
    const out = execFileSync('node', [guard], { cwd, encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, out }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
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
    const saved = execSync(`cat ${JSON.stringify(real)}`, { encoding: 'utf8' })
    writeFileSync(real, '# too short\ndocs/SOME-PLAN.md\n')
    const { code, out } = run(ONE_LIST_GUARD, dir)
    writeFileSync(real, saved)
    expect(code).toBe(1)
    expect(out).toContain('looks truncated')
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
    const doc = JSON.parse(execSync(`cat ${JSON.stringify(path.join(ROOT, 'docs/BUILD-BACKLOG.json'))}`, { encoding: 'utf8' }))
    const missing = doc.entries
      .filter((e: { source?: { file?: string } }) => e.source?.file)
      .filter((e: { source: { file: string } }) => {
        try {
          execSync(`test -f ${JSON.stringify(path.join(ROOT, e.source.file))}`)
          return false
        } catch {
          return true
        }
      })
    expect(missing.map((e: { id: string }) => e.id)).toEqual([])
  })
})

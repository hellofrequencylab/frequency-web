import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// ── THE POSITIVE CONTROL for check:workflows ───────────────────────────────────────────────────
//
// 🔴 THE FAILURE THIS CLOSES. scripts/check-workflows.mjs exists because of a step that had a
// `name` and an `if` and no `run` (2026-08-04), and its header records an audit that found the
// FIRST version missed exactly that shape whenever `if:` led the step (ADR-962). The fix was
// made and described; nothing in the repo then proved it stayed made. Until 2026-09-04 the script
// had no test sibling, so its only evidence of working was a ✓ on eleven files that happen to be
// well-formed — the same ✓ a scanner that inspected nothing would print.
//
// The guard runs its scan at import time and calls process.exit, so it is spawned as a child
// process against a fixture `.github/workflows` directory, one broken shape per test, plus the
// false positive its header names as a shape that must PASS, plus the real tree.

const ROOT = path.join(import.meta.dirname, '..')
const GUARD = path.join(ROOT, 'scripts', 'check-workflows.mjs')

/** Run the guard in `cwd`. Returns its exit code plus combined output. */
function run(cwd: string): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [GUARD], { cwd, encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, out }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

const MIN_WORKFLOWS = Number(/MIN_WORKFLOWS = (\d+)/.exec(readFileSync(GUARD, 'utf8'))?.[1])

/** A well-formed workflow: one job, two steps, one `uses` and one `run`. */
const GOOD = [
  'name: ballast',
  'on: [push]',
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v7',
  '      - name: Say hello',
  '        run: echo hello',
  '',
].join('\n')

type Fixture = { dir: string; add: (name: string, text: string) => void }

/** A fixture at the floor: exactly MIN_WORKFLOWS well-formed files, so any arm's failure is the arm. */
function makeFixture(ballast = MIN_WORKFLOWS): Fixture {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-workflows-'))
  mkdirSync(path.join(dir, '.github/workflows'), { recursive: true })
  const add = (name: string, text: string) => writeFileSync(path.join(dir, '.github/workflows', name), text)
  for (let i = 0; i < ballast; i++) add(`ballast-${i}.yml`, GOOD)
  return { dir, add }
}

function withFixture(fn: (fx: Fixture) => void, ballast?: number) {
  const fx = makeFixture(ballast)
  try { fn(fx) } finally { rmSync(fx.dir, { recursive: true, force: true }) }
}

describe('check:workflows — the arms that must FAIL', () => {
  it('the control: a fixture of well-formed files PASSES, so a failure below means the arm', () => {
    withFixture((fx) => {
      const { code, out } = run(fx.dir)
      expect(code, out).toBe(0)
      expect(out).toContain(`✓ Workflow contract: ${MIN_WORKFLOWS} workflow file(s)`)
    })
  })

  it('FAILS a step with `name` + `if` and no `run` — the 2026-08-04 incident shape', () => {
    withFixture((fx) => {
      fx.add('e2e.yml', [
        'name: e2e',
        'on: [pull_request]',
        'jobs:',
        '  e2e:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v7',
        '      - name: Run the browser suite',
        '        if: github.event_name == \'pull_request\'',
        '        env:',
        '          CI: true',
        '',
      ].join('\n'))
      const { code, out } = run(fx.dir)
      expect(code).toBe(1)
      expect(out).toContain('.github/workflows/e2e.yml:8')
      expect(out).toContain('step "Run the browser suite" has neither `run` nor `uses`')
    })
  })

  it('FAILS a runless step that OPENS with `if:` — the false negative ADR-962 recorded', () => {
    withFixture((fx) => {
      fx.add('gate.yml', [
        'name: gate',
        'on: [push]',
        'jobs:',
        '  gate:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - if: always()',
        '        id: summary',
        '        name: Summarise',
        '      - run: echo done',
        '',
      ].join('\n'))
      const { code, out } = run(fx.dir)
      expect(code).toBe(1)
      expect(out).toContain('gate.yml:7')
      expect(out).toContain('step "Summarise" has neither `run` nor `uses`')
    })
  })

  it('FAILS a duplicated key (YAML keeps the last one silently; GitHub rejects the file)', () => {
    withFixture((fx) => {
      fx.add('dupe.yml', [
        'name: dupe',
        'on: [push]',
        'permissions:',
        '  contents: read',
        'jobs:',
        '  one:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: echo a',
        'permissions:',
        '  issues: write',
        '',
      ].join('\n'))
      const { code, out } = run(fx.dir)
      expect(code).toBe(1)
      expect(out).toContain('dupe.yml:10 — duplicate key `permissions` (first seen line 3)')
    })
  })

  it('does NOT lint inside a `run: |` block scalar — a heredoc emitting YAML is a shape that must PASS', () => {
    withFixture((fx) => {
      // The false positive ADR-962 recorded: program text read as YAML. The heredoc below writes
      // a `- name:` with no `run` and a duplicate `permissions:`; both are shell output, not steps.
      fx.add('heredoc.yml', [
        'name: heredoc',
        'on: [push]',
        'jobs:',
        '  emit:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - name: Write a workflow fragment',
        '        run: |',
        '          cat > out.yml <<EOF',
        '          steps:',
        '            - name: not a real step',
        '              if: always()',
        '          permissions:',
        '            contents: read',
        '          permissions:',
        '            issues: write',
        '          EOF',
        '      - run: cat out.yml',
        '',
      ].join('\n'))
      const { code, out } = run(fx.dir)
      expect(code, out).toBe(0)
    })
  })
})

describe('check:workflows — it cannot pass over nothing', () => {
  it('FAILS below the file-count floor, naming the floor', () => {
    withFixture((fx) => {
      const { code, out } = run(fx.dir)
      expect(code).toBe(1)
      expect(out).toContain(`found ${MIN_WORKFLOWS - 1} workflow file(s), expected at least ${MIN_WORKFLOWS}`)
      expect(out).not.toContain('✓ Workflow contract')
    }, MIN_WORKFLOWS - 1)
  })

  it('FAILS when .github/workflows does not exist at all', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'check-workflows-none-'))
    try {
      const { code, out } = run(dir)
      expect(code).toBe(1)
      expect(out).toContain('.github/workflows does not exist')
      expect(out).toContain('A gate cannot pass over nothing')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('check:workflows — the tree as committed', () => {
  it('exits 0, and the floor sits below the live count, not at it', () => {
    const { code, out } = run(ROOT)
    expect(code, out).toBe(0)
    const count = Number(/✓ Workflow contract: (\d+) workflow file\(s\)/.exec(out)?.[1])
    expect(count).toBeGreaterThan(MIN_WORKFLOWS)
    // Not absurdly low either: a floor of 1 is the vacuous pass with extra steps.
    expect(MIN_WORKFLOWS).toBeGreaterThan(count / 2)
  })
})

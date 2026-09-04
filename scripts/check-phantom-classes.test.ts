import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// ── THE POSITIVE CONTROL for check:phantom ─────────────────────────────────────────────────────
//
// 🔴 THE FAILURE THIS CLOSES. scripts/check-phantom-classes.mjs carries an in-script self-check
// (`rounded-card` must emit CSS) that proves the COMPILER half works. Nothing proved the
// EXTRACTOR half had looked: a string regex that stopped matching, a root that moved, or a wrong
// cwd would each leave only the DECLARED list, and the ✓ would read "19 classes checked" with the
// same confidence it reads "270" today. And nothing outside its own header proved that a written
// phantom is actually REPORTED — the five it was born to catch were fixed the day it was written,
// so on every run since, the gate has only ever been seen passing (ADR-962).
//
// The guard compiles the real Tailwind sheet and calls process.exit, so it is spawned as a child
// process against a fixture tree that carries the REAL app/globals.css (copied) and this repo's
// node_modules (symlinked), plus one planted component. That keeps the fixture honest: the only
// thing that differs from the committed tree is the phantom, so the phantom is the only finding.

const ROOT = path.join(import.meta.dirname, '..')
const GUARD = path.join(ROOT, 'scripts', 'check-phantom-classes.mjs')

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

const MIN_CANDIDATES = Number(/MIN_CANDIDATES = (\d+)/.exec(readFileSync(GUARD, 'utf8'))?.[1])

/** The real sheet, the real compiler, and ONE component whose class strings the test chooses. */
function withFixture(componentSource: string, fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'phantom-'))
  try {
    for (const d of ['app', 'components', 'lib']) mkdirSync(path.join(dir, d))
    copyFileSync(path.join(ROOT, 'app', 'globals.css'), path.join(dir, 'app', 'globals.css'))
    symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir')
    writeFileSync(path.join(dir, 'components', 'planted.tsx'), componentSource)
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('check:phantom — the arm that must FAIL', () => {
  it('names a written class the compiler emits nothing for, and the file that wrote it', () => {
    // `bg-surface-2` is the first of the five phantoms in the script's own header (the token is
    // surface-elevated). It reads like a real class, which is the whole point of the gate.
    withFixture(
      "export function Planted() { return <div className=\"rounded-card bg-surface-2 text-body\" /> }\n",
      (dir) => {
        const { code, out } = run(dir)
        expect(code).toBe(1)
        expect(out).toContain('✗ Phantom classes: 1 class(es) are written but emit NO CSS.')
        expect(out).toContain('bg-surface-2')
        expect(out).toContain('components/planted.tsx')
        expect(out).not.toContain('rounded-card ')
      },
    )
  })

  it("catches shadcn's name for our colour — the pasted-snippet shape the header calls the tell", () => {
    withFixture(
      "export const cls = 'text-muted-foreground border-primary-border'\n",
      (dir) => {
        const { code, out } = run(dir)
        expect(code).toBe(1)
        expect(out).toContain('2 class(es) are written but emit NO CSS')
        expect(out).toContain('text-muted-foreground')
        expect(out).toContain('border-primary-border')
      },
    )
  })

  it('strips the alpha modifier, so a tinted phantom does not slip out of scope', () => {
    withFixture(
      "export const cls = 'bg-surface-2/10'\n",
      (dir) => {
        const { code, out } = run(dir)
        expect(code).toBe(1)
        expect(out).toContain('bg-surface-2')
      },
    )
  })
})

describe('check:phantom — it cannot pass over nothing', () => {
  it('FAILS a tree whose extractor found almost nothing, naming the floor — even with no phantom', () => {
    // Every class here is real, so the phantom arm is silent; only the DECLARED list plus one
    // consumer reaches the compiler. That is the shape a broken extractor produces on the real
    // tree, and it must not read as ✓.
    withFixture(
      "export const cls = 'rounded-card'\n",
      (dir) => {
        const { code, out } = run(dir)
        expect(code).toBe(1)
        expect(out).not.toContain('emit NO CSS')
        expect(out).toContain(`candidate class(es) extracted, expected at least ${MIN_CANDIDATES}`)
        expect(out).toContain('ADR-962')
        expect(out).not.toContain('✓ Phantom classes')
      },
    )
  })

  it('reports a phantom BEFORE the floor, so a small fixture can still prove the arm', () => {
    withFixture(
      "export const cls = 'border-line'\n",
      (dir) => {
        const { code, out } = run(dir)
        expect(code).toBe(1)
        expect(out).toContain('border-line')
        expect(out).not.toContain('expected at least')
      },
    )
  })
})

describe('check:phantom — the tree as committed', () => {
  it('exits 0, and the floor sits below the live reading, not at it', () => {
    const { code, out } = run(ROOT)
    expect(code, out).toBe(0)
    const count = Number(/✓ Phantom classes: (\d+) design-system class\(es\) checked/.exec(out)?.[1])
    expect(count).toBeGreaterThan(MIN_CANDIDATES)
    // Not absurdly low either: a floor of 1 is the vacuous pass with extra steps.
    expect(MIN_CANDIDATES).toBeGreaterThan(count / 2)
  })
})

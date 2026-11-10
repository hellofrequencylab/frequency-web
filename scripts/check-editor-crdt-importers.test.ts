import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The positive control for check:editor-crdt-importers: a gate that has never been seen to fire is
// a claim, not a control (ADR-962). The guard scans at import time and exits, so it is spawned
// against small fixture trees that must FAIL, one arm at a time, plus the real tree.

const ROOT = path.join(import.meta.dirname, '..')
const GUARD = path.join(ROOT, 'scripts', 'check-editor-crdt-importers.mjs')

function run(cwd: string): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync(process.execPath, [GUARD], { cwd, encoding: 'utf8', stdio: 'pipe' }) }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

function withFixture(files: Record<string, string>, fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'editor-crdt-importers-'))
  try {
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      writeFileSync(path.join(dir, rel), text)
    }
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const HOME = { 'lib/editor-crdt/node-ydoc.ts': "import * as Y from 'yjs'\nexport const x = Y\n" }

describe('check:editor-crdt-importers', () => {
  it('passes on the real tree', () => {
    const r = run(ROOT)
    expect(r.code, r.out).toBe(0)
    expect(r.out).toMatch(/modules walked/)
  })

  it('FAILS a visitor-side module that imports yjs', () => {
    withFixture({ ...HOME, 'components/site/hero.tsx': "import * as Y from 'yjs'\nexport const h = Y\n" }, dir => {
      const r = run(dir)
      expect(r.code).toBe(1)
      expect(r.out).toContain('components/site/hero.tsx')
    })
  })

  it('FAILS an import of lib/editor-crdt through the alias, a relative path and a dynamic import', () => {
    for (const body of [
      "import { x } from '@/lib/editor-crdt/node-ydoc'\n",
      "export { x } from '../../lib/editor-crdt/node-ydoc'\n",
      "export const l = () => import('@/lib/editor-crdt/provider')\n",
    ]) {
      withFixture({ ...HOME, 'app/page.tsx': body }, dir => {
        const r = run(dir)
        expect(r.code, body).toBe(1)
        expect(r.out).toContain('app/page.tsx')
      })
    }
  })

  it('does not report a type-only import, nor an allowlisted editor module', () => {
    // These small fixtures are clean of leaks but trip the size floor (79), so the assertion that
    // matters is that the arm which reports a leak (exit 1, naming the file) did NOT fire.
    withFixture({ ...HOME, 'lib/a.ts': "import type { x } from '@/lib/editor-crdt/node-ydoc'\nexport type T = typeof x\n" }, dir => {
      const r = run(dir)
      expect(r.code).toBe(79)
      expect(r.out).not.toContain('lib/a.ts')
    })
    const shell = "import { x } from '@/lib/editor-crdt/node-ydoc'\nexport const s = x\n"
    withFixture({ ...HOME, 'components/editor/shell.tsx': shell }, dir => {
      expect(run(dir).code).toBe(1) // the same file, not allowlisted: reported
    })
    withFixture({ ...HOME, 'components/editor/shell.tsx': shell, 'scripts/editor-crdt-importers.txt': '# editor only\ncomponents/editor/shell.tsx\n' }, dir => {
      const r = run(dir)
      expect(r.code).toBe(79)
      expect(r.out).not.toContain('components/editor/shell.tsx')
    })
  })

  it('refuses to pass over nothing: exit 79 when it cannot find the CRDT home', () => {
    withFixture({ 'lib/other.ts': 'export const a = 1\n' }, dir => {
      expect(run(dir).code).toBe(79)
    })
  })
})

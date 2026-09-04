import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The fixtures below PLANT an import of the service-role client so the gate can be seen to fire.
// scripts/check-admin-client.mjs is a text scan for that exact specifier, and it would otherwise
// count this test as a new RLS bypass (the frozen baseline is not a place for a fixture). The
// specifier is assembled at runtime so the ratchet's IMPORT_RE never matches this file's own source.
const ADMIN_SPEC = ['@/lib/supabase', 'admin'].join('/')

// ── THE POSITIVE CONTROL for check:client-boundary ─────────────────────────────────────────────
//
// 🔴 THE FAILURE THIS CLOSES. Until 2026-09-04 scripts/check-client-server-boundary.mjs had no test
// sibling and no non-triviality floor. It guards the one module in the repo that bypasses RLS
// (lib/supabase/admin.ts) from the browser bundle, and it had never once been SEEN to fail: its
// only evidence of working was that it printed ✓ on the real tree — which is exactly what a broken
// resolver, a wrong cwd or a renamed root would also print, with `0 client entry points` in the
// sentence and exit 0 behind it. A gate that has never fired is a claim, not a control (ADR-962).
//
// So this file drives the guard the way scripts/check-function-grants.test.ts drives its guard: as
// a child process against a fixture tree that MUST fail, one arm at a time, plus the real tree,
// plus the floors. The guard runs its whole scan at import time and calls process.exit, so it is
// spawned rather than imported; the fixtures are small on purpose, which is why the guard reports
// a leak BEFORE it applies its floors — a fixture that trips the floor must still prove the arm.

const ROOT = path.join(import.meta.dirname, '..')
const GUARD = path.join(ROOT, 'scripts', 'check-client-server-boundary.mjs')

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

type Fixture = { dir: string; add: (rel: string, text: string) => void }

/** A fresh tree with ONLY the admin client in it — every arm below adds the shape it needs. */
function makeFixture(): Fixture {
  const dir = mkdtempSync(path.join(tmpdir(), 'client-boundary-'))
  const add = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }
  add('lib/supabase/admin.ts', "export const admin = 'service-role'\n")
  return { dir, add }
}

function withFixture(fn: (fx: Fixture) => void) {
  const fx = makeFixture()
  try { fn(fx) } finally { rmSync(fx.dir, { recursive: true, force: true }) }
}

describe('check:client-boundary — the arms that must FAIL', () => {
  it('names a client entry point that reaches the admin client through an ordinary module', () => {
    withFixture((fx) => {
      // The real shape: never a client component calling the admin client on purpose, but a
      // client component importing a CONSTANT out of a module that also opens it (the header's
      // "eleven separate paths"). Two hops, so the transitive walk is what is being proven.
      fx.add('lib/vocab.ts', `import { admin } from '${ADMIN_SPEC}'\nexport const KINDS = ['a', 'b']\nexport { admin }\n`)
      fx.add('components/leak.tsx', "'use client'\nimport { KINDS } from '@/lib/vocab'\nexport function Leak() { return KINDS.length }\n")
      const { code, out } = run(fx.dir)
      expect(code).toBe(1)
      expect(out).toContain('1 client entry point(s) reach the service-role client')
      expect(out).toContain('components/leak.tsx')
      expect(out).toContain('lib/vocab.ts')
      expect(out).toContain('lib/supabase/admin.ts')
    })
  })

  it('follows a RELATIVE import as well as an `@/` one', () => {
    withFixture((fx) => {
      fx.add('components/nearby/vocab.ts', "import '../../lib/supabase/admin'\nexport const X = 1\n")
      fx.add('components/nearby/leak.tsx', "'use client'\nimport { X } from './vocab'\nexport const y = X\n")
      const { code, out } = run(fx.dir)
      expect(code).toBe(1)
      expect(out).toContain('components/nearby/leak.tsx')
    })
  })

  it('names a client entry point that imports a `server-only` module (the build fails on these)', () => {
    withFixture((fx) => {
      fx.add('lib/guarded.ts', "import 'server-only'\nexport const SECRET_SHAPE = 1\n")
      fx.add('components/touch.tsx', "'use client'\nimport { SECRET_SHAPE } from '@/lib/guarded'\nexport const z = SECRET_SHAPE\n")
      const { code, out } = run(fx.dir)
      expect(code).toBe(1)
      expect(out).toContain('import a `server-only` module')
      expect(out).toContain('components/touch.tsx')
    })
  })

  it('does NOT count a `use server` action as a path (a Server Action is a stub on the client)', () => {
    withFixture((fx) => {
      fx.add('lib/actions.ts', `'use server'\nimport { admin } from '${ADMIN_SPEC}'\nexport async function act() { return admin }\n`)
      fx.add('components/caller.tsx', "'use client'\nimport { act } from '@/lib/actions'\nexport const c = act\n")
      const { out } = run(fx.dir)
      // The fixture is too small to pass the floor, so the exit code is 1 either way; what is
      // asserted is that the LEAK arm stayed silent. Discriminating the two is the reason the
      // guard reports leaks before floors.
      expect(out).not.toContain('reach the service-role client')
      expect(out).not.toContain('server-only')
    })
  })

  it('does NOT count a `import type` edge (erased at compile time, no runtime graph)', () => {
    withFixture((fx) => {
      fx.add('components/typed.tsx', `'use client'\nimport type { admin } from '${ADMIN_SPEC}'\nexport const t: typeof admin = 'x'\n`)
      const { out } = run(fx.dir)
      expect(out).not.toContain('reach the service-role client')
    })
  })

  it('prints a DYNAMIC import as a note, not a finding (the documented separate-chunk mitigation)', () => {
    withFixture((fx) => {
      fx.add('lib/lazy.ts', `export async function open() { const m = await import('${ADMIN_SPEC}'); return m.admin }\n`)
      fx.add('components/lazy-user.tsx', "'use client'\nimport { open } from '@/lib/lazy'\nexport const o = open\n")
      const { out } = run(fx.dir)
      expect(out).not.toContain('reach the service-role client')
      expect(out).toContain('DYNAMIC import')
      expect(out).toContain('lib/lazy.ts')
    })
  })
})

describe('check:client-boundary — it cannot pass over nothing', () => {
  it('FAILS on a tree with the admin client and nothing else, naming the floor', () => {
    withFixture((fx) => {
      const { code, out } = run(fx.dir)
      expect(code).toBe(1)
      expect(out).toContain('walked only 1 module(s) and found 0 client entry point(s)')
      expect(out).toContain('expected at least')
      expect(out).toContain('ADR-962')
      expect(out).not.toContain('✓ client/server boundary')
    })
  })

  it('FAILS on a tree with many modules but too few client entry points', () => {
    withFixture((fx) => {
      // Above MIN_MODULES, below MIN_CLIENT_ENTRYPOINTS: proves the two floors are independent,
      // and that "the walk read a lot of files" is not accepted as "the walk saw the client set".
      for (let i = 0; i < 2600; i++) fx.add(`lib/ballast/m${i}.ts`, `export const m${i} = ${i}\n`)
      const { code, out } = run(fx.dir)
      expect(code).toBe(1)
      expect(out).toContain('found 0 client entry point(s)')
      expect(out).not.toContain('✓ client/server boundary')
    })
  })

  it('exits 79 PROBE_INDETERMINATE, not 0, on a tree with no admin client at all', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'client-boundary-empty-'))
    try {
      mkdirSync(path.join(dir, 'lib'))
      const { code, out } = run(dir)
      expect(code).toBe(79)
      expect(out).toContain('PROBE_INDETERMINATE')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('check:client-boundary — the tree as committed', () => {
  const real = run(ROOT)

  it('exits 0 and prints the reading', () => {
    expect(real.code, real.out).toBe(0)
    expect(real.out).toContain('✓ client/server boundary:')
    expect(real.out).toContain('none reach lib/supabase/admin.ts')
  })

  it('has its floors set BELOW the live reading, not at it', () => {
    // Read the constants from the script source and the reading from its own ✓ line. A floor
    // that equals today's reading fails the next honest deletion; one above it fails now. The
    // reading is parsed rather than hard-coded so this test does not become a second number to
    // keep in sync — only the script's own comment carries the 2026-09-04 figure.
    const src = readFileSync(GUARD, 'utf8')
    const minClient = Number(/MIN_CLIENT_ENTRYPOINTS = (\d+)/.exec(src)?.[1])
    const minModules = Number(/MIN_MODULES = (\d+)/.exec(src)?.[1])
    const clients = Number(/(\d+) client entry points, none reach/.exec(real.out)?.[1])
    const modules = Number(/\((\d+) modules walked/.exec(real.out)?.[1])
    expect(minClient).toBeGreaterThan(0)
    expect(minModules).toBeGreaterThan(0)
    expect(clients).toBeGreaterThan(minClient)
    expect(modules).toBeGreaterThan(minModules)
    // And not absurdly low either: a floor at 1 is the vacuous pass with extra steps.
    expect(minClient).toBeGreaterThan(clients / 2)
    expect(minModules).toBeGreaterThan(modules / 2)
  })
})

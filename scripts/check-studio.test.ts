import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runCheck, corpus, corpusFloorFailure, MIN_KERNEL_FILES, MIN_STUDIO_FILES, WHY } from './check-studio.mjs'

// The LAYERING half of the Studio contract (ADR-986 · docs/STUDIO.md), moved out of the CI guards
// array on 2026-08-12 and into vitest.
//
// 🔴 WHY IT LIVES HERE AND NOT IN AN ARRAY. This is the guard that proves the point. `check:studio`
// shipped as a package.json script in PR #2098 and was added to no CI array, so the contract
// AGENTS.md calls "machine-enforced" was enforced by nothing for that PR's whole life. Vitest
// AUTO-DISCOVERS `*.test.ts`; there is no second edit to remember and no list to fall off.
//
// The runtime half — every manifest is well formed, uses known field kinds, and can clear its own
// commercial facts — already lived beside the catalog in lib/studio/registry.test.ts. Together they
// are the whole contract: that file catches "a manifest was declared wrong", this one catches "the
// layering was broken".
//
// `node scripts/check-studio.mjs` still prints the friendly report with the fix instructions; the
// script is the implementation, this is the enforcement.

describe('check-studio · the live tree', () => {
  it('refuses to measure a corpus it could not read (the non-triviality floor)', () => {
    // 🔴 MEASURED 2026-08-12: with the repo tree absent this guard printed "✓ Studio contract: the
    // kernel is pure and entity-blind" and exited 0. Empty walk, empty loops, empty violations,
    // success branch. The floor is what separates "I looked and it was fine" from "I never looked",
    // and it is asserted here so moving the guard into vitest cannot quietly drop it.
    expect(corpusFloorFailure()).toBeNull()
    const { kernelFiles, studioFiles } = corpus()
    expect(kernelFiles.length).toBeGreaterThanOrEqual(MIN_KERNEL_FILES)
    expect(studioFiles.length).toBeGreaterThanOrEqual(MIN_STUDIO_FILES)
  })

  it('the kernel is pure and entity-blind, and no surface hand-rolls a field control', () => {
    const violations: { kind: keyof typeof WHY; file: string; line: number; text: string }[] = runCheck()
    const report = violations.map((v) => `  • ${v.file}:${v.line} — ${WHY[v.kind]}\n      ${v.text}`).join('\n')
    expect(violations, `\n${report}\n`).toEqual([])
  })
})

// ── THE NEGATIVE CONTROL (scan2 L8-03, 2026-09-05) ──────────────────────────────────────────
// The two tests above prove the live tree is clean and the floor is real. Neither proves the
// DETECTOR still matches anything: a kernel file importing an entity is caught only if
// KERNEL_REACHES_ENTITY still matches today's import syntax, and until this block nothing checked
// that it does. `runCheck(root)` now takes the tree to measure, so the same regexes run here against
// a fixture with one planted violation per arm, written in the exact syntax the live kernel and
// entities use (`import { X } from '@/lib/studio/entities/event'`, `import type { … } from
// 'react'`), plus the two shapes that must NOT fire: the field kit itself, and a `studio-ok` line.

const fixtures: string[] = []
afterAll(() => {
  for (const d of fixtures) rmSync(d, { recursive: true, force: true })
})

function makeStudioTree(planted: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-studio-'))
  fixtures.push(dir)
  const write = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }
  write(
    'lib/studio/kernel/manifest.ts',
    planted
      ? "import { EVENT_MANIFEST } from '@/lib/studio/entities/event'\nimport type { Catalog } from '../registry'\nexport type FieldDef = { kind: string }\n"
      : "export type FieldDef = { kind: string }\n",
  )
  write(
    'lib/studio/kernel/review-kernel.ts',
    planted
      ? "import type { ReactNode } from 'react'\nimport { REPEAT_ITEM_SELF, type EntityManifest } from './manifest'\nexport const x = 1\n"
      : "import { REPEAT_ITEM_SELF, type EntityManifest } from './manifest'\nexport const x = 1\n",
  )
  write('lib/studio/kernel/moods.ts', "import type { FieldDef } from './manifest'\nexport const MOODS = ['calm'] as const\n")
  // The kernel's own tests import entities freely and must never be walked.
  write('lib/studio/kernel/review-kernel.test.ts', "import { EVENT_MANIFEST } from '@/lib/studio/entities/event'\n")
  for (let i = 0; i < 9; i++) write(`components/studio/spark/step-${i}.tsx`, `export function Step${i}() { return null }\n`)
  // The kit is the ONE place a field control is styled: same constant, must not fire.
  write('components/studio/spark/field/input.tsx', "const FIELD = 'w-full rounded-xl border-line px-3'\nexport { FIELD }\n")
  // An annotated exception must not fire either.
  write('components/studio/spark/annotated.tsx', "const FIELD = 'w-full rounded-xl border-line px-3' // studio-ok: legacy preview\n")
  if (planted) write('components/studio/practice/tag-spark.tsx', "const FIELD = 'w-full rounded-xl border-line px-3'\nexport { FIELD }\n")
  return dir
}

describe('check-studio · the detector fires on a planted violation (negative control)', () => {
  it('names every planted violation by file:line and kind, and nothing else', () => {
    const root = makeStudioTree(true)
    expect(corpusFloorFailure(root)).toBeNull()
    const violations: { kind: keyof typeof WHY; file: string; line: number; text: string }[] = runCheck(root)
    expect(violations.map(({ kind, file, line }) => ({ kind, file, line }))).toEqual([
      { kind: 'boundary', file: 'lib/studio/kernel/manifest.ts', line: 1 },
      { kind: 'boundary', file: 'lib/studio/kernel/manifest.ts', line: 2 },
      { kind: 'impure', file: 'lib/studio/kernel/review-kernel.ts', line: 1 },
      { kind: 'field-css', file: 'components/studio/practice/tag-spark.tsx', line: 1 },
    ])
  })

  it('the same tree with the plants removed is clean, so the fixture is discriminating', () => {
    const root = makeStudioTree(false)
    expect(corpusFloorFailure(root)).toBeNull()
    expect(runCheck(root)).toEqual([])
  })

  it('the floor fires on a tree with too few kernel files', () => {
    const root = makeStudioTree(false)
    rmSync(path.join(root, 'lib/studio/kernel/moods.ts'))
    expect(corpusFloorFailure(root)).toMatch(/refusing to pass over a corpus it could not read/)
    expect(corpus(root).kernelFiles.length).toBeLessThan(MIN_KERNEL_FILES)
  })
})

import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs guard script, no types
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

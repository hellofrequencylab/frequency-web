import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('checks five legacy Hunts invariants in an isolated process', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      'scripts/probes/hunts/legacy-seam-evidence.mjs',
    ],
    { encoding: 'utf8', timeout: 5_000 },
  )
  expect(output.trim().split('\n').filter((line) => line.startsWith('FH-002:'))).toHaveLength(5)
})

const runSeams = (...flags: string[]) => execFileSync(
  process.execPath,
  [
    '--experimental-strip-types',
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    'scripts/probes/hunts/legacy-seams.mjs',
    ...flags,
  ],
  { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] },
)

it('runs all five seams from the single entry and pins the last-unit race on both sides', () => {
  const lines = runSeams().trim().split('\n')
  expect(lines.filter((line) => line.startsWith('FH-002: '))).toHaveLength(6)
  expect(lines.find((line) => line.includes('(legacy, last unit of 1)'))).toContain('2 capture rows, 2 Zap awards. OVERSOLD by 1')
  expect(lines.find((line) => line.includes('(Hunt adapter, last unit of 1)'))).toContain('1 granted, 1 sold_out with terms, 1 grant record')
  expect(lines.at(-1)).toBe('FH-002: all five seams match their pinned records')
})

it('exits non-zero when the legacy cap is required to hold (the open FH-002S finding)', () => {
  expect(() => runSeams('--require-cap-held')).toThrow(/the cap of 1 admitted 2 members/)
})

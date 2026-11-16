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
  expect(lines.find((line) => line.includes('(legacy, last unit of 1)'))).toContain('1 accepted, 1 capture rows, 1 Zap awards. cap held')
  expect(lines.find((line) => line.includes('(Hunt adapter, last unit of 1)'))).toContain('1 granted, 1 sold_out with terms, 1 grant record')
  expect(lines.at(-1)).toBe('FH-002: all five seams match their pinned records')
})

it('still oversells on the fallback path until the claim function is applied', () => {
  const line = runSeams().split('\n').find((l) => l.includes('claim function not applied yet'))
  expect(line).toContain('2 accepted, 2 capture rows, 2 Zap awards')
})

it('exits zero when the legacy cap is required to hold (FH-002S)', () => {
  expect(runSeams('--require-cap-held').trim().split('\n').at(-1)).toBe('FH-002: all five seams hold and the legacy cap held')
})

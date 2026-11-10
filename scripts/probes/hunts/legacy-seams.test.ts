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

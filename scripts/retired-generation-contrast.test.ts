import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { ROLE_MINIMUM, STATES } from './check-contrast.mjs'
import { FREQUENCY_STATES } from './lib/contrast-frequency.mjs'
import { retiredGenerationContrast, liveContrastReport } from './probes/retired-generation-contrast.mjs'
const input = {
  resolver: readFileSync('lib/theme/server/resolve.ts', 'utf8'),
  registry: readFileSync('lib/theme/generations.ts', 'utf8'),
  css: readFileSync('app/globals.css', 'utf8'),
  floors: ROLE_MINIMUM, baseStates: STATES, frequencyStates: FREQUENCY_STATES,
}
it('holds actual retirement and live contrast state/floor contracts', () => {
  expect(retiredGenerationContrast(input)).toBe(true)
})
it.each([
  { resolver: input.resolver.replace('generation: DEFAULT_GENERATION', "generation: 'spacious'") },
  { resolver: input.resolver.replace("occasion: 'none'", "occasion: 'solstice'") },
  { registry: input.registry.replace("= 'balanced'", "= 'spacious'") },
  { css: input.css + '\n[data-generation="spacious"]{--type-scale:2}' },
  { css: input.css + '\n[data-occasion="solstice"]{--color-text:red}' },
  { floors: { ...ROLE_MINIMUM, body: 3 } },
  { floors: { ...ROLE_MINIMUM, aaa: 4.5 } },
  { baseStates: STATES.slice(1) },
  { frequencyStates: FREQUENCY_STATES.slice(1) },
])('rejects actual reactivation or live coverage/floor regression: %o', (change) => {
  expect(() => retiredGenerationContrast({ ...input, ...change })).toThrow()
})
it('requires successful measured CLI coverage rather than a fake pass', () => {
  expect(liveContrastReport('✓ Contrast gate: 758 token pairs across 9 render states meet their role minimum')).toBe(true)
  for (const report of ['ok', 'Contrast gate: 757 token pairs across 9 render states', 'Contrast gate: 758 token pairs across 8 render states']) expect(() => liveContrastReport(report)).toThrow()
})

it('executes the real gate through a spaced Unicode symlink and stays silent on import', () => {
  const dir = mkdtempSync(join(tmpdir(), 'Frequency gate é '))
  const script = resolve('scripts/probes/retired-generation-contrast.mjs')
  try {
    const alias = join(dir, 'contrast proof é.mjs')
    symlinkSync(script, alias)
    expect(execFileSync(process.execPath, [alias], { encoding: 'utf8' })).toContain('actual live contrast gate passes')
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(script).href)})`], { encoding: 'utf8' })).toBe('')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// LIVE-658 is historical: HYG-187 retired the non-rendered preset CSS.
// Preserve its real consequence: no preset reactivation and no loss of live contrast proof.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { ROLE_MINIMUM, STATES } from '../check-contrast.mjs'
import { FREQUENCY_STATES } from '../lib/contrast-frequency.mjs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'

export function retiredGenerationContrast({ resolver, registry, css, floors, baseStates, frequencyStates }) {
  const source = resolver.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  assert.match(source, /return\s*\{\s*skin:\s*resolveSkin\(cookie\.skin\s*\?\?\s*null\),\s*generation:\s*DEFAULT_GENERATION,\s*occasion:\s*'none'\s*\}/, 'Frequency must keep retired axes inactive')
  assert.match(registry, /DEFAULT_GENERATION:\s*GenerationId\s*=\s*'balanced'/, 'default remains the balanced no-op')
  assert.doesNotMatch(css, /\[data-(?:generation|occasion)[^\]]*\]/, 'retired preset selectors returned')
  assert.deepEqual(floors, { body: 4.5, large: 3, edge: 3, aaa: 7 }, 'live contrast role floors changed')
  assert.equal(baseStates.length, 5, 'base/skin/light-lock coverage changed')
  assert.equal(frequencyStates.length, 4, 'live Frequency room/mode coverage changed')
  return true
}
export function liveContrastReport(report) {
  const summary = report.match(/Contrast gate: (\d+) token pairs across (\d+) render states/)
  assert.ok(summary, 'actual contrast CLI did not report success')
  assert.ok(Number(summary[1]) >= 758, 'live contrast pair coverage shrank')
  assert.equal(Number(summary[2]), 9, 'live render state coverage changed')
  return true
}
if (invokedDirectly(import.meta.url)) {
  retiredGenerationContrast({
    resolver: readFileSync('lib/theme/server/resolve.ts', 'utf8'),
    registry: readFileSync('lib/theme/generations.ts', 'utf8'),
    css: readFileSync('app/globals.css', 'utf8'),
    floors: ROLE_MINIMUM, baseStates: STATES, frequencyStates: FREQUENCY_STATES,
  })
  const result = spawnSync(process.execPath, ['scripts/check-contrast.mjs'], { encoding: 'utf8' })
  assert.equal(result.status, 0, `actual live contrast gate failed: ${result.stderr || result.stdout}`)
  liveContrastReport(result.stdout)
  console.log('Historical generation overlays retired; actual live contrast gate passes at unchanged floors (at least 758 pairs, 9 states)')
}

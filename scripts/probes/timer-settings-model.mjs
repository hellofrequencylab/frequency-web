// LIVE-2240: the Mindless timer has ONE settings model, saved on change. Source contract: the
// model exists, completeSession no longer derives prefs from the sit that ended, both engines read
// and write through the model and keep no storage key of their own, and the member minute band
// is one constant. The unit tests in lib/on-air/timer-settings.test.ts run in the test job.
import { readFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = (p) => readFileSync(p, 'utf8')
assert.ok(existsSync('lib/on-air/timer-settings.ts'), 'lib/on-air/timer-settings.ts must exist')
const model = read('lib/on-air/timer-settings.ts')
for (const name of ['MINUTE_MAX', 'readTimerSettings', 'writeTimerSettings', 'settingsFromPrefs', 'sanitizePrefsPatch', 'diffSettings']) {
  assert.ok(new RegExp(`export (function|const) ${name}\\b`).test(model), `timer-settings must export ${name}`)
}
const actions = read('app/(main)/on-air/actions.ts')
assert.ok(!actions.includes("pattern: input.pattern ?? 'box'"), 'completeSession must not derive the saved pattern from the sit that ended')
assert.ok(!/minutes: Math\.max\(1, Math\.round\(seconds \/ 60\)\)/.test(actions), 'completeSession must not store the remembered length from the sit that ended')
assert.ok(/export async function saveOnAirPrefs\(/.test(actions), 'saveOnAirPrefs must exist (save on change)')
assert.ok(/mergeProfileMetaPath\([\s\S]{0,80}\['onAir'\]/.test(actions), 'saveOnAirPrefs must merge only the onAir key')
for (const file of ['components/on-air/session.tsx', 'components/on-air/movement-session.tsx']) {
  const text = read(file)
  assert.ok(!text.includes("'fq_mindless_setup'") && !text.includes("'fq_movement_setup'"), `${file}: no engine-owned storage key`)
  assert.ok(text.includes("from './use-timer-settings'"), `${file}: must read and save through the settings model`)
}
assert.ok(!read('components/on-air/movement-session.tsx').includes('Math.min(240,'), 'movement steppers must use the one minute band')
console.log('Timer settings model contract holds (LIVE-2240).')

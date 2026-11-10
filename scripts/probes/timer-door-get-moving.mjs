// LIVE-2242: every Get Moving setting the movement engine owns is reachable from the Mindless door
// itself, as sub-menus that expand in place, and the door's single Go is the only way in: the
// "More settings" second screen is gone for both modes. Source contract; the render test is
// components/on-air/compact-setup.test.tsx in the test job.
import { readFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = (p) => readFileSync(p, 'utf8')
const door = read('components/on-air/compact-setup.tsx')
assert.ok(existsSync('components/on-air/door/move-sections.tsx'), 'the Get Moving sub-menus must exist')
assert.ok(door.includes("from './door/move-sections'"), 'the door must render the Get Moving sub-menus')
assert.ok(door.includes('MOVEMENT_MODES.map'), 'the door must offer every Get Moving mode')
assert.ok(door.includes('moveConfig:'), 'the door must forward the composed plan')
assert.ok(!door.includes('More settings'), 'the second settings screen must be gone from the door')
assert.ok(!door.includes('onAdvanced'), 'the door must have one Go, not an advanced exit')
const sections = read('components/on-air/door/move-sections.tsx')
for (const name of ['"Plan"', '"Cues"']) assert.ok(sections.includes(`name=${name}`), `sub-menu ${name} must exist`)
for (const control of ['YOGA_PRESETS', 'STRENGTH_PRESETS', 'withMoveIntervalMin', 'SoundSection', 'FeelSection', 'clampSeconds', 'clampRounds']) {
  assert.ok(sections.includes(control), `the door must carry ${control}`)
}
const engine = read('components/on-air/movement-session.tsx')
assert.ok(/initialConfig\?: MovementConfig \| null/.test(engine), 'the movement engine must accept the door plan')
assert.ok(!engine.includes("bellToneBySlug('soft')"), 'the movement engine must not hardcode the bell voice')
assert.ok(engine.includes('settings.cues.haptics'), 'vibration must follow the Feel setting')
assert.ok(engine.includes('settings.cues.moveBell'), 'cue sound must follow the Get Moving Sound setting')
assert.ok(read('lib/on-air/timer-settings.ts').includes("typeof p.moveBell === 'boolean' ? p.moveBell : true"), 'Get Moving cues default on (owner 2026-11-10)')
const provider = read('components/on-air/mindless.tsx')
assert.ok(provider.includes('initialConfig={state.moveConfig}'), 'the provider must hand the door plan to the engine')
assert.ok(!provider.includes('onAdvanced'), 'the provider must not keep an advanced path')
console.log('The Get Moving door contract holds (LIVE-2242).')

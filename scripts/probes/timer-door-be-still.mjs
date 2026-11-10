// LIVE-2241: every Be Still setting the sit engine owns is reachable from the Mindless door itself,
// as sub-menus that expand in place, never a second screen. Source contract; the render test is
// components/on-air/compact-setup.test.tsx in the test job.
import { readFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = (p) => readFileSync(p, 'utf8')
const door = read('components/on-air/compact-setup.tsx')
assert.ok(existsSync('components/on-air/door/still-sections.tsx'), 'the Be Still sub-menus must exist')
assert.ok(door.includes("from './door/still-sections'"), 'the door must render the Be Still sub-menus')
assert.ok(door.includes('SESSION_MODE_ORDER'), 'the door must offer every Be Still sub-mode')
assert.ok(door.includes('stillMode'), 'the door must forward the chosen sub-mode')
const sections = read('components/on-air/door/still-sections.tsx')
for (const name of ['"Breath"', '"Sound"', '"Ambient"', '"Feel"']) assert.ok(sections.includes(`name=${name}`), `sub-menu ${name} must exist`)
for (const control of ['BREATH_PATTERNS', 'BELL_TONES', 'BELL_INTERVALS', 'AMBIENT_TRACKS', 'WARMUP_PRESETS', 'showBreathCount', 'haptics', 'endBell']) {
  assert.ok(sections.includes(control), `the door must carry ${control}`)
}
const engine = read('components/on-air/session.tsx')
assert.ok(/initialMode\?: SessionMode/.test(engine), 'the sit engine must accept the door sub-mode')
assert.ok(engine.includes('showCount={settings.cues.showBreathCount}'), 'the breath count toggle must reach the visualizer')
console.log('The Be Still door contract holds (LIVE-2241).')

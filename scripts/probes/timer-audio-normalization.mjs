// LIVE-2246: the timer cues share one normalized audio engine. Source contract: every bell runs
// through the bell bus, compressor and master limiter, never straight to the speaker; every voice
// is scaled to one peak and pitch-weighted; the ambient loop is trimmed per track by a gated RMS
// toward one target and reaches the speaker through the same limiter; the bell and the ambient
// loop share the one perceptual volume curve, and no caller multiplies the slider by hand. The
// unit tests in lib/timer-audio.test.ts run in the test job.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = (p) => readFileSync(p, 'utf8')

const audio = read('lib/timer-audio.ts')
assert.ok(/export function limiterFor\(/.test(audio), 'timer-audio must export the master limiter')
assert.ok(/export function strikePeaks\(/.test(audio), 'timer-audio must export the pure strike normalization')
assert.ok(/limiter\.connect\(ctx\.destination\)/.test(audio), 'only the limiter reaches the destination')
assert.ok(!/gain\.connect\(ctx\.destination\)/.test(audio), 'a bell partial never connects to the destination')
assert.ok(/gain\.connect\(busFor\(ctx\)\.bells\)/.test(audio), 'bell partials connect to the bell bus')
assert.ok(/createDynamicsCompressor\(\)/.test(audio), 'the bell bus has a compressor')
assert.ok(/volumeCurve\(volume\)/.test(audio), 'the bell maps the slider through the volume curve')

const onAir = read('lib/on-air.ts')
assert.ok(/export function volumeCurve\(/.test(onAir), 'lib/on-air must export volumeCurve')
assert.ok(!/bellVolumeScale|BELL_MAX_GAIN/.test(onAir), 'the linear bell multiplier is gone')

const ambient = read('lib/on-air-ambient.ts')
assert.ok(/export function measureTrack\(/.test(ambient), 'the ambient module measures each track')
assert.ok(/GATE_DB/.test(ambient) && /TARGET_RMS_DB = -20/.test(ambient), 'the ambient trim is a gated RMS toward -20 dBFS')
assert.ok(/limiterFor\(ctx\)/.test(ambient), 'the ambient loop reaches the speaker through the master limiter')
assert.ok(/volumeCurve\(/.test(ambient) && !/AMBIENT_MAX_GAIN/.test(ambient), 'the ambient volume rides the shared curve')

for (const file of ['components/on-air/session.tsx', 'components/on-air/movement-session.tsx', 'components/on-air/door/cue-sections.tsx']) {
  const text = read(file)
  assert.ok(!text.includes('bellVolumeScale'), `${file}: no caller scales the slider by hand`)
}
assert.ok(!/countBeep\(audio\.current, 1,/.test(read('components/on-air/session.tsx')), 'the sit count tick follows the bell volume')
console.log('Timer audio normalization contract holds (LIVE-2246).')

// LIVE-2244: the seams between the Mindless door, the engines and the reveal that the timer dig
// listed. Source contract; the behaviour tests are lib/movement.test.ts and the on-air suites.
import { readFileSync, existsSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = (p) => readFileSync(p, 'utf8')
// 1. Audio is unlocked on the door's Go tap and the engines seed from it (they auto-start from an effect).
assert.ok(existsSync('lib/on-air/timer-audio-unlock.ts'), 'the shared unlock module must exist')
assert.ok(read('components/on-air/compact-setup.tsx').includes('unlockTimerAudio()'), 'the door must unlock audio on Go')
for (const engine of ['components/on-air/session.tsx', 'components/on-air/movement-session.tsx']) {
  const src = read(engine)
  assert.ok(src.includes('takeUnlockedAudio()'), `${engine} must seed its context from the door`)
  assert.ok(!/audio\.current = audio\.current \?\? new AudioContext\(\)/.test(src), `${engine} must not create a context before trying the unlocked one`)
}
// 2. Reveal links drop the overlay through onAction, never a page under a takeover.
const reveal = read('components/on-air/reveal.tsx')
assert.ok(/href="\/crew\/leaderboard" onClick=\{\(\) => onAction\?\.\(\)\}/.test(reveal), 'Full stats must go through onAction')
assert.ok(/href="\/on-air\/dispatches" onClick=\{\(\) => onAction\?\.\(\)\}/.test(reveal), 'Past Dispatches must go through onAction')
// 3. Minute cues keep counting past a plan's end.
assert.ok(read('lib/movement.ts').includes('phaseElapsed: (last?.seconds ?? 0) + (t - acc)'), 'phaseElapsed must keep growing past the end')
// 4. Dead code is gone.
assert.ok(!read('lib/movement.ts').includes('intervalMin?: number'), 'the unused intervalMin builder option must be gone')
assert.ok(!read('components/on-air/session.tsx').includes('void id'), 'handOffToMovement must not carry an unused id')
assert.ok(!read('app/(main)/on-air/actions.ts').includes('bellEveryMin?: number'), 'completeSession must not accept cue prefs it no longer stores')
console.log('The timer seams hold (LIVE-2244).')

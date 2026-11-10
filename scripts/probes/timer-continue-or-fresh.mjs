// LIVE-2243: a practice with a partial today no longer resumes silently. The door says so, offers
// Continue (the remaining minutes) or Start fresh, and both engines honour the choice; a length the
// member chose on the door survives a sub-mode change. Source contract; the render test is
// components/on-air/compact-setup.test.tsx in the test job.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const read = (p) => readFileSync(p, 'utf8')
const door = read('components/on-air/compact-setup.tsx')
assert.ok(door.includes("'Continue or start fresh'"), 'the door must offer Continue or Start fresh')
assert.ok(door.includes('partialToday'), 'the door must read the partial today')
assert.ok(door.includes('fresh: true'), 'the door must forward Start fresh')
assert.ok(door.includes('`Continue, ${remainingMin} min left`'), 'Go must read Continue, N min left while continuing')
const provider = read('components/on-air/mindless.tsx')
assert.ok(provider.includes('fresh: choice.fresh'), 'the provider must carry the door choice')
assert.ok((provider.match(/fresh=\{state\.fresh\}/g) ?? []).length === 2, 'both engines must receive fresh')
for (const engine of ['components/on-air/session.tsx', 'components/on-air/movement-session.tsx']) {
  const src = read(engine)
  assert.ok(src.includes('fresh?: boolean'), `${engine} must accept fresh`)
  assert.ok(src.includes('if (fresh && id === initialId) return null'), `${engine} must drop the partial on a fresh start`)
}
assert.ok(read('components/on-air/session.tsx').includes('!(minutesOverride && minutesOverride > 0)'), 'a door length must survive a sub-mode change')
assert.ok(read('components/frequency/members/mindless/mindless-door.tsx').includes('fresh: choice.fresh'), 'the route door must carry fresh')
console.log('Continue or Start fresh holds (LIVE-2243).')
